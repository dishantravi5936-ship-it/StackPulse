import fs from 'fs';
import os from 'os';
import path from 'path';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackpulse-api-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'stackpulse.db');
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-to-satisfy-validation';
process.env.ADMIN_BOOTSTRAP_TOKEN = 'test-bootstrap-token-that-is-long-enough';
process.env.GATUS_DYNAMIC_CONFIG_ENABLED = 'false';
process.env.NODE_ENV = 'test';

const app = require('../src/app').default as import('express').Express;
const database = require('../src/database/db');
const authService = require('../src/services/auth.service').default;
const monitoringService = require('../src/services/monitoring.service').default;
const httpMonitor = require('../src/services/httpMonitor.service').default;
const incidentService = require('../src/services/incident.service').default;
const { generateId, nowISO } = require('../src/utils/helpers');
const trustPulseService = require('../src/services/trustpulse.service').default;

describe('MVP backend API', () => {
  let server: import('http').Server;
  let baseUrl: string;
  let adminToken: string;
  let userToken: string;
  let endpointId: string;
  let publicSlug: string;
  let checkId: string;
  const checkSpy = jest.spyOn(httpMonitor, 'check').mockResolvedValue({
    success: true,
    statusCode: 200,
    latencyMs: 8,
    failureClassification: 'none',
    error: null,
    tlsExpiresAt: null,
  });

  beforeAll(async () => {
    database.runMigrations();
    trustPulseService.recordEngineState('native', 'available');
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    checkSpy.mockRestore();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.default.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  async function request(pathname: string, method = 'GET', body?: unknown, token = adminToken): Promise<{
    response: Response;
    body: Record<string, unknown>;
  }> {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, body: await response.json() as Record<string, unknown> };
  }

  test('registers the first administrator and authenticates a subsequent account', async () => {
    const missingBootstrap = await request('/api/auth/register', 'POST', {
      email: 'admin@example.test',
      password: 'a-strong-test-password-1',
    }, '');
    expect(missingBootstrap.response.status).toBe(403);
    expect(missingBootstrap.body.error).toMatchObject({ code: 'ADMIN_BOOTSTRAP_REQUIRED' });

    const invalidBootstrap = await request('/api/auth/register', 'POST', {
      email: 'admin@example.test',
      password: 'a-strong-test-password-1',
      bootstrapToken: 'incorrect-bootstrap-token',
    }, '');
    expect(invalidBootstrap.response.status).toBe(403);
    expect(invalidBootstrap.body.error).toMatchObject({ code: 'ADMIN_BOOTSTRAP_INVALID' });

    const registered = await request('/api/auth/register', 'POST', {
      email: 'admin@example.test',
      password: 'a-strong-test-password-1',
      bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN,
    }, '');
    expect(registered.response.status).toBe(201);
    adminToken = registered.body.token as string;
    expect(registered.body.user).toMatchObject({ email: 'admin@example.test', role: 'admin' });

    const login = await request('/api/auth/login', 'POST', {
      email: 'admin@example.test',
      password: 'a-strong-test-password-1',
    }, '');
    expect(login.response.status).toBe(200);
    expect(authService.verifyToken(login.body.token as string)).toMatchObject({
      email: 'admin@example.test',
      role: 'admin',
    });

    const regular = await authService.register('user@example.test', 'another-strong-test-password');
    userToken = regular.token;
    expect(regular.user.role).toBe('user');
  });

  test('creates an owned endpoint, runs a check, exposes public status, and enforces owner/admin access', async () => {
    const created = await request('/api/endpoints', 'POST', {
      name: 'Authorized Test Target',
      url: 'http://8.8.8.8/health',
      expected_content: 'service ready',
      interval_seconds: 30,
      is_public: true,
    });
    expect(created.response.status).toBe(201);
    const data = created.body.data as { endpoint: { id: string; gatus_key: string; public_slug: string }; latestCheck: { id: string } };
    endpointId = data.endpoint.id;
    publicSlug = data.endpoint.public_slug;
    checkId = data.latestCheck.id;
    expect(data.endpoint.gatus_key).toBe(`stackpulse_${endpointId.replace(/-/g, '')}`);
    expect(data.latestCheck).toMatchObject({ httpStatus: 200, success: true, source: 'native' });
    expect(checkSpy).toHaveBeenCalledWith('http://8.8.8.8/health', 'service ready', 200);

    const checks = await request(`/api/endpoints/${endpointId}/checks`);
    expect(checks.response.status).toBe(200);
    expect((checks.body.data as Array<{ id: string }>)[0].id).toBe(checkId);

    const repeatedCheck = await monitoringService.checkNow(endpointId);
    expect(repeatedCheck.id).toBe(checkId);
    expect(checkSpy).toHaveBeenCalledTimes(1);

    const otherOwner = await request(`/api/endpoints/${endpointId}`, 'GET', undefined, userToken);
    expect(otherOwner.response.status).toBe(404);
    const unauthorizedCreate = await request('/api/endpoints', 'POST', {
      name: 'Not approved',
      url: 'http://8.8.8.8/',
      interval_seconds: 30,
    }, userToken);
    expect(unauthorizedCreate.response.status).toBe(403);

    const publicStatus = await request(`/api/public/status/${publicSlug}`, 'GET', undefined, '');
    expect(publicStatus.response.status).toBe(200);
    const publicData = publicStatus.body.data as {
      endpoint: Record<string, unknown>;
      history: Array<Record<string, unknown>>;
    };
    const publicEndpoint = publicData.endpoint;
    expect(publicEndpoint).toMatchObject({ id: endpointId, name: 'Authorized Test Target', status: 'operational' });
    expect(publicEndpoint).not.toHaveProperty('url');
    expect(publicData.history[0]).toMatchObject({ success: true, httpStatus: 200 });
    expect(publicData.history[0]).not.toHaveProperty('failureClassification');

    const detail = await request(`/api/endpoints/${endpointId}`);
    expect(detail.body.data).toHaveProperty('trustPulse');
    expect(detail.body.data).toHaveProperty('incidentLens');
    expect((detail.body.data as { trustPulse: { observedUptimePercent: number | null } }).trustPulse.observedUptimePercent).toBeNull();
    const dashboard = await request('/api/dashboard');
    const dashboardData = dashboard.body.data as { endpoints: Array<Record<string, unknown>> };
    expect(dashboardData.endpoints[0]).toHaveProperty('trustPulse');
    expect(dashboardData.endpoints[0]).toHaveProperty('incidentLens');

    const verification = await request(`/api/endpoints/${endpointId}/verify`, 'POST', {});
    expect((verification.body.data as { outcome: string; globalOutageConfirmed: boolean })).toMatchObject({
      outcome: 'not_needed',
      globalOutageConfirmed: false,
    });
  });

  test('applies supported interval changes, pause/resume, and soft deletion without erasing checks', async () => {
    const patched = await request(`/api/endpoints/${endpointId}`, 'PATCH', {
      interval_seconds: 60,
      expected_status: 204,
    });
    expect(patched.response.status).toBe(200);
    expect((patched.body.data as { interval_seconds: number }).interval_seconds).toBe(60);
    expect((patched.body.data as { expected_status: number }).expected_status).toBe(204);

    const paused = await request(`/api/endpoints/${endpointId}/pause`, 'POST', {});
    expect(paused.response.status).toBe(200);
    expect((paused.body.data as { enabled: number }).enabled).toBe(0);

    const resumed = await request(`/api/endpoints/${endpointId}/resume`, 'POST', {});
    expect(resumed.response.status).toBe(200);
    expect((resumed.body.data as { enabled: number }).enabled).toBe(1);

    const deleted = await request(`/api/endpoints/${endpointId}`, 'DELETE');
    expect(deleted.response.status).toBe(200);
    expect(database.default.prepare('SELECT COUNT(*) AS count FROM health_checks WHERE id = ?').get(checkId).count).toBe(1);
    expect((await request('/api/endpoints')).body.data).toEqual([]);
    expect((await request(`/api/public/status/${publicSlug}`, 'GET', undefined, '')).response.status).toBe(404);
  });

  test('opens one incident after three failures, records notifications, and resolves only on success', async () => {
    const now = Date.now();
    const endpointRow = database.default.prepare(
      'SELECT owner_id, name FROM endpoints WHERE id = ?'
    ).get(endpointId) as { owner_id: string; name: string };
    for (let index = 1; index <= 4; index += 1) {
      const id = generateId();
      const checkedAt = new Date(now + index * 1000).toISOString();
      database.default.prepare(`
        INSERT INTO health_checks
          (id, endpoint_id, schedule_id, scheduled_check_id, http_status, latency_ms, checked_at, success, failure_classification, source, created_at)
        VALUES (?, ?, NULL, ?, 503, 5, ?, 0, 'http_status', 'native', ?)
      `).run(id, endpointId, `incident-test:${index}`, checkedAt, checkedAt);
      incidentService.createForCheck({
        id,
        endpoint_id: endpointId,
        owner_id: endpointRow.owner_id,
        endpoint_name: endpointRow.name,
        success: false,
      });
    }

    const active = database.default.prepare(
      "SELECT * FROM incidents WHERE endpoint_id = ? AND status != 'resolved'"
    ).all(endpointId);
    const recordedChecks = database.default.prepare(
      'SELECT success FROM health_checks WHERE endpoint_id = ? ORDER BY checked_at DESC, id DESC LIMIT 10'
    ).all(endpointId);
    expect(recordedChecks).toHaveLength(5);
    expect(recordedChecks.map((row: { success: number }) => row.success)).toEqual([0, 0, 0, 0, 1]);
    expect(active).toHaveLength(1);
    expect(active[0].failure_count).toBe(4);
    expect(database.default.prepare('SELECT COUNT(*) AS count FROM notifications WHERE incident_id = ?').get(active[0].id).count).toBe(2);
    expect(database.default.prepare('SELECT COUNT(*) AS count FROM incident_events WHERE incident_id = ?').get(active[0].id).count).toBe(2);

    const recoveryId = generateId();
    const recoveredAt = new Date(now + 6000).toISOString();
    database.default.prepare(`
      INSERT INTO health_checks
        (id, endpoint_id, schedule_id, scheduled_check_id, http_status, latency_ms, checked_at, success, source, created_at)
      VALUES (?, ?, NULL, 'incident-test:recovery', 200, 5, ?, 1, 'native', ?)
    `).run(recoveryId, endpointId, recoveredAt, recoveredAt);
    incidentService.createForCheck({
      id: recoveryId,
      endpoint_id: endpointId,
      owner_id: endpointRow.owner_id,
      endpoint_name: endpointRow.name,
      success: true,
    });

    const resolved = database.default.prepare('SELECT status, resolved_at FROM incidents WHERE id = ?').get(active[0].id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_at).toBeTruthy();
    expect(database.default.prepare('SELECT COUNT(*) AS count FROM notifications WHERE incident_id = ?').get(active[0].id).count).toBe(4);
  });
});
