import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import incidentService from '../services/incident.service';
import endpointService from '../services/endpoint.service';
import failureVerificationService from '../services/failureVerification.service';
import incidentExplanationService from '../services/incidentExplanation.service';
import incidentLensService from '../services/incidentlens.service';
import monitoringService from '../services/monitoring.service';
import tlsService from '../services/tls.service';
import trustPulseService from '../services/trustpulse.service';

const router = Router();
const explanationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Incident explanations are limited to five requests per minute.' },
    });
  },
});

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

router.post('/:id/explain', explanationLimiter, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const incident = incidentService.getOwned(req.params.id, req.user!.id);
  if (!incident) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    return;
  }

  const endpoint = incident.endpoint_id ? endpointService.getById(incident.endpoint_id) : undefined;
  if (endpoint && endpoint.owner_id !== req.user!.id) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    return;
  }

  const latestCheck = endpoint ? monitoringService.latestForEndpoint(endpoint.id) ?? null : null;
  const trustPulse = endpoint
    ? trustPulseService.getEndpointSnapshot(endpoint.id)
    : { freshness: 'unknown' as const, monitoringCoveragePercent: null };
  const tls = endpoint?.url.startsWith('https://') ? tlsService.getLatestResult(endpoint.id) : null;
  const diagnosis = incidentLensService.diagnoseFromMonitoring(latestCheck, trustPulse, tls);
  const verification = endpoint ? failureVerificationService.getLatest(endpoint.id) : null;
  const evidence = incidentExplanationService.sanitizeEvidence({
    incident: {
      severity: incident.severity,
      status: incident.status,
      failureCount: incident.failure_count,
    },
    success: diagnosis.observedEvidence.success,
    httpStatus: diagnosis.observedEvidence.httpStatus,
    failureClassification: diagnosis.observedEvidence.failureClassification,
    failureCategory: diagnosis.failureCategory,
    freshness: diagnosis.observedEvidence.freshness,
    monitoringCoveragePercent: diagnosis.observedEvidence.monitoringCoveragePercent,
    tlsDaysUntilExpiry: diagnosis.observedEvidence.tlsDaysUntilExpiry,
    checkedAt: diagnosis.observedEvidence.checkedAt,
    verificationOutcome: verification?.outcome ?? null,
  });

  res.json({ data: await incidentExplanationService.explain(evidence, diagnosis) });
}));

export default router;
