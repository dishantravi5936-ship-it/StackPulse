import net from 'net';
import tls from 'tls';
import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';
import { resolveSafeDestination } from '../utils/urlValidator';
import { logger } from '../utils/logger';

const TLS_TIMEOUT_MS = 5_000;

export interface TlsCheckResult {
  valid: boolean;
  expiresAt: string | null;
  issuer: string | null;
  commonName: string | null;
  daysUntilExpiry: number | null;
  error?: string;
}

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

class TlsService {
  private activeChecks = 0;
  private waiters: Array<() => void> = [];

  async checkEndpoint(rawUrl: string): Promise<TlsCheckResult> {
    await this.acquire();
    try {
      return await this.inspectEndpoint(rawUrl);
    } finally {
      this.release();
    }
  }

  private async inspectEndpoint(rawUrl: string): Promise<TlsCheckResult> {
    let destination;
    try {
      destination = await resolveSafeDestination(rawUrl);
    } catch (error) {
      return {
        valid: false,
        expiresAt: null,
        issuer: null,
        commonName: null,
        daysUntilExpiry: null,
        error: error instanceof Error ? error.message : 'Destination validation failed',
      };
    }

    if (destination.url.protocol !== 'https:') {
      return {
        valid: false,
        expiresAt: null,
        issuer: null,
        commonName: null,
        daysUntilExpiry: null,
        error: 'Not HTTPS',
      };
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: TlsCheckResult): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      const address = destination.addresses[0];
      const socket = tls.connect({
        host: address.address,
        port: destination.port,
        servername: net.isIP(destination.hostname) ? undefined : destination.hostname,
        rejectUnauthorized: false,
      });

      socket.setTimeout(TLS_TIMEOUT_MS, () => {
        finish({
          valid: false,
          expiresAt: null,
          issuer: null,
          commonName: null,
          daysUntilExpiry: null,
          error: 'TLS inspection timed out',
        });
      });
      socket.once('secureConnect', () => {
        const certificate = socket.getPeerCertificate();
        if (!certificate || !certificate.valid_to) {
          finish({
            valid: false,
            expiresAt: null,
            issuer: null,
            commonName: null,
            daysUntilExpiry: null,
            error: 'Peer did not provide a certificate',
          });
          return;
        }

        const expiryMs = Date.parse(certificate.valid_to);
        const expiresAt = Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null;
        const daysUntilExpiry = expiresAt === null
          ? null
          : Math.floor((expiryMs - Date.now()) / 86_400_000);
        finish({
          valid: socket.authorized && daysUntilExpiry !== null && daysUntilExpiry > 0,
          expiresAt,
          issuer: firstValue(certificate.issuer?.O ?? certificate.issuer?.CN),
          commonName: firstValue(certificate.subject?.CN),
          daysUntilExpiry,
          error: socket.authorized ? undefined : socket.authorizationError?.toString() ?? 'Certificate is not trusted',
        });
      });
      socket.once('error', (error) => {
        finish({
          valid: false,
          expiresAt: null,
          issuer: null,
          commonName: null,
          daysUntilExpiry: null,
          error: error.message,
        });
      });
    });
  }

  private async acquire(): Promise<void> {
    if (this.activeChecks < 2) {
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

  async saveResult(endpointId: string, result: TlsCheckResult): Promise<void> {
    db.prepare(`
      INSERT INTO tls_results (id, endpoint_id, valid, expires_at, issuer, common_name, days_until_expiry, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      endpointId,
      result.valid ? 1 : 0,
      result.expiresAt,
      result.issuer,
      result.commonName,
      result.daysUntilExpiry,
      nowISO()
    );
  }

  getLatestResult(endpointId: string): TlsCheckResult | null {
    const row = db.prepare(`
      SELECT valid, expires_at, issuer, common_name, days_until_expiry
      FROM tls_results WHERE endpoint_id = ? ORDER BY checked_at DESC LIMIT 1
    `).get(endpointId) as
      | {
          valid: number;
          expires_at: string | null;
          issuer: string | null;
          common_name: string | null;
          days_until_expiry: number | null;
        }
      | undefined;

    if (!row) return null;
    return {
      valid: row.valid === 1,
      expiresAt: row.expires_at,
      issuer: row.issuer,
      commonName: row.common_name,
      daysUntilExpiry: row.days_until_expiry,
    };
  }

  async checkAndSave(endpointId: string, url: string): Promise<TlsCheckResult> {
    const result = await this.checkEndpoint(url);
    await this.saveResult(endpointId, result);
    if (!result.valid) {
      logger.warn('TLS inspection failed', { endpointId, error: result.error });
    }
    return result;
  }
}

export default new TlsService();
