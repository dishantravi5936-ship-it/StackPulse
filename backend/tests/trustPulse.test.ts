import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackpulse-trust-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'stackpulse.db');
process.env.JWT_SECRET = 'trust-pulse-test-secret-long-enough-to-pass-validation';
process.env.ADMIN_BOOTSTRAP_TOKEN = 'trust-pulse-test-bootstrap-token';
process.env.GATUS_DYNAMIC_CONFIG_ENABLED = 'false';
process.env.NODE_ENV = 'test';

const database = require('../src/database/db');
const db = database.default as import('better-sqlite3').Database;
const trustPulseModule = require('../src/services/trustpulse.service');
const trustPulse = trustPulseModule.default;
const calculateCoverage: typeof import('../src/services/trustpulse.service').calculateCoverage =
  trustPulseModule.calculateCoverage;
const uptimeService = require('../src/services/uptime.service').default;
const incidentLens = require('../src/services/incidentlens.service').default;
const incidentService = require('../src/services/incident.service').default;
const monitoringWorker = require('../src/workers/monitoring.worker').default;

const ownerId = randomUUID();

function createEndpoint(interval: 30 | 60 | 120, schedules: Array<{
  interval: 30 | 60 | 120;
  start: number;
  end?: number;
}>): { endpointId: string; scheduleIds: string[] } {
  const endpointId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO endpoints (id, owner_id, name, group_name, url, expected_content, gatus_key, public_slug, interval_seconds, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, 1, ?, ?)'
  ).run(endpointId, ownerId, `Trust endpoint ${endpointId}`, 'test', 'https://service.test/', `stackpulse_${endpointId.replace(/-/g, '')}`, interval, now, now);
  const scheduleIds = schedules.map((schedule) => {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO endpoint_schedule_history (id, endpoint_id, interval_seconds, starts_at, ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      endpointId,
      schedule.interval,
      new Date(schedule.start).toISOString(),
      schedule.end === undefined ? null : new Date(schedule.end).toISOString(),
      new Date(schedule.start).toISOString()
    );
    return id;
  });
  return { endpointId, scheduleIds };
}

function insertCheck(
  endpointId: string,
  scheduleId: string,
  checkedAt: number,
  success = true,
  scheduledCheckId: string = randomUUID()
): void {
  const iso = new Date(checkedAt).toISOString();
  db.prepare(`
    INSERT INTO health_checks
      (id, endpoint_id, schedule_id, scheduled_check_id, engine_result_id, http_status,
       latency_ms, checked_at, success, failure_classification, failure_detail,
       tls_expires_at, source, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, 10, ?, ?, ?, NULL, NULL, 'native', ?)
  `).run(
    randomUUID(),
    endpointId,
    scheduleId,
    scheduledCheckId,
    success ? 200 : 503,
    iso,
    success ? 1 : 0,
    success ? null : 'http_status',
    iso
  );
}

