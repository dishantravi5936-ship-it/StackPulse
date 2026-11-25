import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';
import endpointService from './endpoint.service';
import httpMonitorService from './httpMonitor.service';
import incidentService from './incident.service';
import tlsService from './tls.service';
import trustPulseService from './trustpulse.service';

interface HealthCheckRow {
  id: string;
  endpointId: string;
  scheduleId: string | null;
  scheduledCheckId: string;
  engineResultId: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: string;
  success: boolean;
  failureClassification: string | null;
  failureDetail: string | null;
  tlsExpiresAt: string | null;
  source: 'native' | 'gatus';
}

interface DatabaseHealthCheckRow {
  id: string;
  endpoint_id: string;
  schedule_id: string | null;
  scheduled_check_id: string;
  engine_result_id: string | null;
  http_status: number | null;
  latency_ms: number | null;
  checked_at: string;
  success: number;
  failure_classification: string | null;
  failure_detail: string | null;
  tls_expires_at: string | null;
  source: 'native' | 'gatus';
}

class MonitoringService {
  private inFlight = new Map<string, Promise<HealthCheckRow | null>>();

  async checkNow(endpointId: string): Promise<HealthCheckRow | null> {
    const active = this.inFlight.get(endpointId);
    if (active) return active;

    const endpoint = endpointService.getById(endpointId);
    if (!endpoint || endpoint.enabled !== 1 || !endpoint.owner_id) {
      return null;
    }
    const schedule = endpointService.getCurrentSchedule(endpointId);
    if (!schedule) return null;

    const startedAtMs = new Date(schedule.starts_at).getTime();
    const intervalMs = schedule.interval_seconds * 1000;
    const scheduledAtMs = startedAtMs + Math.max(0, Math.floor((Date.now() - startedAtMs) / intervalMs)) * intervalMs;
    const scheduledCheckId = `${schedule.id}:${scheduledAtMs}`;
    const existing = db.prepare(
      'SELECT * FROM health_checks WHERE scheduled_check_id = ?'
    ).get(scheduledCheckId) as DatabaseHealthCheckRow | undefined;
    if (existing) {
      return this.toHealthCheck(existing);
    }

    const promise = this.runCheck(endpoint, schedule.id, scheduledCheckId);
    this.inFlight.set(endpointId, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(endpointId);
    }
  }

  async runDueChecks(): Promise<void> {
    const due = endpointService.listEnabled();
    await Promise.all(due.map((endpoint) => this.checkNow(endpoint.id)));
  }

  listForEndpoint(endpointId: string, limit = 100): Array<Record<string, unknown>> {
    return db.prepare(`
      SELECT id, schedule_id AS scheduleId, scheduled_check_id AS scheduledCheckId,
             engine_result_id AS engineResultId, http_status AS httpStatus, latency_ms AS latencyMs,
             checked_at AS checkedAt, success, failure_classification AS failureClassification,
             failure_detail AS failureDetail, tls_expires_at AS tlsExpiresAt, source
      FROM health_checks WHERE endpoint_id = ? ORDER BY checked_at DESC LIMIT ?
    `).all(endpointId, limit) as Array<Record<string, unknown>>;
  }

  latestForEndpoint(endpointId: string): HealthCheckRow | undefined {
    const row = db.prepare(
      'SELECT * FROM health_checks WHERE endpoint_id = ? ORDER BY checked_at DESC, id DESC LIMIT 1'
    ).get(endpointId) as DatabaseHealthCheckRow | undefined;
    return row ? this.toHealthCheck(row) : undefined;
  }

  getPublicSummary(endpointId: string): Record<string, unknown> {
    const trust = trustPulseService.getEndpointSnapshot(endpointId);
    const latest = this.latestForEndpoint(endpointId);
    const endpoint = endpointService.getById(endpointId);
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    const monitoringUncertain = trust.freshness === 'stale' || trust.freshness === 'engine_unavailable';
    const publicServiceState = monitoringUncertain ? 'unknown' : trust.serviceState;
    const tls = endpoint.url.startsWith('https://')
      ? tlsService.getLatestResult(endpointId)
      : null;

    return {
      id: endpoint.id,
      name: endpoint.name,
      status: publicServiceState === 'up' ? 'operational' : publicServiceState === 'down' ? 'outage' : 'unknown',
      serviceState: publicServiceState,
      lastKnownServiceState: trust.lastKnownServiceState,
      monitoringFreshness: trust.freshness,
      httpStatus: latest?.httpStatus ?? null,
      latencyMs: latest?.latencyMs ?? null,
      lastCheckedAt: trust.lastCompletedCheckAt,
      lastSuccessfulCheckAt: trust.lastSuccessfulCheckAt,
      checkIntervalSeconds: endpoint.interval_seconds,
      uptime24h: trust.observedUptimePercent,
      observedUptimePercent: trust.observedUptimePercent,
      monitoringCoveragePercent: trust.monitoringCoveragePercent,
      expectedChecks24h: trust.expectedChecks,
      completedChecks24h: trust.completedChecks,
      successfulChecks24h: trust.successfulChecks,
      missedChecks24h: trust.missingChecks,
      availabilityNote: trust.availabilityNote,
      tls: endpoint.url.startsWith('https://')
        ? { status: tls?.expiresAt ? 'available' : 'unavailable', expiresAt: tls?.expiresAt ?? null }
        : { status: 'not_applicable', expiresAt: null },
    };
  }

