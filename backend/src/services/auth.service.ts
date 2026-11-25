import { createHash, timingSafeEqual } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';

const SALT_ROUNDS = 12;

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'change_me_to_a_long_random_secret_at_least_32_chars') {
    throw new Error('JWT_SECRET must be configured with at least 32 non-placeholder characters');
  }
  return secret;
}

class AuthService {
  assertConfiguration(): void {
    getJwtSecret();
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  signToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
    return jwt.sign({ email: user.email, role: user.role }, getJwtSecret(), {
      subject: user.id,
      expiresIn: 12 * 60 * 60,
      issuer: 'stackpulse',
      audience: 'stackpulse-api',
      algorithm: 'HS256',
    });
  }

  verifyToken(token: string): User {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'stackpulse',
      audience: 'stackpulse-api',
    }) as JwtPayload;
    if (!payload.sub || typeof payload.email !== 'string' || (payload.role !== 'admin' && payload.role !== 'user')) {
      throw new Error('Invalid token claims');
    }

    const user = db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?').get(payload.sub) as User | undefined;
    if (!user || user.email !== payload.email || user.role !== payload.role) {
      throw new Error('Token identity is no longer valid');
    }
    return user;
  }

  async findByEmail(email: string): Promise<(User & { password_hash: string }) | undefined> {
    return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim()) as
      | (User & { password_hash: string })
      | undefined;
  }

  async register(email: string, password: string, bootstrapToken?: string): Promise<{ user: User; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(password);
    const createdAt = nowISO();
    const user = db.transaction(() => {
      const count = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
      const role: User['role'] = count === 0 ? 'admin' : 'user';
      if (role === 'admin') {
        this.assertBootstrapToken(bootstrapToken);
      }
      const created: User = {
        id: generateId(),
        email: normalizedEmail,
        role,
        created_at: createdAt,
      };
      db.prepare('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(created.id, created.email, passwordHash, created.role, created.created_at);

      if (role === 'admin') {
        db.prepare('UPDATE endpoints SET owner_id = ? WHERE owner_id IS NULL').run(created.id);
        db.prepare('UPDATE incidents SET owner_id = ? WHERE owner_id IS NULL').run(created.id);
      }
      return created;
    })();

    return { user, token: this.signToken(user) };
  }

  private assertBootstrapToken(supplied: string | undefined): void {
    const configured = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!configured || configured.length < 32) {
      throw Object.assign(new Error('Administrator bootstrap is not configured'), {
        status: 503,
        code: 'ADMIN_BOOTSTRAP_NOT_CONFIGURED',
      });
    }
    if (!supplied) {
      throw Object.assign(new Error('Administrator bootstrap token is required'), {
        status: 403,
        code: 'ADMIN_BOOTSTRAP_REQUIRED',
      });
    }
    const expectedHash = createHash('sha256').update(configured).digest();
    const suppliedHash = createHash('sha256').update(supplied).digest();
    if (!timingSafeEqual(expectedHash, suppliedHash)) {
      throw Object.assign(new Error('Administrator bootstrap token is invalid'), {
        status: 403,
        code: 'ADMIN_BOOTSTRAP_INVALID',
      });
    }
  }

  async login(email: string, password: string): Promise<{ user: User; token: string } | null> {
    const user = await this.findByEmail(email);
    if (!user || !(await this.verifyPassword(password, user.password_hash))) {
      return null;
    }
    const publicUser: User = {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    };
    return { user: publicUser, token: this.signToken(publicUser) };
  }
}

export default new AuthService();
