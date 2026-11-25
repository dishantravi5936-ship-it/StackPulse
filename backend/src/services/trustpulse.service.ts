import db from '../database/db';
import { generateId } from '../utils/helpers';

const ENGINE_STALE_AFTER_MS = 30_000;
const CHECK_TOLERANCE_MIN_MS = 5_000;
const CHECK_TOLERANCE_RATIO = 0.25;
const WINDOWS = [
  { key: '1h', durationMs: 60 * 60 * 1000 },
  { key: '24h', durationMs: 24 * 60 * 60 * 1000 },
  { key: '7d', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', durationMs: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', durationMs: 90 * 24 * 60 * 60 * 1000 },
] as const;

export type EngineStatus = 'available' | 'unavailable' | 'disabled' | 'degraded' | 'unknown';
export type MonitoringFreshness = 'fresh' | 'stale' | 'pending' | 'unknown' | 'paused' | 'engine_unavailable';

interface ScheduleRow {
  id: string;
  interval_seconds: number;
  starts_at: string;
  ends_at: string | null;
}

interface CheckRow {
  id: string;
  schedule_id: string | null;
  scheduled_check_id: string;
  checked_at: string;
  success: number;
}

interface InterruptionRange {
  started_at: string;
  ended_at: string | null;
}

interface EngineRow {
  engine: string;
  status: Exclude<EngineStatus, 'unknown'>;
  last_checked_at: string | null;
}

export interface TrustPulseWindow {
  expectedChecks: number;
  completedChecks: number;
  successfulChecks: number;
  failedChecks: number;
  missingChecks: number;
  excludedChecks: number;
  observedUptimePercent: number | null;
  monitoringCoveragePercent: number | null;
}

export interface CoverageResult {
  expected: number;
  completed: number;
  successful: number;
  failed: number;
  missing: number;
  observedUptime: number | null;
  coverage: number | null;
}

export function calculateCoverage(
  expected: number,
  completed: number,
  successful: number
): CoverageResult {
  if (
    ![expected, completed, successful].every(Number.isSafeInteger) ||
    expected < 0 ||
    completed < 0 ||
    successful < 0 ||
    completed > expected ||
    successful > completed
  ) {
    throw new Error('Invalid monitoring counts');
  }

  const round = (value: number): number => Math.round(value * 100) / 100;

  return {
    expected,
    completed,
    successful,
    failed: completed - successful,
    missing: expected - completed,
    observedUptime: completed > 0 ? round((successful / completed) * 100) : null,
    coverage: expected > 0 ? round((completed / expected) * 100) : null,
  };
}

export interface TrustPulseSnapshot extends TrustPulseWindow {
  serviceState: 'up' | 'down' | 'unknown';
  lastKnownServiceState: 'up' | 'down' | 'unknown';
  freshness: MonitoringFreshness;
  monitoringStatus: string;
  engineStatus: EngineStatus;
  engineLastHeartbeatAt: string | null;
  lastSuccessfulCheckAt: string | null;
  lastCompletedCheckAt: string | null;
  period: '24h';
  periods: Record<string, TrustPulseWindow>;
  availabilityNote: string;
  monitoringInterruptions: Array<Record<string, unknown>>;
  lastFailure: Record<string, unknown> | null;
  lastCheck: {
    success: boolean;
    httpStatus: number | null;
    failureClassification: string | null;
    failureDetail: string | null;
    checkedAt: string;
    tlsExpiresAt: string | null;
  } | null;
}

