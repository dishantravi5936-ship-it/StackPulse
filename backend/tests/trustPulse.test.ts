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
const trustPulse = require('../src/services/trustpulse.service').default;
const uptimeService = require('../src/services/uptime.service').default;
const incidentLens = require('../src/services/incidentlens.service').default;

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
