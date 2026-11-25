import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { logger } from './utils/logger';
import { runMigrations } from './database/db';
import authService from './services/auth.service';
import endpointService from './services/endpoint.service';
import monitoringWorker from './workers/monitoring.worker';
import configSyncWorker from './workers/config-sync.worker';
import tlsWorker from './workers/tls.worker';

const PORT = Number.parseInt(process.env.PORT || '3001', 10);

async function bootstrap(): Promise<void> {
  authService.assertConfiguration();
  runMigrations();
  await endpointService.syncGatusConfig();
  monitoringWorker.start();
  configSyncWorker.start();
  tlsWorker.start();

  const server = app.listen(PORT, () => {
    logger.info('StackPulse backend started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      gatusUrl: process.env.GATUS_URL || 'http://localhost:8080',
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('Shutting down StackPulse backend', { signal });
    monitoringWorker.stop();
    configSyncWorker.stop();
    tlsWorker.stop();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  logger.error('Bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
