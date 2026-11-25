import { Router, Request, Response } from 'express';
import gatusService from '../services/gatus.service';
import trustPulseService from '../services/trustpulse.service';
import os from 'os';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const gatusReachable = await gatusService.isReachable();
  const monitoringEngines = trustPulseService.getEngineStatuses();
  const nativeEngine = monitoringEngines.find((engine) => engine.engine === 'native') ?? { status: 'unknown' };
  const gatusEngine = monitoringEngines.find((engine) => engine.engine === 'gatus') ?? { status: 'unknown' };

  res.json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      integrations: {
        gatus: gatusReachable ? 'reachable' : 'unavailable',
        monitoring: nativeEngine.status,
        database: 'ok',
        engine: gatusEngine,
        monitoringEngines,
        interruptions: trustPulseService.listInterruptions(20),
      },
      system: {
        platform: os.platform(),
        nodeVersion: process.version,
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
  });
});

export default router;

