import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';
import httpMonitorService, { FailureClassification, MonitorResult } from './httpMonitor.service';

const VERIFY_COOLDOWN_MS = 30_000;
const MAX_CONCURRENT_VERIFICATIONS = 2;

export type VerificationOutcome =
  | 'verified_endpoint_failure'
  | 'possible_monitoring_network_failure'
  | 'not_reproduced'
  | 'unverified'
  | 'not_needed';

interface EndpointTarget {
  id: string;
  url: string;
  expected_status: number;
  expected_content: string | null;
  enabled: number;
}

interface VerificationRow {
  id: string;
  endpoint_id: string;
  health_check_id: string | null;
  target_success: number;
  target_status: number | null;
  target_failure_classification: string | null;
  reference_configured: number;
  reference_success: number | null;
  reference_failure_classification: string | null;
  outcome: VerificationOutcome;
  reason: string;
  created_at: string;
}

export interface VerificationResult {
  id?: string;
  endpointId: string;
  scheduledCheckId: string | null;
  outcome: VerificationOutcome;
  reason: string;
  targetRetry: {
    success: boolean | null;
    statusCode: number | null;
    failureClassification: FailureClassification | null;
  };
  referenceCheck: {
    configured: boolean;
    success: boolean | null;
    failureClassification: FailureClassification | null;
  };
  globalOutageConfirmed: false;
  createdAt?: string;
  throttled?: boolean;
}

class FailureVerificationService {
  private inFlight = new Map<string, Promise<VerificationResult>>();
  private activeVerifications = 0;
  private waiters: Array<() => void> = [];

