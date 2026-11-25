import { logger } from '../utils/logger';
import monitoringService from '../services/monitoring.service';
import trustPulseService from '../services/trustpulse.service';

const TICK_MS = 5_000;

class MonitoringWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    logger.info('Native monitoring worker started as the authoritative check source');
    trustPulseService.recordEngineState('native', 'available');
    void this.tick();
    this.timer = setInterval(() => {
      trustPulseService.recordEngineState('native', 'available');
      void this.tick();
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      trustPulseService.recordEngineState('native', 'unavailable', 'worker_stopped');
    }
  }

  async checkNow(endpointId: string): Promise<unknown> {
    return monitoringService.checkNow(endpointId);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await monitoringService.runDueChecks();
    } catch (error) {
      trustPulseService.recordEngineState(
        'native',
        'degraded',
        error instanceof Error ? error.message : 'monitoring_worker_tick_failed'
      );
      logger.error('Monitoring worker tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}

export default new MonitoringWorker();
