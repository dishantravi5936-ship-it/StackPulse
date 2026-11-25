import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import authService from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts; try again later' } },
});

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes'
  ),
  bootstrapToken: z.string().max(512).optional(),
});
const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes'
  ),
});

router.post('/register', authLimiter, validate(credentialsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body.email, req.body.password, req.body.bootstrapToken);
    res.status(201).json({ token: result.token, user: result.user, data: result });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' } });
      return;
    }
    next(error);
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    if (!result) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
      return;
    }
    res.json({ token: result.token, user: result.user, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
