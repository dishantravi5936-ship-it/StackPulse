import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import endpointService from '../services/endpoint.service';
import incidentService from '../services/incident.service';
import notificationService from '../services/notification.service';
import monitoringService from '../services/monitoring.service';
import trustPulseService from '../services/trustpulse.service';
import incidentLensService from '../services/incidentlens.service';
import tlsService from '../services/tls.service';
import failureVerificationService from '../services/failureVerification.service';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  const endpoints = endpointService.listOwned(req.user!.id);
  res.json({
    data: {
      endpoints: endpoints.map((endpoint) => {
        const latestCheck = monitoringService.latestForEndpoint(endpoint.id) ?? null;
        const trustPulse = trustPulseService.getEndpointSnapshot(endpoint.id);
        const tls = tlsService.getLatestResult(endpoint.id);
        return {
          ...endpoint,
          latestCheck,
          trustPulse,
          incidentLens: incidentLensService.diagnoseFromMonitoring(latestCheck, trustPulse, tls),
          latestVerification: failureVerificationService.getLatest(endpoint.id),
        };
      }),
      incidents: incidentService.listActiveForOwner(req.user!.id),
      notifications: notificationService.listForOwner(req.user!.id, 20),
      monitoringEngines: endpointService.getEngineHealth(),
      generatedAt: new Date().toISOString(),
    },
  });
});

export default router;
