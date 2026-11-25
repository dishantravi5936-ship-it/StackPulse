import { Router } from 'express';
import endpointService from '../services/endpoint.service';
import incidentService from '../services/incident.service';
import monitoringService from '../services/monitoring.service';

const router = Router();

router.get('/:slug', (req, res) => {
  const endpoint = endpointService.getByPublicSlug(req.params.slug);
  if (!endpoint) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Public status page not found' } });
    return;
  }
  res.json({
    data: {
      endpoint: monitoringService.getPublicSummary(endpoint.id),
      incidents: incidentService.listPublicForEndpoint(endpoint.id).slice(0, 20),
      generatedAt: new Date().toISOString(),
    },
  });
});

export default router;