  listPublicHistory(endpointId: string, since: string, limit = 2880): Array<{
    checkedAt: string;
    success: boolean;
    httpStatus: number | null;
    latencyMs: number | null;
  }> {
    const rows = db.prepare(`
      SELECT checked_at AS checkedAt, success, http_status AS httpStatus, latency_ms AS latencyMs
      FROM health_checks
      WHERE endpoint_id = ? AND source = 'native' AND checked_at >= ?
      ORDER BY checked_at DESC LIMIT ?
    `).all(endpointId, since, limit) as Array<{
      checkedAt: string;
      success: number;
      httpStatus: number | null;
      latencyMs: number | null;
    }>;
    return rows.reverse().map((row) => ({
      checkedAt: row.checkedAt,
      success: row.success === 1,
      httpStatus: row.httpStatus,
      latencyMs: row.latencyMs,
    }));
  }

  private async runCheck(
    endpoint: NonNullable<ReturnType<typeof endpointService.getById>>,
    scheduleId: string,
    scheduledCheckId: string
  ): Promise<HealthCheckRow | null> {
    const result = await httpMonitorService.check(
      endpoint.url,
      endpoint.expected_content,
      endpoint.expected_status
    );
    const tlsResult = endpoint.url.startsWith('https://')
      ? await tlsService.checkEndpoint(endpoint.url)
      : null;
    if (tlsResult) result.tlsExpiresAt = tlsResult.expiresAt;
    const now = nowISO();
    const id = generateId();
    const persist = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT INTO health_checks
          (id, endpoint_id, schedule_id, scheduled_check_id, engine_result_id, http_status,
           latency_ms, checked_at, success, failure_classification, failure_detail, tls_expires_at, source, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'native', ?)
        ON CONFLICT(scheduled_check_id) DO NOTHING
      `).run(
        id,
        endpoint.id,
        scheduleId,
        scheduledCheckId,
        result.statusCode,
        result.latencyMs,
        now,
        result.success ? 1 : 0,
        result.failureClassification === 'none' ? null : result.failureClassification,
        result.error,
        result.tlsExpiresAt,
        now
      );
      if (inserted.changes === 0) {
        return null;
      }

      db.prepare(`
        INSERT INTO check_results (id, endpoint_id, success, status_code, latency_ms, error, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, endpoint.id, result.success ? 1 : 0, result.statusCode, result.latencyMs, result.error, now);
      if (tlsResult) {
        db.prepare(`
          INSERT INTO tls_results
            (id, endpoint_id, valid, expires_at, issuer, common_name, days_until_expiry, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          endpoint.id,
          tlsResult.valid ? 1 : 0,
          tlsResult.expiresAt,
          tlsResult.issuer,
          tlsResult.commonName,
          tlsResult.daysUntilExpiry,
          now
        );
      }

      incidentService.createForCheck({
        id,
        endpoint_id: endpoint.id,
        owner_id: endpoint.owner_id!,
        endpoint_name: endpoint.name,
        success: result.success,
      });

      return {
        id,
        endpointId: endpoint.id,
        scheduleId,
        scheduledCheckId,
        engineResultId: null,
        httpStatus: result.statusCode,
        latencyMs: result.latencyMs,
        checkedAt: now,
        success: result.success,
        failureClassification: result.failureClassification === 'none' ? null : result.failureClassification,
        failureDetail: result.error,
        tlsExpiresAt: result.tlsExpiresAt,
        source: 'native' as const,
      };
    });
    return persist();
  }

  private toHealthCheck(row: DatabaseHealthCheckRow): HealthCheckRow {
    return {
      id: row.id,
      endpointId: row.endpoint_id,
      scheduleId: row.schedule_id,
      scheduledCheckId: row.scheduled_check_id,
      engineResultId: row.engine_result_id,
      httpStatus: row.http_status,
      latencyMs: row.latency_ms,
      checkedAt: row.checked_at,
      success: row.success === 1,
      failureClassification: row.failure_classification,
      failureDetail: row.failure_detail,
      tlsExpiresAt: row.tls_expires_at,
      source: row.source,
    };
  }
}

export default new MonitoringService();
