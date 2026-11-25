import http from 'http';
import https from 'https';
import net from 'net';
import { SafeDestination, resolveSafeDestination } from '../utils/urlValidator';

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CONCURRENT_CHECKS = 3;

export type FailureClassification =
  | 'none'
  | 'http_status'
  | 'dns'
  | 'connection'
  | 'timeout'
  | 'tls'
  | 'functional_assertion'
  | 'response_too_large'
  | 'unsafe_destination';

export interface MonitorResult {
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  failureClassification: FailureClassification;
  error: string | null;
  tlsExpiresAt: string | null;
}

class HttpMonitorService {
  private activeChecks = 0;
  private waiters: Array<() => void> = [];

  async check(rawUrl: string, expectedContent?: string | null): Promise<MonitorResult> {
    await this.acquire();
    try {
      let destination: SafeDestination;
      try {
        destination = await resolveSafeDestination(rawUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Destination validation failed';
        const classification: FailureClassification =
          message.includes('private or reserved') || message.includes('not allowed')
            ? 'unsafe_destination'
            : message.includes('ENOTFOUND') || message.includes('getaddrinfo')
              ? 'dns'
              : 'unsafe_destination';
        return this.failure(classification, message);
      }

      return await this.request(destination, expectedContent ?? undefined);
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeChecks < MAX_CONCURRENT_CHECKS) {
      this.activeChecks += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.activeChecks -= 1;
  }

  private request(destination: SafeDestination, expectedContent?: string): Promise<MonitorResult> {
    return new Promise((resolve) => {
      const { url, hostname, port, addresses } = destination;
      const address = addresses[0];
      const startedAt = Date.now();
      const transport = url.protocol === 'https:' ? https : http;
      let settled = false;
      let timeout: NodeJS.Timeout;
      const finish = (result: MonitorResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const request = transport.request(
        {
          protocol: url.protocol,
          hostname: address.address,
          family: address.family,
          port,
          method: 'GET',
          path: `${url.pathname}${url.search}`,
          headers: {
            host: url.host,
            accept: '*/*',
            'accept-encoding': 'identity',
            connection: 'close',
            'user-agent': 'StackPulse-Monitor/1.0',
          },
          ...(url.protocol === 'https:'
            ? {
                servername: net.isIP(hostname) ? undefined : hostname,
                rejectUnauthorized: true,
              }
            : {}),
        },
        (response) => {
          let bytes = 0;
          let tooLarge = false;
          const responseChunks: Buffer[] = [];
          response.on('data', (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > MAX_RESPONSE_BYTES && !tooLarge) {
              tooLarge = true;
              finish(this.failure('response_too_large', 'Response exceeded size limit', Date.now() - startedAt, response.statusCode ?? null));
              response.destroy();
              return;
            }
            if (expectedContent !== undefined) responseChunks.push(buffer);
          });
          response.on('end', () => {
            const statusCode = response.statusCode ?? null;
            const tlsExpiresAt =
              url.protocol === 'https:'
                ? (response.socket as import('tls').TLSSocket).getPeerCertificate()?.valid_to
                  ? new Date((response.socket as import('tls').TLSSocket).getPeerCertificate().valid_to).toISOString()
                  : null
                : null;
            const httpSuccess = !tooLarge && statusCode !== null && statusCode >= 200 && statusCode < 300;
            const assertionFailed = httpSuccess && expectedContent !== undefined &&
              !Buffer.concat(responseChunks).toString('utf8').includes(expectedContent);
            const success = httpSuccess && !assertionFailed;
            finish({
              success,
              statusCode,
              latencyMs: Date.now() - startedAt,
              failureClassification: tooLarge
                ? 'response_too_large'
                : assertionFailed
                  ? 'functional_assertion'
                  : success
                    ? 'none'
                    : 'http_status',
              error: tooLarge
                ? 'Response exceeded size limit'
                : assertionFailed
                  ? 'HTTP response did not contain the configured expected content'
                  : success
                    ? null
                    : `HTTP ${statusCode ?? 'unknown'}`,
              tlsExpiresAt,
            });
          });
          response.on('error', (error) => {
            finish(this.failure(
              tooLarge ? 'response_too_large' : 'connection',
              tooLarge ? 'Response exceeded size limit' : error.message,
              Date.now() - startedAt,
              response.statusCode ?? null
            ));
          });
        }
      );

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error('Monitoring request timed out'));
      });
      timeout = setTimeout(() => {
        request.destroy(new Error('Monitoring request timed out'));
      }, REQUEST_TIMEOUT_MS);
      request.on('error', (error: NodeJS.ErrnoException) => {
        const classification: FailureClassification =
          error.message.includes('timed out') || error.code === 'ETIMEDOUT'
            ? 'timeout'
            : error.code === 'CERT_HAS_EXPIRED' ||
                error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
                error.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
              ? 'tls'
              : error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN'
                ? 'dns'
                : 'connection';
        finish(this.failure(classification, error.message, Date.now() - startedAt));
      });
      request.end();
    });
  }

  private failure(
    classification: FailureClassification,
    error: string,
    latencyMs: number | null = null,
    statusCode: number | null = null
  ): MonitorResult {
    return {
      success: false,
      statusCode,
      latencyMs,
      failureClassification: classification,
      error,
      tlsExpiresAt: null,
    };
  }
}

export default new HttpMonitorService();