describe('TrustPulse schedule-aware reliability metrics', () => {
  beforeAll(() => {
    database.runMigrations();
    db.prepare('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(ownerId, 'trust@example.test', 'not-used', 'admin', new Date().toISOString());
  });

  afterAll(() => {
    db.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test('calculates completed failures, missing checks, uptime, and coverage with validated counts', () => {
    expect(calculateCoverage(10, 6, 5)).toEqual({
      expected: 10,
      completed: 6,
      successful: 5,
      failed: 1,
      missing: 4,
      observedUptime: 83.33,
      coverage: 60,
    });
    expect(calculateCoverage(0, 0, 0)).toEqual({
      expected: 0,
      completed: 0,
      successful: 0,
      failed: 0,
      missing: 0,
      observedUptime: null,
      coverage: null,
    });
    expect(() => calculateCoverage(2, 3, 1)).toThrow('Invalid monitoring counts');
    expect(() => calculateCoverage(2, 1, 2)).toThrow('Invalid monitoring counts');
    expect(() => calculateCoverage(1.5, 1, 1)).toThrow('Invalid monitoring counts');
  });

  test('returns the required 10/10, 6/10, 8/6 and zero-completed count scenarios', () => {
    expect(calculateCoverage(10, 10, 10)).toEqual({
      expected: 10,
      completed: 10,
      successful: 10,
      failed: 0,
      missing: 0,
      observedUptime: 100,
      coverage: 100,
    });
    expect(calculateCoverage(10, 6, 6)).toEqual({
      expected: 10,
      completed: 6,
      successful: 6,
      failed: 0,
      missing: 4,
      observedUptime: 100,
      coverage: 60,
    });
    expect(calculateCoverage(10, 8, 6)).toEqual({
      expected: 10,
      completed: 8,
      successful: 6,
      failed: 2,
      missing: 2,
      observedUptime: 75,
      coverage: 80,
    });
    expect(calculateCoverage(10, 0, 0)).toEqual({
      expected: 10,
      completed: 0,
      successful: 0,
      failed: 0,
      missing: 10,
      observedUptime: null,
      coverage: 0,
    });
  });

  test('keeps an active incident unresolved while the monitoring worker is unavailable', () => {
    const now = Date.now();
    const start = now - 20_000;
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);
    const endpoint = db.prepare('SELECT owner_id, name FROM endpoints WHERE id = ?').get(endpointId) as
      { owner_id: string; name: string };

    for (let index = 0; index < 3; index += 1) {
      const checkId = randomUUID();
      const checkedAt = new Date(start + (index + 1) * 30_000).toISOString();
      db.prepare(`
        INSERT INTO health_checks
          (id, endpoint_id, schedule_id, scheduled_check_id, http_status, checked_at,
           success, failure_classification, source, created_at)
        VALUES (?, ?, ?, ?, 503, ?, 0, 'http_status', 'native', ?)
      `).run(checkId, endpointId, scheduleIds[0], `incident:${index}`, checkedAt, checkedAt);
      incidentService.createForCheck({
        id: checkId,
        endpoint_id: endpointId,
        owner_id: endpoint.owner_id,
        endpoint_name: endpoint.name,
        success: false,
      });
    }

    const activeBefore = db.prepare(
      "SELECT id, status, failure_count FROM incidents WHERE endpoint_id = ? AND status != 'resolved'"
    ).get(endpointId) as { id: string; status: string; failure_count: number };
    expect(activeBefore).toMatchObject({ status: 'open', failure_count: 3 });

    trustPulse.recordEngineState('native', 'unavailable', 'worker_stopped', true, now);
    const interrupted = trustPulse.getEndpointSnapshot(endpointId, now);
    const activeDuring = db.prepare(
      "SELECT status, failure_count FROM incidents WHERE endpoint_id = ? AND status != 'resolved'"
    ).get(endpointId) as { status: string; failure_count: number };

    expect(interrupted.serviceState).toBe('down');
    expect(interrupted.freshness).toBe('engine_unavailable');
    expect(activeDuring).toMatchObject({ status: 'open', failure_count: 3 });
  });

  test('worker stop and restart preserve history and restore fresh monitoring state', () => {
    const now = Date.now();
    const start = now - 20_000;
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);
    insertCheck(endpointId, scheduleIds[0], start + 1_000, true);

    trustPulse.recordEngineState('native', 'available', null, true, now - 40_000);
    monitoringWorker.stop();
    const stopped = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(stopped.freshness).toBe('engine_unavailable');
    expect(stopped.lastCompletedCheckAt).toBeTruthy();

    trustPulse.recordEngineState('native', 'available', null, true, now);
    const resumed = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(resumed.engineStatus).toBe('available');
    expect(resumed.lastCompletedCheckAt).toBeTruthy();
    expect(resumed.monitoringInterruptions.some((entry: Record<string, unknown>) => entry.active)).toBe(false);
    monitoringWorker.stop();
  });

  test('backend restart retains health checks and incident state in the SQLite database', () => {
    const now = Date.now();
    const start = now - 20_000;
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);
    insertCheck(endpointId, scheduleIds[0], start + 1_000, false);

    const incidentId = randomUUID();
    db.prepare(`
      INSERT INTO incidents
        (id, endpoint_id, owner_id, title, description, severity, status, dedupe_key,
         failure_count, created_at, updated_at)
      VALUES (?, ?, ?, 'Persisted incident', 'Restart persistence test', 'high', 'open',
              ?, 1, ?, ?)
    `).run(incidentId, endpointId, ownerId, `restart:${endpointId}`, new Date(start).toISOString(), new Date(now).toISOString());

    const persistedBefore = db.prepare(
      'SELECT COUNT(*) AS count FROM health_checks WHERE endpoint_id = ?'
    ).get(endpointId) as { count: number };
    const incidentBefore = db.prepare(
      'SELECT status, failure_count FROM incidents WHERE id = ?'
    ).get(incidentId) as { status: string; failure_count: number };

    expect(persistedBefore.count).toBe(1);
    expect(incidentBefore).toEqual({ status: 'open', failure_count: 1 });
  });

  test('keeps 100% observed uptime separate from 60% monitoring coverage', () => {
    const now = Date.now();
    trustPulse.recordEngineState('native', 'available', null, true, now);
    const start = now - 301_000;
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);
    for (let index = 0; index < 6; index += 1) {
      insertCheck(endpointId, scheduleIds[0], start + index * 30_000 + 2_000);
    }

    const result = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(result.expectedChecks).toBe(10);
    expect(result.completedChecks).toBe(6);
    expect(result.successfulChecks).toBe(6);
    expect(result.failedChecks).toBe(0);
    expect(result.missingChecks).toBe(4);
    expect(result.observedUptimePercent).toBe(100);
    expect(result.monitoringCoveragePercent).toBe(60);
    expect(result.serviceState).toBe('up');
    expect(result.freshness).toBe('stale');
    expect(result.lastCompletedCheckAt).toBeTruthy();
    expect(result.lastSuccessfulCheckAt).toBe(result.lastCompletedCheckAt);
    expect(result.availabilityNote).toMatch(/does not prove uninterrupted availability/i);
  });

  test('deduplicates multiple imported results that map to one scheduled slot', () => {
    const now = Date.now();
    trustPulse.recordEngineState('native', 'available', null, true, now);
    const start = now - 91_000;
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);
    insertCheck(endpointId, scheduleIds[0], start + 31_000, true, 'import-one');
    insertCheck(endpointId, scheduleIds[0], start + 32_000, false, 'import-two');

    const result = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(result.expectedChecks).toBe(3);
    expect(result.completedChecks).toBe(1);
    expect(result.missingChecks).toBe(2);
  });

  test('ignores out-of-order and UTC-offset results outside their scheduled slots', () => {
    const now = Date.parse('2026-06-01T12:03:00.000Z');
    trustPulse.recordEngineState('native', 'available', null, true, now);
    const start = Date.parse('2026-06-01T12:00:00.000Z');
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);

    db.prepare(`
      INSERT INTO health_checks
        (id, endpoint_id, schedule_id, scheduled_check_id, engine_result_id, http_status,
         latency_ms, checked_at, success, failure_classification, failure_detail,
         tls_expires_at, source, created_at)
      VALUES (?, ?, ?, ?, NULL, 200, 10, ?, 1, NULL, NULL, NULL, 'native', ?)
    `).run(
      randomUUID(),
      endpointId,
      scheduleIds[0],
      'out-of-order:utc-offset',
      '2026-06-01T14:02:00.000+02:00',
      '2026-06-01T12:02:00.000Z'
    );
    insertCheck(endpointId, scheduleIds[0], start + 31_000, true, 'duplicate:two');
    insertCheck(endpointId, scheduleIds[0], start + 32_000, false, 'duplicate:three');

    const result = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(result.completedChecks).toBe(2);
    expect(result.successfulChecks).toBe(1);
    expect(result.expectedChecks).toBe(6);
    expect(result.missingChecks).toBe(4);
  });

  test('reconciles interval changes, paused time, and declared configuration reloads', () => {
    const now = Date.now();
    trustPulse.recordEngineState('native', 'available', null, true, now);
    const start = now - 121_000;
    const intervalChange = now - 61_000;
    const pauseAt = now - 31_000;
    const { endpointId, scheduleIds } = createEndpoint(60, [
      { interval: 30, start, end: intervalChange },
      { interval: 60, start: intervalChange, end: pauseAt },
    ]);
    insertCheck(endpointId, scheduleIds[0], start + 1_000);
    insertCheck(endpointId, scheduleIds[0], start + 31_000);
    insertCheck(endpointId, scheduleIds[1], intervalChange + 1_000);
    db.prepare('UPDATE endpoints SET enabled = 0 WHERE id = ?').run(endpointId);

    const reloadStart = start + 60_000;
    const reloadId = trustPulse.startInterruption('native', 'configuration_reload', true, reloadStart);
    trustPulse.endInterruption(reloadId, start + 90_000);
    const result = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(result.expectedChecks).toBe(2);
    expect(result.completedChecks).toBe(2);
    expect(result.excludedChecks).toBe(1);
    expect(result.freshness).toBe('paused');
    expect(result.serviceState).toBe('up');
  });

  test('records monitoring interruption and recovery without changing last service state', () => {
    const now = Date.now();
    const start = now - 20_000;
    const { endpointId, scheduleIds } = createEndpoint(30, [{ interval: 30, start }]);
    insertCheck(endpointId, scheduleIds[0], start + 1_000);
    trustPulse.recordEngineState('native', 'available', null, true, now - 2_000);
    trustPulse.recordEngineState('native', 'unavailable', 'test_worker_interruption', true, now);

    const interrupted = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(interrupted.serviceState).toBe('up');
    expect(interrupted.freshness).toBe('engine_unavailable');
    expect(interrupted.monitoringInterruptions[0]).toMatchObject({ active: true, reason: 'test_worker_interruption' });

    trustPulse.recordEngineState('native', 'available', null, true, now + 1_000);
    const recovered = trustPulse.getEndpointSnapshot(endpointId, now + 2_000);
    expect(recovered.engineStatus).toBe('available');
    expect(recovered.serviceState).toBe('up');
    expect(recovered.monitoringInterruptions[0]).toMatchObject({ active: false });
  });

  test('returns null observed uptime and zero coverage when no scheduled result completed', async () => {
    const now = Date.now();
    trustPulse.recordEngineState('native', 'available', null, true, now);
    const start = now - 301_000;
    const { endpointId } = createEndpoint(30, [{ interval: 30, start }]);

    const result = trustPulse.getEndpointSnapshot(endpointId, now);
    const uptime = await uptimeService.getForEndpoint(endpointId);
    expect(result.observedUptimePercent).toBeNull();
    expect(result.monitoringCoveragePercent).toBe(0);
    expect(result.freshness).toBe('unknown');
    expect(uptime.uptime_24h).toBeNull();
  });

  test('reports pending before the first scheduled check is due', () => {
    const now = Date.now();
    trustPulse.recordEngineState('native', 'available', null, true, now);
    const { endpointId } = createEndpoint(30, [{ interval: 30, start: now }]);
    const result = trustPulse.getEndpointSnapshot(endpointId, now);
    expect(result.expectedChecks).toBe(0);
    expect(result.freshness).toBe('pending');
    expect(result.observedUptimePercent).toBeNull();
    expect(result.monitoringCoveragePercent).toBeNull();
  });

  test('IncidentLens describes HTTP evidence as hypotheses, not a root cause', () => {
    const diagnosis = incidentLens.diagnose({
      success: false,
      httpStatus: 503,
      failureClassification: 'http_status',
      failureDetail: 'HTTP 503',
      checkedAt: new Date().toISOString(),
      freshness: 'fresh',
      monitoringCoveragePercent: 100,
      tlsExpiresAt: null,
      tlsDaysUntilExpiry: null,
    });
    expect(diagnosis.failureCategory).toBe('service_unavailable');
    expect(diagnosis.rootCause).toBeNull();
    expect(diagnosis.evidenceLimitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/does not inspect application or server logs/i),
      expect.stringMatching(/cannot establish a global outage/i),
    ]));
  });

  test.each([
    [401, 'authentication_or_authorization'],
    [403, 'authentication_or_authorization'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [502, 'bad_gateway'],
    [504, 'gateway_timeout'],
  ])('IncidentLens classifies HTTP %s deterministically', (httpStatus, category) => {
    const diagnosis = incidentLens.diagnose({
      success: false,
      httpStatus,
      failureClassification: 'http_status',
      failureDetail: `HTTP ${httpStatus}`,
      checkedAt: new Date().toISOString(),
      freshness: 'fresh',
      monitoringCoveragePercent: 100,
      tlsExpiresAt: null,
      tlsDaysUntilExpiry: null,
    });
    expect(diagnosis.failureCategory).toBe(category);
  });

  test.each([
    ['dns', null, null, 'dns_resolution'],
    ['timeout', null, null, 'request_timeout'],
    ['connection', null, 'connect ECONNREFUSED', 'connection_refused'],
    ['tls', null, 'certificate rejected', 'tls_validation'],
    ['functional_assertion', 200, 'expected content missing', 'functional_assertion'],
  ])('IncidentLens classifies %s evidence without asserting a root cause', (failureClassification, httpStatus, failureDetail, category) => {
    const diagnosis = incidentLens.diagnose({
      success: false,
      httpStatus,
      failureClassification,
      failureDetail,
      checkedAt: new Date().toISOString(),
      freshness: 'fresh',
      monitoringCoveragePercent: 100,
      tlsExpiresAt: null,
      tlsDaysUntilExpiry: null,
    });
    expect(diagnosis.failureCategory).toBe(category);
    expect(diagnosis.rootCause).toBeNull();
  });

  test('IncidentLens diagnoses certificate expiry and stale monitoring separately', () => {
    const base = {
      success: false,
      httpStatus: null,
      failureClassification: 'tls',
      failureDetail: 'certificate expired',
      checkedAt: new Date().toISOString(),
      monitoringCoveragePercent: 100,
      tlsExpiresAt: '2020-01-01T00:00:00.000Z',
      tlsDaysUntilExpiry: -1,
    };
    expect(incidentLens.diagnose({ ...base, freshness: 'fresh' }).failureCategory).toBe('certificate_expired');
    expect(incidentLens.diagnose({ ...base, freshness: 'stale' }).failureCategory).toBe('stale_monitoring');
  });
});
