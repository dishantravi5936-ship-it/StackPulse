import http from 'http';
import net from 'net';

jest.mock('../src/utils/urlValidator', () => ({
  resolveSafeDestination: async (rawUrl: string) => {
    const url = new URL(rawUrl);
    return {
      url,
      hostname: url.hostname,
      port: Number(url.port || '80'),
      addresses: [{ address: '127.0.0.1', family: 4 }],
    };
  },
}));

const httpMonitor = require('../src/services/httpMonitor.service').default;

describe('bounded native HTTP monitoring', () => {
  let server: http.Server;
  let port: number;
  let responseStatus = 200;
  let responseBody = 'service is healthy';
  let responseDelayMs = 0;
  let requestCount = 0;
  const responseTimers: ReturnType<typeof setTimeout>[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      requestCount += 1;
      const status = request.url === '/404' ? 404 : request.url === '/redirected' ? 200 : responseStatus;
      response.statusCode = status;
      if (request.url === '/redirect') {
        response.setHeader('Location', `http://service.test:${port}/redirected`);
      }
      const timer = setTimeout(() => response.end(responseBody), responseDelayMs);
      responseTimers.push(timer);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test HTTP server failed to start');
    port = address.port;
  });

  afterAll(async () => {
    responseTimers.forEach(clearTimeout);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test('classifies a healthy website response as successful', async () => {
    responseStatus = 200;
    responseBody = 'service is healthy';
    const result = await httpMonitor.check(`http://service.test:${port}/health`);
    expect(result).toMatchObject({ success: true, statusCode: 200, failureClassification: 'none' });
  });

  test('records an actual HTTP 503 as an HTTP failure', async () => {
    responseStatus = 503;
    responseBody = 'temporarily unavailable';
    const result = await httpMonitor.check(`http://service.test:${port}/health`);
    expect(result).toMatchObject({ success: false, statusCode: 503, failureClassification: 'http_status' });
  });

  test('records an actual HTTP 404 as an HTTP failure', async () => {
    responseStatus = 200;
    responseDelayMs = 0;
    const result = await httpMonitor.check(`http://service.test:${port}/404`);
    expect(result).toMatchObject({ success: false, statusCode: 404, failureClassification: 'http_status' });
  });

  test('measures real response latency', async () => {
    responseStatus = 200;
    responseBody = 'service is healthy';
    responseDelayMs = 120;
    const result = await httpMonitor.check(`http://service.test:${port}/delayed`);
    responseDelayMs = 0;
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).not.toBeNull();
    expect(result.latencyMs ?? 0).toBeGreaterThanOrEqual(100);
  });

  test('terminates a request that exceeds the eight-second timeout', async () => {
    responseStatus = 200;
    responseBody = 'too late';
    responseDelayMs = 9_000;
    const result = await httpMonitor.check(`http://service.test:${port}/timeout`);
    responseDelayMs = 0;
    expect(result).toMatchObject({
      success: false,
      statusCode: null,
      failureClassification: 'timeout',
    });
    expect(result.latencyMs).not.toBeNull();
  }, 12_000);

  test('matches a configured exact HTTP status instead of accepting any 2xx response', async () => {
    responseStatus = 204;
    responseBody = '';
    const expected = await httpMonitor.check(`http://service.test:${port}/health`, null, 204);
    const unexpected = await httpMonitor.check(`http://service.test:${port}/health`, null, 201);

    expect(expected).toMatchObject({ success: true, statusCode: 204, failureClassification: 'none' });
    expect(unexpected).toMatchObject({
      success: false,
      statusCode: 204,
      failureClassification: 'http_status',
      error: 'Expected HTTP 201, received 204',
    });
  });

  test('fails a 200 response when the configured expected content is absent', async () => {
    responseStatus = 200;
    responseBody = 'healthy page';
    const result = await httpMonitor.check(`http://service.test:${port}/health`, 'expected marker');
    expect(result).toMatchObject({
      success: false,
      statusCode: 200,
      failureClassification: 'functional_assertion',
    });
  });

  test('does not follow an HTTP redirect', async () => {
    responseStatus = 302;
    responseBody = '';
    requestCount = 0;

    const result = await httpMonitor.check(`http://service.test:${port}/redirect`);

    expect(result).toMatchObject({
      success: false,
      statusCode: 302,
      failureClassification: 'http_status',
    });
    expect(requestCount).toBe(1);
  });

  test('classifies a refused connection', async () => {
    const closedServer = net.createServer();
    await new Promise<void>((resolve) => closedServer.listen(0, '127.0.0.1', resolve));
    const address = closedServer.address();
    if (!address || typeof address === 'string') throw new Error('Could not allocate a refusal-test port');
    await new Promise<void>((resolve, reject) => closedServer.close((error) => error ? reject(error) : resolve()));

    const result = await httpMonitor.check(`http://service.test:${address.port}/health`);
    expect(result.success).toBe(false);
    expect(result.failureClassification).toBe('connection');
    expect(result.error).toMatch(/ECONNREFUSED|connection refused/i);
  });
});