  async verify(endpointId: string, now = Date.now()): Promise<VerificationResult> {
    const active = this.inFlight.get(endpointId);
    if (active) return active;

    const endpoint = db.prepare(`
      SELECT id, url, expected_status, expected_content, enabled FROM endpoints
      WHERE id = ? AND deleted_at IS NULL
    `).get(endpointId) as EndpointTarget | undefined;
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    if (endpoint.enabled !== 1) {
      return this.unverified(endpointId, 'Endpoint monitoring is paused; no retry was sent.');
    }

    const latestFailure = db.prepare(`
      SELECT id, scheduled_check_id FROM health_checks
      WHERE endpoint_id = ? AND source = 'native'
      ORDER BY checked_at DESC, id DESC LIMIT 1
    `).get(endpointId) as { id: string; scheduled_check_id: string } | undefined;
    const latestCheck = db.prepare(`
      SELECT success FROM health_checks
      WHERE endpoint_id = ? AND source = 'native'
      ORDER BY checked_at DESC, id DESC LIMIT 1
    `).get(endpointId) as { success: number } | undefined;
    if (!latestCheck || latestCheck.success === 1 || !latestFailure) {
      return this.unverified(endpointId, 'No recent failed scheduled check requires verification.', 'not_needed');
    }

    const previous = db.prepare(`
      SELECT * FROM failure_verifications WHERE endpoint_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(endpointId) as VerificationRow | undefined;
    if (previous && now - Date.parse(previous.created_at) < VERIFY_COOLDOWN_MS) {
      return { ...this.toResult(previous), throttled: true };
    }

    const promise = this.runVerification(endpoint, latestFailure, now);
    this.inFlight.set(endpointId, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(endpointId);
    }
  }

  getLatest(endpointId: string): VerificationResult | null {
    const row = db.prepare(`
      SELECT * FROM failure_verifications WHERE endpoint_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(endpointId) as VerificationRow | undefined;
    return row ? this.toResult(row) : null;
  }

  private async runVerification(
    endpoint: EndpointTarget,
    failedCheck: { id: string; scheduled_check_id: string },
    now: number
  ): Promise<VerificationResult> {
    await this.acquire();
    try {
      const target = await httpMonitorService.check(
        endpoint.url,
        endpoint.expected_content,
        endpoint.expected_status
      );
      const referenceUrl = process.env.TRUSTPULSE_REFERENCE_URL?.trim();
      let reference: MonitorResult | null = null;
      let outcome: VerificationOutcome;
      let reason: string;

      if (target.success) {
        outcome = 'not_reproduced';
        reason = 'The bounded retry succeeded; the previous failure was not reproduced.';
      } else if (target.failureClassification === 'unsafe_destination') {
        outcome = 'unverified';
        reason = 'The retry was blocked by destination security validation; no network outage conclusion was made.';
      } else if (!referenceUrl) {
        outcome = 'unverified';
        reason = 'The retry failed, but no operator-authorized reference URL is configured.';
      } else {
        reference = await httpMonitorService.check(referenceUrl);
        if (reference.success) {
          outcome = 'verified_endpoint_failure';
          reason = 'The endpoint retry failed while the configured reference destination succeeded from this monitoring location.';
        } else if (reference.failureClassification === 'unsafe_destination') {
          outcome = 'unverified';
          reason = 'The configured reference destination failed destination validation; network status is inconclusive.';
        } else if (['dns', 'connection', 'timeout', 'tls'].includes(reference.failureClassification)) {
          outcome = 'possible_monitoring_network_failure';
          reason = 'Both endpoint and reference checks failed from this monitoring location; a monitoring-network issue is possible.';
        } else {
          outcome = 'unverified';
          reason = 'The reference destination returned an unsuccessful response; monitoring network status is inconclusive.';
        }
      }

      const id = generateId();
      const createdAt = new Date(now).toISOString();
      db.prepare(`
        INSERT INTO failure_verifications
          (id, endpoint_id, health_check_id, target_success, target_status,
           target_failure_classification, reference_configured, reference_success, reference_failure_classification,
           outcome, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        endpoint.id,
        failedCheck.id,
        target.success ? 1 : 0,
        target.statusCode,
        target.success ? null : target.failureClassification,
        referenceUrl ? 1 : 0,
        reference ? reference.success ? 1 : 0 : null,
        reference && !reference.success ? reference.failureClassification : null,
        outcome,
        reason,
        createdAt
      );

      return {
        id,
        endpointId: endpoint.id,
        scheduledCheckId: failedCheck.scheduled_check_id,
        outcome,
        reason,
        targetRetry: {
          success: target.success,
          statusCode: target.statusCode,
          failureClassification: target.success ? null : target.failureClassification,
        },
        referenceCheck: {
          configured: Boolean(referenceUrl),
          success: reference ? reference.success : null,
          failureClassification: reference && !reference.success ? reference.failureClassification : null,
        },
        globalOutageConfirmed: false,
        createdAt,
      };
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeVerifications < MAX_CONCURRENT_VERIFICATIONS) {
      this.activeVerifications += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.activeVerifications -= 1;
  }

  private unverified(
    endpointId: string,
    reason: string,
    outcome: VerificationOutcome = 'unverified'
  ): VerificationResult {
    return {
      endpointId,
      scheduledCheckId: null,
      outcome,
      reason,
      targetRetry: { success: null, statusCode: null, failureClassification: null },
      referenceCheck: { configured: Boolean(process.env.TRUSTPULSE_REFERENCE_URL?.trim()), success: null, failureClassification: null },
      globalOutageConfirmed: false,
    };
  }

  private toResult(row: VerificationRow): VerificationResult {
    return {
      id: row.id,
      endpointId: row.endpoint_id,
      scheduledCheckId: row.health_check_id
        ? (db.prepare('SELECT scheduled_check_id FROM health_checks WHERE id = ?').get(row.health_check_id) as
            { scheduled_check_id: string } | undefined)?.scheduled_check_id ?? null
        : null,
      outcome: row.outcome,
      reason: row.reason,
      targetRetry: {
        success: row.target_success === 1,
        statusCode: row.target_status,
        failureClassification: row.target_failure_classification as FailureClassification | null,
      },
      referenceCheck: {
        configured: row.reference_configured === 1,
        success: row.reference_success === null ? null : row.reference_success === 1,
        failureClassification: row.reference_failure_classification as FailureClassification | null,
      },
      globalOutageConfirmed: false,
      createdAt: row.created_at,
    };
  }
}

export default new FailureVerificationService();