class TrustPulseService {
  recordEngineState(
    engine: string,
    status: Exclude<EngineStatus, 'unknown'>,
    reason: string | null = null,
    heartbeat = true,
    now = Date.now()
  ): void {
    const nowIso = new Date(now).toISOString();
    const previous = db.prepare(
      'SELECT engine, status, last_checked_at FROM monitoring_engine_health WHERE engine = ?'
    ).get(engine) as EngineRow | undefined;
    const openInterruption = db.prepare(
      'SELECT id FROM monitoring_interruptions WHERE engine = ? AND ended_at IS NULL'
    ).get(engine) as { id: string } | undefined;

    db.transaction(() => {
      if (
        engine === 'native' &&
        heartbeat &&
        previous?.status === 'available' &&
        previous.last_checked_at &&
        now - Date.parse(previous.last_checked_at) > ENGINE_STALE_AFTER_MS &&
        !openInterruption
      ) {
        const interruptionStart = new Date(Date.parse(previous.last_checked_at) + ENGINE_STALE_AFTER_MS).toISOString();
        if (Date.parse(interruptionStart) < now) {
          db.prepare(`
            INSERT INTO monitoring_interruptions (id, engine, started_at, ended_at, reason, excluded_from_expected)
            VALUES (?, ?, ?, ?, 'worker_heartbeat_gap', 0)
          `).run(generateId(), engine, interruptionStart, nowIso);
        }
      }

      if (status === 'available' || status === 'disabled') {
        if (openInterruption) {
          db.prepare('UPDATE monitoring_interruptions SET ended_at = ? WHERE id = ? AND ended_at IS NULL')
            .run(nowIso, openInterruption.id);
        }
      } else if (!openInterruption) {
        db.prepare(`
          INSERT INTO monitoring_interruptions (id, engine, started_at, reason, excluded_from_expected)
          VALUES (?, ?, ?, ?, 0)
        `).run(generateId(), engine, nowIso, reason ?? status);
      } else if (reason) {
        db.prepare('UPDATE monitoring_interruptions SET reason = ? WHERE id = ?').run(reason, openInterruption.id);
      }

      db.prepare(`
        INSERT INTO monitoring_engine_health (id, engine, status, last_checked_at, last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(engine) DO UPDATE SET
          status = excluded.status,
          last_checked_at = CASE WHEN ? = 1 THEN excluded.last_checked_at ELSE monitoring_engine_health.last_checked_at END,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `).run(
        engine,
        engine,
        status,
        heartbeat ? nowIso : previous?.last_checked_at ?? null,
        reason,
        nowIso,
        heartbeat ? 1 : 0
      );
    })();
  }

