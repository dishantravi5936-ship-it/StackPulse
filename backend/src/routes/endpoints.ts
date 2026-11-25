import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthenticatedRequest, requireAdmin, requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import endpointService from '../services/endpoint.service';
import monitoringService from '../services/monitoring.service';
import tlsService from '../services/tls.service';
import trustPulseService from '../services/trustpulse.service';
import incidentLensService from '../services/incidentlens.service';
import failureVerificationService from '../services/failureVerification.service';

const router = Router();
const endpointBody = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().url().max(2048),
  expected_content: z.string().trim().min(1).max(512).nullable().optional(),
  interval_seconds: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  group_name: z.string().trim().min(1).max(50).optional(),
  is_public: z.boolean().optional(),
});
const endpointPatch = endpointBody.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});
const verificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

function getIntelligence(
  endpointId: string,
  latestCheck: ReturnType<typeof monitoringService.latestForEndpoint> | null
) {
  const trustPulse = trustPulseService.getEndpointSnapshot(endpointId);
  const tls = tlsService.getLatestResult(endpointId);
  return {
    trustPulse,
    incidentLens: incidentLensService.diagnoseFromMonitoring(latestCheck ?? null, trustPulse, tls),
    latestVerification: failureVerificationService.getLatest(endpointId),
  };
}

function getLimit(value: unknown): number {
  const parsed = Number(value ?? 100);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 100;
}

router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  res.json({
    data: endpointService.listOwned(req.user!.id).map((endpoint) => {
      const latestCheck = monitoringService.latestForEndpoint(endpoint.id) ?? null;
      return { ...endpoint, latestCheck, ...getIntelligence(endpoint.id, latestCheck) };
    }),
  });
});

router.post('/', requireAdmin, validate(endpointBody), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const endpoint = await endpointService.create(req.user!.id, req.body);
  const initialCheck = await monitoringService.checkNow(endpoint.id);
  res.status(201).json({ data: { endpoint, latestCheck: initialCheck } });
}));

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const endpoint = endpointService.getOwned(req.params.id, req.user!.id);
  if (!endpoint) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    return;
  }
  const tls = endpoint.url.startsWith('https://') ? tlsService.getLatestResult(endpoint.id) : null;
  const latestCheck = monitoringService.latestForEndpoint(endpoint.id) ?? null;
  res.json({
    data: {
      endpoint,
      latestCheck,
      tls: endpoint.url.startsWith('https://')
        ? tls
          ? { ...tls, status: 'available' }
          : { status: 'unavailable', expiresAt: null, issuer: null, commonName: null, daysUntilExpiry: null }
        : { status: 'not_applicable', expiresAt: null, issuer: null, commonName: null, daysUntilExpiry: null },
      schedule: endpointService.getCurrentSchedule(endpoint.id) ?? null,
      ...getIntelligence(endpoint.id, latestCheck),
    },
  });
}));

router.patch('/:id', requireAdmin, validate(endpointPatch), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const endpoint = await endpointService.update(req.params.id, req.user!.id, req.body);
  res.json({ data: endpoint });
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  await endpointService.remove(req.params.id, req.user!.id);
  res.status(200).json({ data: { id: req.params.id, deleted: true } });
}));

router.post('/:id/pause', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({ data: await endpointService.pause(req.params.id, req.user!.id) });
}));

router.post('/:id/resume', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({ data: await endpointService.resume(req.params.id, req.user!.id) });
}));

router.get('/:id/checks', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const checks = endpointService.getChecks(req.params.id, req.user!.id, getLimit(req.query.limit));
  res.json({ data: checks });
}));

router.post('/:id/verify', requireAdmin, verificationLimiter, asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!endpointService.getOwned(req.params.id, req.user!.id)) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    return;
  }
  res.json({ data: await failureVerificationService.verify(req.params.id) });
}));

export default router;
