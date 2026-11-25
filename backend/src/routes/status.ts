import { Router, Request, Response, NextFunction } from 'express';
import endpointService from '../services/endpoint.service';
import incidentService from '../services/incident.service';
import uptimeService from '../services/uptime.service';
import tlsService from '../services/tls.service';
import monitoringService from '../services/monitoring.service';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const endpoints = await Promise.all(endpointService.listPublicEnabled().map(async (endpoint) => {
    const latest = monitoringService.latestForEndpoint(endpoint.id);
    const uptime = await uptimeService.getForEndpoint(endpoint.id);
    return {
      id: endpoint.id,
      name: endpoint.name,
      group: endpoint.group_name,
      status: !latest ? 'unknown' : latest.success ? 'up' : 'down',
      latencyMs: latest?.latencyMs ?? null,
      lastChecked: latest?.checkedAt ?? null,
      uptime,
    };
  }));
  const hasDown = endpoints.some((endpoint) => endpoint.status === 'down');
  const hasUnknown = endpoints.some((endpoint) => endpoint.status === 'unknown');
  res.json({
    overall: hasDown ? 'outage' : hasUnknown ? 'degraded' : 'operational',
    endpoints,
    generatedAt: new Date().toISOString(),
  });
});

router.get('/incidents', (_req: Request, res: Response) => {
  res.json(incidentService.listActivePublic());
});

router.get('/:id/uptime', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoint = endpointService.getById(req.params.id);
    if (!endpoint?.public_slug) {
      res.status(404).json({ error: 'Endpoint not found' });
      return;
    }
    res.json(await uptimeService.getForEndpoint(endpoint.id));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoint = endpointService.getById(req.params.id);
    if (!endpoint?.public_slug) {
      res.status(404).json({ error: 'Endpoint not found' });
      return;
    }
    const tls = endpoint.url.startsWith('https://') ? tlsService.getLatestResult(endpoint.id) : null;
    res.json({
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        group: endpoint.group_name,
      },
      latest: monitoringService.latestForEndpoint(endpoint.id) ?? null,
      history: monitoringService.listForEndpoint(endpoint.id, 50),
      uptime: await uptimeService.getForEndpoint(endpoint.id),
      tls: endpoint.url.startsWith('https://')
        ? tls
          ? { ...tls, status: 'available' }
          : { status: 'unavailable', expiresAt: null, issuer: null, commonName: null, daysUntilExpiry: null }
        : { status: 'not_applicable', expiresAt: null, issuer: null, commonName: null, daysUntilExpiry: null },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
