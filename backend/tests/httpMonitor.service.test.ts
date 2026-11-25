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

  beforeAll(async () => {
    server = http.createServer((_request, response) => {
      response.statusCode = responseStatus;
      response.end(responseBody);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test HTTP server failed to start');
    port = address.port;
  });

  afterAll(async () => {
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

  test('classifies a refused connection without following redirects', async () => {
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
