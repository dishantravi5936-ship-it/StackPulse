import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../utils/logger';

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorHandler(err: Error & { status?: number; code?: string }, req: Request, res: Response, _next: NextFunction): void {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  const code = status === 500 ? 'INTERNAL_ERROR' : err.code ?? 'REQUEST_FAILED';
  if (status >= 500) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path });
  }
  res.status(status).json({
    error: {
      code,
      message: status === 500 ? 'Internal server error' : err.message,
    },
  });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
  });
}

