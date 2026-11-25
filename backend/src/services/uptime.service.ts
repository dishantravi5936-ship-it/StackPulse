import db from '../database/db';
import endpointService from './endpoint.service';
import { logger } from '../utils/logger';
import trustPulseService, { TrustPulseSnapshot } from './trustpulse.service';

export interface UptimeStats {
  uptime_1h: number | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  uptime_90d: number | null;
  computed_at: string;
  source: 'gatus' | 'native' | 'none';
  sampleCount: number;
  expectedChecks24h: number | null;
}

class UptimeService {
  async getForEndpoint(endpointId: string): Promise<UptimeStats> {
    if (!endpointService.getById(endpointId)) {
      throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    }
    const trust = trustPulseService.getEndpointSnapshot(endpointId);
    const periods = trust.periods as TrustPulseSnapshot['periods'];
    const stats: UptimeStats = {
      uptime_1h: periods['1h'].observedUptimePercent,
      uptime_24h: periods['24h'].observedUptimePercent,
      uptime_7d: periods['7d'].observedUptimePercent,
      uptime_30d: periods['30d'].observedUptimePercent,
      uptime_90d: periods['90d'].observedUptimePercent,
      computed_at: new Date().toISOString(),
      source: trust.completedChecks > 0 ? 'native' : 'none',
      sampleCount: periods['24h'].completedChecks,
      expectedChecks24h: periods['24h'].expectedChecks,
    };
    this.persistCache(endpointId, stats);
    return stats;
  }

  getLatestNativeCheck(endpointId: string): {
    success: number;
    status_code: number | null;
    latency_ms: number | null;
    checked_at: string;
  } | undefined {
    return db
      .prepare(
        `SELECT success, http_status AS status_code, latency_ms, checked_at
           FROM health_checks WHERE endpoint_id = ? ORDER BY checked_at DESC LIMIT 1`
      )
      .get(endpointId) as
      | {
          success: number;
          status_code: number | null;
          latency_ms: number | null;
          checked_at: string;
        }
      | undefined;
  }

  getCached(endpointId: string): Omit<UptimeStats, 'source' | 'sampleCount' | 'expectedChecks24h'> | null {
    const row = db
      .prepare(
        `SELECT uptime_1h, uptime_24h, uptime_7d, uptime_30d, uptime_90d, computed_at
         FROM uptime_cache WHERE endpoint_id = ?`
      )
      .get(endpointId) as
      | {
          uptime_1h: number;
          uptime_24h: number;
          uptime_7d: number;
          uptime_30d: number;
          uptime_90d: number;
          computed_at: string;
        }
      | undefined;

    return row ?? null;
  }

  async refreshAll(): Promise<void> {
    const endpoints = endpointService.listEnabled();
    for (const ep of endpoints) {
      try {
        await this.getForEndpoint(ep.id);
      } catch (err) {
        logger.warn('Uptime refresh failed', { endpointId: ep.id, err: String(err) });
      }
    }
  }

  private persistCache(endpointId: string, stats: UptimeStats): void {
    db.prepare(
      `INSERT INTO uptime_cache (endpoint_id, uptime_1h, uptime_24h, uptime_7d, uptime_30d, uptime_90d, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint_id) DO UPDATE SET
         uptime_1h=excluded.uptime_1h,
         uptime_24h=excluded.uptime_24h,
         uptime_7d=excluded.uptime_7d,
         uptime_30d=excluded.uptime_30d,
         uptime_90d=excluded.uptime_90d,
         computed_at=excluded.computed_at`
    ).run(
      endpointId,
      stats.uptime_1h,
      stats.uptime_24h,
      stats.uptime_7d,
      stats.uptime_30d,
      stats.uptime_90d,
      stats.computed_at
    );
  }
}

export default new UptimeService();
