import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { MonitorResult } from '../src/services/httpMonitor.service';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackpulse-verify-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'stackpulse.db');
process.env.JWT_SECRET = 'failure-verification-test-secret-long-enough';
process.env.ADMIN_BOOTSTRAP_TOKEN = 'failure-verification-test-bootstrap-token';
process.env.GATUS_DYNAMIC_CONFIG_ENABLED = 'false';
process.env.NODE_ENV = 'test';

const database = require('../src/database/db');
const db = database.default as import('better-sqlite3').Database;
const httpMonitor = require('../src/services/httpMonitor.service').default;
const verificationService = require('../src/services/failureVerification.service').default;
const ownerId = randomUUID();

function createFailedEndpoint(): string {
  const endpointId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO endpoints (id, owner_id, name, group_name, url, expected_content, gatus_key, interval_seconds, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 30, 1, ?, ?)')
    .run(endpointId, ownerId, 'Verification test', 'test', 'https://service.test/health', 'ready marker', `stackpulse_${endpointId.replace(/-/g, '')}`, now, now);
  const scheduleId = randomUUID();
  db.prepare('INSERT INTO endpoint_schedule_history (id, endpoint_id, interval_seconds, starts_at, created_at) VALUES (?, ?, 30, ?, ?)')
    .run(scheduleId, endpointId, now, now);
  const checkedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO health_checks
      (id, endpoint_id, schedule_id, scheduled_check_id, http_status, checked_at,
       success, failure_classification, source, created_at)
    VALUES (?, ?, ?, ?, 503, ?, 0, 'http_status', 'native', ?)
  `).run(randomUUID(), endpointId, scheduleId, `scheduled:${endpointId}`, checkedAt, checkedAt);
  return endpointId;
}

function result(overrides: Partial<MonitorResult>): MonitorResult {
  return {
    success: false,
    statusCode: null,
    latencyMs: 20,
    failureClassification: 'timeout',
    error: 'request timed out',
    tlsExpiresAt: null,
    ...overrides,
  };
}

describe('bounded Failure Verification', () => {
  const checkSpy = jest.spyOn(httpMonitor, 'check');

  beforeAll(() => {
    database.runMigrations();
    db.prepare('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(ownerId, 'verify@example.test', 'not-used', 'admin', new Date().toISOString());
  });

  beforeEach(() => {
    checkSpy.mockReset();
    process.env.TRUSTPULSE_REFERENCE_URL = 'https://authorized-reference.test/health';
  });

  afterAll(() => {
    checkSpy.mockRestore();
    delete process.env.TRUSTPULSE_REFERENCE_URL;
    db.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test('verifies a repeated endpoint failure against the authorized reference without adding a scheduled result', async () => {
    const endpointId = createFailedEndpoint();
    checkSpy
      .mockResolvedValueOnce(result({ statusCode: 503, failureClassification: 'http_status', error: 'HTTP 503' }))
      .mockResolvedValueOnce(result({ success: true, statusCode: 200, failureClassification: 'none', error: null }));

    const verification = await verificationService.verify(endpointId);
    expect(verification.outcome).toBe('verified_endpoint_failure');
    expect(verification.globalOutageConfirmed).toBe(false);
    expect(verification.targetRetry.success).toBe(false);
    expect(verification.referenceCheck.success).toBe(true);
    expect(checkSpy).toHaveBeenNthCalledWith(1, 'https://service.test/health', 'ready marker');
    expect(checkSpy).toHaveBeenNthCalledWith(2, 'https://authorized-reference.test/health');
    const storedChecks = db.prepare(
      'SELECT COUNT(*) AS count FROM health_checks WHERE endpoint_id = ?'
    ).get(endpointId) as { count: number };
    expect(storedChecks.count).toBe(1);

    const throttled = await verificationService.verify(endpointId, Date.now() + 1_000);
    expect(throttled.throttled).toBe(true);
    expect(checkSpy).toHaveBeenCalledTimes(2);
  });

  test('classifies simultaneous endpoint and reference failures as a possible monitoring-network failure', async () => {
    const endpointId = createFailedEndpoint();
    checkSpy
      .mockResolvedValueOnce(result({ failureClassification: 'connection', error: 'ECONNREFUSED' }))
      .mockResolvedValueOnce(result({ failureClassification: 'timeout', error: 'request timed out' }));

    const verification = await verificationService.verify(endpointId);
    expect(verification.outcome).toBe('possible_monitoring_network_failure');
    expect(verification.globalOutageConfirmed).toBe(false);
  });

  test('marks a passing retry as not reproduced and skips the reference request', async () => {
    const endpointId = createFailedEndpoint();
    checkSpy.mockResolvedValueOnce(result({
      success: true,
      statusCode: 200,
      failureClassification: 'none',
      error: null,
    }));

    const verification = await verificationService.verify(endpointId);
    expect(verification.outcome).toBe('not_reproduced');
    expect(verification.referenceCheck.configured).toBe(true);
    expect(verification.referenceCheck.success).toBeNull();
    expect(checkSpy).toHaveBeenCalledTimes(1);
  });

  test('returns unverified when no operator-authorized reference URL is configured', async () => {
    const endpointId = createFailedEndpoint();
    delete process.env.TRUSTPULSE_REFERENCE_URL;
    checkSpy.mockResolvedValueOnce(result({ failureClassification: 'dns', error: 'getaddrinfo ENOTFOUND service.test' }));

    const verification = await verificationService.verify(endpointId);
    expect(verification.outcome).toBe('unverified');
    expect(verification.referenceCheck.configured).toBe(false);
    expect(checkSpy).toHaveBeenCalledTimes(1);
  });
});
