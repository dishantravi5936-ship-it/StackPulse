import endpointService from '../services/endpoint.service';
import tlsService from '../services/tls.service';
import { logger } from '../utils/logger';

const TICK_MS = 60_000;
const PER_ENDPOINT_MS = 60 * 60 * 1000;

class TlsWorker {
  private timer: NodeJS.Timeout | null = null;
  private lastRun = new Map<string, number>();
  private running = false;

  start(): void {
    if (this.timer) return;
    logger.info('TLS worker started');
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      for (const ep of endpointService.listEnabled()) {
        if (!ep.url.startsWith('https://')) continue;
        const last = this.lastRun.get(ep.id) ?? 0;
        if (now - last < PER_ENDPOINT_MS) continue;
        this.lastRun.set(ep.id, now);
        await tlsService.checkAndSave(ep.id, ep.url);
      }
    } catch (err) {
      logger.warn('TLS worker tick failed', { err: String(err) });
    } finally {
      this.running = false;
    }
  }
}

export default new TlsWorker();
