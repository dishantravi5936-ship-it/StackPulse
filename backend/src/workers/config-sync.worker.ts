import endpointService from '../services/endpoint.service';
import { logger } from '../utils/logger';

const SYNC_MS = 60_000;

class ConfigSyncWorker {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    logger.info('Config-sync worker started');
    void this.sync();
    this.timer = setInterval(() => {
      void this.sync();
    }, SYNC_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sync(): Promise<void> {
    try {
      await endpointService.syncGatusConfig();
    } catch (err) {
      logger.warn('Config-sync worker failed', { err: String(err) });
    }
  }
}

export default new ConfigSyncWorker();
