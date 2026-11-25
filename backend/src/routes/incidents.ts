import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import incidentService from '../services/incident.service';
const router = Router();

router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  res.json({ data: incidentService.listForOwner(req.user!.id) });
});

router.get('/:id', (req: AuthenticatedRequest, res) => {
  const detail = incidentService.getDetail(req.params.id, req.user!.id);
  if (!detail) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    return;
  }
  res.json({ data: detail });
});

export default router;