  startInterruption(
    engine: string,
    reason: string,
    excludedFromExpected = false,
    now = Date.now()
  ): string {
    const existing = db.prepare(
      'SELECT id FROM monitoring_interruptions WHERE engine = ? AND ended_at IS NULL'
    ).get(engine) as { id: string } | undefined;
    if (existing) {
      db.prepare(`
        UPDATE monitoring_interruptions
        SET reason = ?, excluded_from_expected = ?
        WHERE id = ?
      `).run(reason, excludedFromExpected ? 1 : 0, existing.id);
      return existing.id;
    }
    const id = generateId();
    db.prepare(`
      INSERT INTO monitoring_interruptions
        (id, engine, started_at, reason, excluded_from_expected)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, engine, new Date(now).toISOString(), reason, excludedFromExpected ? 1 : 0);
    return id;
  }

  endInterruption(id: string, now = Date.now()): void {
    db.prepare('UPDATE monitoring_interruptions SET ended_at = ? WHERE id = ? AND ended_at IS NULL')
      .run(new Date(now).toISOString(), id);
  }

  getEngineStatuses(now = Date.now()): Array<Record<string, unknown>> {
    const native = db.prepare(
      'SELECT engine, status, last_checked_at FROM monitoring_engine_health WHERE engine = ?'
    ).get('native') as EngineRow | undefined;
    if (
      native?.status === 'available' &&
      native.last_checked_at &&
      now - Date.parse(native.last_checked_at) > ENGINE_STALE_AFTER_MS
    ) {
      this.recordEngineState('native', 'unavailable', 'worker_heartbeat_stale', false, now);
    }

    return db.prepare(`
      SELECT engine, status, last_checked_at AS lastCheckedAt,
             last_error AS lastError, updated_at AS updatedAt
      FROM monitoring_engine_health ORDER BY engine
    `).all() as Array<Record<string, unknown>>;
  }

  listInterruptions(limit = 20, now = Date.now()): Array<Record<string, unknown>> {
    const rows = db.prepare(`
      SELECT id, engine, started_at AS startedAt, ended_at AS endedAt,
             reason, excluded_from_expected AS excludedFromExpected
      FROM monitoring_interruptions
      ORDER BY started_at DESC LIMIT ?
    `).all(limit) as Array<{
      id: string;
      engine: string;
      startedAt: string;
      endedAt: string | null;
      reason: string;
      excludedFromExpected: number;
    }>;
    return rows.map((row) => ({
      ...row,
      excludedFromExpected: row.excludedFromExpected === 1,
      durationMs: Math.max(0, (row.endedAt ? Date.parse(row.endedAt) : now) - Date.parse(row.startedAt)),
      active: row.endedAt === null,
    }));
  }

  getEndpointSnapshot(endpointId: string, now = Date.now()): TrustPulseSnapshot {
    const endpoint = db.prepare(
      'SELECT enabled FROM endpoints WHERE id = ? AND deleted_at IS NULL'
    ).get(endpointId) as { enabled: number } | undefined;
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });

    const engine = this.getEngineStatuses(now).find((row) => row.engine === 'native') as
      | { status: EngineStatus; lastCheckedAt?: string | null }
      | undefined;
    const lookbackStart = now - WINDOWS[WINDOWS.length - 1].durationMs - 120_000;
    const schedules = db.prepare(`
      SELECT id, interval_seconds, starts_at, ends_at FROM endpoint_schedule_history
      WHERE endpoint_id = ? AND starts_at <= ?
        AND (ends_at IS NULL OR ends_at >= ?)
      ORDER BY starts_at
    `).all(
      endpointId,
      new Date(now).toISOString(),
      new Date(lookbackStart).toISOString()
    ) as ScheduleRow[];
    const recentChecks = db.prepare(`
      SELECT id, schedule_id, scheduled_check_id, checked_at, success
      FROM health_checks
      WHERE endpoint_id = ? AND source = 'native' AND checked_at >= ? AND checked_at <= ?
      ORDER BY checked_at, id
    `).all(
      endpointId,
      new Date(lookbackStart).toISOString(),
      new Date(now + 30_000).toISOString()
    ) as CheckRow[];
    const interruptions = db.prepare(`
      SELECT started_at, ended_at FROM monitoring_interruptions
      WHERE engine = 'native' AND excluded_from_expected = 1
        AND started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)
      ORDER BY started_at
    `).all(
      new Date(now).toISOString(),
      new Date(now - WINDOWS[WINDOWS.length - 1].durationMs).toISOString()
    ) as InterruptionRange[];
    const excludedPeriods = this.mergeExclusions(interruptions, now);
    const latest = db.prepare(`
      SELECT id, schedule_id, scheduled_check_id, checked_at, success,
             http_status, failure_classification, failure_detail, tls_expires_at
      FROM health_checks WHERE endpoint_id = ? AND source = 'native'
      ORDER BY checked_at DESC, id DESC LIMIT 1
    `).get(endpointId) as (CheckRow & {
      http_status: number | null;
      failure_classification: string | null;
      failure_detail: string | null;
      tls_expires_at: string | null;
    }) | undefined;
    const lastSuccessful = db.prepare(
      `SELECT checked_at FROM health_checks
       WHERE endpoint_id = ? AND source = 'native' AND success = 1
       ORDER BY checked_at DESC, id DESC LIMIT 1`
    ).get(endpointId) as { checked_at: string } | undefined;
    const latestSchedule = schedules[schedules.length - 1];
    const latestIntervalMs = latestSchedule ? latestSchedule.interval_seconds * 1000 : 120_000;
    const freshnessLimitMs = latestIntervalMs * 2 + this.toleranceMs(latestIntervalMs / 1000);
    const serviceState = latest ? latest.success === 1 ? 'up' : 'down' : 'unknown';

    const periods = Object.fromEntries(WINDOWS.map((window) => [
      window.key,
      this.calculateWindow(schedules, recentChecks, excludedPeriods, now - window.durationMs, now),
    ])) as Record<string, TrustPulseWindow>;
    const summary = periods['24h'];
    const latestAgeMs = latest ? now - Date.parse(latest.checked_at) : null;
    let freshness: MonitoringFreshness;
    if (endpoint.enabled !== 1) freshness = 'paused';
    else if (summary.expectedChecks === 0) freshness = 'pending';
    else if (!latest) freshness = 'unknown';
    else if (engine?.status !== 'available') freshness = 'engine_unavailable';
    else if (latestAgeMs === null || latestAgeMs > freshnessLimitMs) freshness = 'stale';
    else freshness = 'fresh';

    return {
      serviceState,
      lastKnownServiceState: serviceState,
      freshness,
      monitoringStatus: freshness === 'fresh' && summary.missingChecks > 0 ? 'degraded_coverage' : freshness,
      engineStatus: engine?.status ?? 'unknown',
      engineLastHeartbeatAt: engine?.lastCheckedAt ?? null,
      lastSuccessfulCheckAt: lastSuccessful?.checked_at ?? null,
      lastCompletedCheckAt: latest?.checked_at ?? null,
      period: '24h',
      ...summary,
      periods,
      availabilityNote: 'Observed uptime uses completed scheduled checks only. 100% observed uptime does not prove uninterrupted availability.',
      monitoringInterruptions: this.listInterruptions(20, now),
      lastFailure: latest && latest.success === 0
        ? {
            httpStatus: latest.http_status,
            failureClassification: latest.failure_classification,
            failureDetail: latest.failure_detail,
            tlsExpiresAt: latest.tls_expires_at,
          }
        : null,
      lastCheck: latest
        ? {
            success: latest.success === 1,
            httpStatus: latest.http_status,
            failureClassification: latest.failure_classification,
            failureDetail: latest.failure_detail,
            checkedAt: latest.checked_at,
            tlsExpiresAt: latest.tls_expires_at,
          }
        : null,
    };
  }

  private calculateWindow(
    schedules: ScheduleRow[],
    checks: CheckRow[],
    interruptions: InterruptionRange[],
    windowStart: number,
    now: number
  ): TrustPulseWindow {
    let expectedChecks = 0;
    let excludedChecks = 0;
    const validSchedules = schedules.map((schedule) => {
      const startsAt = Date.parse(schedule.starts_at);
      const endsAt = schedule.ends_at ? Date.parse(schedule.ends_at) : Number.POSITIVE_INFINITY;
      const period = schedule.interval_seconds * 1000;
      const tolerance = this.toleranceMs(schedule.interval_seconds);
      const end = Math.min(now - tolerance, endsAt - 1);
      const start = Math.max(windowStart, startsAt);
      const firstIndex = Math.max(0, Math.ceil((start - startsAt) / period));
      const lastIndex = Math.floor((end - startsAt) / period);
      expectedChecks += Math.max(0, lastIndex - firstIndex + 1);
      const excluded = interruptions.reduce((total, interruption) => {
        const rangeStart = Math.max(start, Date.parse(interruption.started_at));
        const rangeEnd = Math.min(end, interruption.ended_at ? Date.parse(interruption.ended_at) : now);
        if (rangeEnd < rangeStart) return total;
        const firstExcluded = Math.max(0, Math.ceil((rangeStart - startsAt) / period));
        const lastExcluded = Math.floor((rangeEnd - startsAt) / period);
        return total + Math.max(0, lastExcluded - firstExcluded + 1);
      }, 0);
      excludedChecks += excluded;
      return { ...schedule, startsAt, endsAt, period, tolerance, end };
    });
    expectedChecks = Math.max(0, expectedChecks - excludedChecks);

    const matched = new Map<string, CheckRow>();
    for (const check of checks) {
      const checkedAt = Date.parse(check.checked_at);
      let candidate: { key: string; distance: number } | undefined;
      for (const schedule of validSchedules) {
        if (check.schedule_id && check.schedule_id !== schedule.id) continue;
        const index = Math.round((checkedAt - schedule.startsAt) / schedule.period);
        const dueAt = schedule.startsAt + index * schedule.period;
        if (
          index < 0 ||
          dueAt < windowStart ||
          dueAt > schedule.end ||
          dueAt >= schedule.endsAt ||
          Math.abs(checkedAt - dueAt) > schedule.tolerance ||
          this.isExcluded(dueAt, interruptions, now)
        ) continue;
        const key = `${schedule.id}:${index}`;
        const distance = Math.abs(checkedAt - dueAt);
        if (!candidate || distance < candidate.distance) candidate = { key, distance };
      }
      if (!candidate) continue;
      const previous = matched.get(candidate.key);
      if (!previous || Date.parse(check.checked_at) > Date.parse(previous.checked_at)) {
        matched.set(candidate.key, check);
      }
    }

    const completedChecks = matched.size;
    const successfulChecks = Array.from(matched.values()).filter((check) => check.success === 1).length;
    const coverage = calculateCoverage(expectedChecks, completedChecks, successfulChecks);
    return {
      expectedChecks: coverage.expected,
      completedChecks: coverage.completed,
      successfulChecks: coverage.successful,
      failedChecks: coverage.failed,
      missingChecks: coverage.missing,
      excludedChecks,
      observedUptimePercent: coverage.observedUptime,
      monitoringCoveragePercent: coverage.coverage,
    };
  }

  private isExcluded(
    dueAt: number,
    interruptions: InterruptionRange[],
    now: number
  ): boolean {
    return interruptions.some((interruption) =>
      dueAt >= Date.parse(interruption.started_at) &&
      dueAt < (interruption.ended_at ? Date.parse(interruption.ended_at) : now)
    );
  }

  private mergeExclusions(
    interruptions: InterruptionRange[],
    now: number
  ): InterruptionRange[] {
    const sorted = interruptions.map((period) => ({
      start: Date.parse(period.started_at),
      end: period.ended_at ? Date.parse(period.ended_at) : now,
    })).filter((period) => period.end > period.start).sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const period of sorted) {
      const previous = merged[merged.length - 1];
      if (previous && period.start <= previous.end) previous.end = Math.max(previous.end, period.end);
      else merged.push({ ...period });
    }
    return merged.map((period) => ({
      started_at: new Date(period.start).toISOString(),
      ended_at: new Date(period.end).toISOString(),
    }));
  }

  private toleranceMs(intervalSeconds: number): number {
    return Math.max(CHECK_TOLERANCE_MIN_MS, intervalSeconds * 1000 * CHECK_TOLERANCE_RATIO);
  }
}

export default new TrustPulseService();

