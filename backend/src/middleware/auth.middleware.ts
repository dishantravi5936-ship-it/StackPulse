import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth.service';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; role: 'admin' | 'user'; created_at: string };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } });
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = authService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator approval is required' } });
    return;
  }
  next();
}

