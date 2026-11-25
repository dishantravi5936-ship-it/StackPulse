import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import endpointService from '../services/endpoint.service';
import incidentService from '../services/incident.service';

const router = Router();

router.use(requireAuth, requireAdmin);

const endpointSchema = z.object({
  name: z.string().min(1).max(100),
  group_name: z.string().min(1).max(50).default('default'),
  url: z.string().url(),
  interval_seconds: z.union([z.literal(30), z.literal(60), z.literal(120)]),
});

function httpError(err: unknown, res: Response, next: NextFunction): void {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status: number }).status) || 500;
    const message = err instanceof Error ? err.message : 'Request failed';
    res.status(status).json({ error: message });
    return;
  }
  next(err);
}

router.get('/endpoints', (req: AuthenticatedRequest, res: Response) => {
  res.json(endpointService.listOwned(req.user!.id));
});

router.post('/endpoints', validate(endpointSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const created = await endpointService.create(req.user!.id, req.body);
    res.status(201).json(created);
  } catch (err) {
    httpError(err, res, next);
  }
});

router.put('/endpoints/:id', validate(endpointSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const updated = await endpointService.update(req.params.id, req.user!.id, req.body);
    res.json(updated);
  } catch (err) {
    httpError(err, res, next);
  }
});

router.delete('/endpoints/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await endpointService.remove(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    httpError(err, res, next);
  }
});

const incidentSchema = z.object({
  endpoint_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['open', 'investigating', 'resolved']).default('open'),
});

router.get('/incidents', (req: AuthenticatedRequest, res: Response) => {
  res.json(incidentService.listForOwner(req.user!.id));
});

router.post('/incidents', validate(incidentSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const created = incidentService.create(req.user!.id, req.body);
    res.status(201).json(created);
  } catch (err) {
    httpError(err, res, next);
  }
});

router.put('/incidents/:id', validate(incidentSchema.partial()), (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const updated = incidentService.update(req.params.id, req.user!.id, req.body);
    res.json(updated);
  } catch (err) {
    httpError(err, res, next);
  }
});

export default router;
