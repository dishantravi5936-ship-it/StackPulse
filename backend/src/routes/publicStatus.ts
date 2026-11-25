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
  const generatedAt = new Date();
  res.json({
    data: {
      endpoint: monitoringService.getPublicSummary(endpoint.id),
      incidents: incidentService.listPublicForEndpoint(endpoint.id).slice(0, 20),
      history: monitoringService.listPublicHistory(
        endpoint.id,
        new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000).toISOString()
      ),
      generatedAt: generatedAt.toISOString(),
    },
  });
});

export default router;
