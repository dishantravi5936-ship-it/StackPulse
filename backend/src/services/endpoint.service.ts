import { randomBytes } from 'crypto';
import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';
import { resolveSafeDestination } from '../utils/urlValidator';
import configService, { ConfigEndpoint } from './config.service';
import gatusService from './gatus.service';
import trustPulseService from './trustpulse.service';
import { logger } from '../utils/logger';

export type MonitoringInterval = 30 | 60 | 120;

export interface EndpointRow {
  id: string;
  owner_id: string | null;
  name: string;
  group_name: string;
  url: string;
  expected_status: number;
  expected_content: string | null;
  gatus_key: string;
  public_slug: string | null;
  interval_seconds: MonitoringInterval;
  enabled: number;
  created_at: string;
  updated_at: string;
  paused_at: string | null;
  deleted_at: string | null;
}

export interface EndpointInput {
  name: string;
  url: string;
  interval_seconds: MonitoringInterval;
  group_name?: string;
  expected_status?: number;
  is_public?: boolean;
  expected_content?: string | null;
}

interface ScheduleRow {
  id: string;
  interval_seconds: MonitoringInterval;
  starts_at: string;
}

class EndpointService {
  private async validateUrl(url: string): Promise<void> {
    try {
      await resolveSafeDestination(url);
    } catch (error) {
      throw Object.assign(
        new Error(error instanceof Error ? error.message : 'Endpoint URL is not allowed'),
        { status: 400, code: 'INVALID_DESTINATION' }
      );
    }
  }

  list(): EndpointRow[] {
    return db.prepare('SELECT * FROM endpoints WHERE deleted_at IS NULL ORDER BY group_name, name').all() as EndpointRow[];
  }

  listEnabled(): EndpointRow[] {
    return db.prepare('SELECT * FROM endpoints WHERE enabled = 1 AND deleted_at IS NULL ORDER BY created_at').all() as EndpointRow[];
  }

  listOwned(ownerId: string): EndpointRow[] {
    return db.prepare(
      'SELECT * FROM endpoints WHERE owner_id = ? AND deleted_at IS NULL ORDER BY group_name, name'
    ).all(ownerId) as EndpointRow[];
  }

  listPublicEnabled(): EndpointRow[] {
    return db.prepare(`
      SELECT * FROM endpoints WHERE enabled = 1 AND public_slug IS NOT NULL AND deleted_at IS NULL
      ORDER BY group_name, name
    `).all() as EndpointRow[];
  }

  getById(id: string): EndpointRow | undefined {
    return db.prepare('SELECT * FROM endpoints WHERE id = ? AND deleted_at IS NULL').get(id) as EndpointRow | undefined;
  }

  getOwned(id: string, ownerId: string): EndpointRow | undefined {
    return db.prepare(
      'SELECT * FROM endpoints WHERE id = ? AND owner_id = ? AND deleted_at IS NULL'
    ).get(id, ownerId) as EndpointRow | undefined;
  }

  async create(ownerId: string, input: EndpointInput): Promise<EndpointRow> {
    await this.validateUrl(input.url);
    const id = generateId();
    const now = nowISO();
    const gatusKey = `stackpulse_${id.replace(/-/g, '')}`;
    const publicSlug = input.is_public ? randomBytes(18).toString('base64url') : null;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO endpoints
          (id, owner_id, name, group_name, url, expected_status, expected_content, gatus_key, public_slug, interval_seconds, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id,
        ownerId,
        input.name.trim(),
        input.group_name?.trim() || 'default',
        input.url,
        input.expected_status ?? 200,
        input.expected_content?.trim() || null,
        gatusKey,
        publicSlug,
        input.interval_seconds,
        now,
        now
      );
      db.prepare(
        'INSERT INTO endpoint_schedule_history (id, endpoint_id, interval_seconds, starts_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(generateId(), id, input.interval_seconds, now, now);
    })();

    await this.syncGatusConfig();
    logger.info('Endpoint created', { id, ownerId, gatusKey });
    return this.getOwned(id, ownerId)!;
  }

  async update(id: string, ownerId: string, patch: Partial<EndpointInput>): Promise<EndpointRow> {
    const existing = this.getOwned(id, ownerId);
    if (!existing) throw Object.assign(new Error('Endpoint not found'), { status: 404 });

    const url = patch.url ?? existing.url;
    const expectedStatus = patch.expected_status ?? existing.expected_status;
    const expectedContent = patch.expected_content === undefined
      ? existing.expected_content
      : patch.expected_content?.trim() || null;
    await this.validateUrl(url);
    const name = patch.name?.trim() ?? existing.name;
    const groupName = patch.group_name?.trim() ?? existing.group_name;
    const interval = patch.interval_seconds ?? existing.interval_seconds;
    const publicSlug =
      patch.is_public === undefined
        ? existing.public_slug
        : patch.is_public
          ? existing.public_slug ?? randomBytes(18).toString('base64url')
          : null;
    const now = nowISO();

    db.transaction(() => {
      db.prepare(`
        UPDATE endpoints
        SET name = ?, group_name = ?, url = ?, expected_status = ?, expected_content = ?, interval_seconds = ?, public_slug = ?, updated_at = ?
        WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
      `).run(name, groupName, url, expectedStatus, expectedContent, interval, publicSlug, now, id, ownerId);
      if (interval !== existing.interval_seconds || url !== existing.url) {
        db.prepare(
          "UPDATE endpoint_schedule_history SET ends_at = ? WHERE endpoint_id = ? AND ends_at IS NULL"
        ).run(now, id);
        db.prepare(
          'INSERT INTO endpoint_schedule_history (id, endpoint_id, interval_seconds, starts_at, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(generateId(), id, interval, now, now);
      }
    })();

    await this.syncGatusConfig();
    logger.info('Endpoint updated', { id, ownerId });
    return this.getOwned(id, ownerId)!;
  }

  async pause(id: string, ownerId: string): Promise<EndpointRow> {
    const endpoint = this.getOwned(id, ownerId);
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    if (endpoint.enabled === 1) {
      const now = nowISO();
      db.transaction(() => {
        db.prepare('UPDATE endpoints SET enabled = 0, paused_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
        db.prepare(
          'UPDATE endpoint_schedule_history SET ends_at = ? WHERE endpoint_id = ? AND ends_at IS NULL'
        ).run(now, id);
      })();
      await this.syncGatusConfig();
    }
    return this.getOwned(id, ownerId)!;
  }

  async resume(id: string, ownerId: string): Promise<EndpointRow> {
    const endpoint = this.getOwned(id, ownerId);
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    if (endpoint.enabled === 0) {
      const now = nowISO();
      db.transaction(() => {
        db.prepare('UPDATE endpoints SET enabled = 1, paused_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
        db.prepare(
          'INSERT INTO endpoint_schedule_history (id, endpoint_id, interval_seconds, starts_at, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(generateId(), id, endpoint.interval_seconds, now, now);
      })();
      await this.syncGatusConfig();
    }
    return this.getOwned(id, ownerId)!;
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const endpoint = this.getOwned(id, ownerId);
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    const now = nowISO();
    db.transaction(() => {
      db.prepare(
        'UPDATE endpoints SET enabled = 0, public_slug = NULL, deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?'
      ).run(now, now, id, ownerId);
      db.prepare(
        'UPDATE endpoint_schedule_history SET ends_at = ? WHERE endpoint_id = ? AND ends_at IS NULL'
      ).run(now, id);
    })();
    await this.syncGatusConfig();
    logger.info('Endpoint archived', { id, ownerId });
  }

  getCurrentSchedule(endpointId: string): ScheduleRow | undefined {
    return db.prepare(`
      SELECT id, interval_seconds, starts_at FROM endpoint_schedule_history
      WHERE endpoint_id = ? AND ends_at IS NULL ORDER BY starts_at DESC LIMIT 1
    `).get(endpointId) as ScheduleRow | undefined;
  }

  getChecks(id: string, ownerId: string, limit = 100): Array<Record<string, unknown>> {
    if (!this.getOwned(id, ownerId)) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
    const rows = db.prepare(`
      SELECT id, schedule_id AS scheduleId, scheduled_check_id AS scheduledCheckId,
             engine_result_id AS engineResultId, http_status AS httpStatus, latency_ms AS latencyMs,
             checked_at AS checkedAt, success, failure_classification AS failureClassification,
             failure_detail AS failureDetail, tls_expires_at AS tlsExpiresAt, source
      FROM health_checks WHERE endpoint_id = ? ORDER BY checked_at DESC LIMIT ?
    `).all(id, limit) as Array<Record<string, unknown> & { success: number }>;
    return rows.map((row) => ({ ...row, success: row.success === 1 }));
  }

  async syncGatusConfig(): Promise<void> {
    const endpoints = this.listEnabled() as ConfigEndpoint[];
    if (!configService.isDynamicConfigEnabled()) {
      this.setEngineState('disabled', 'Dynamic Gatus checks disabled until egress restrictions are demonstrated');
      return;
    }
    if (!(await gatusService.isReachable())) {
      this.setEngineState('unavailable', 'Gatus health endpoint is unreachable; native monitoring remains active');
      return;
    }
    try {
      const timeoutMs = endpoints.length === 0
        ? 15_000
        : Math.min(Math.max(...endpoints.map((endpoint) => endpoint.interval_seconds * 1000)) + 15_000, 150_000);
      const updated = await configService.writeFromEndpoints(
        endpoints,
        (updatedAt) => endpoints.length > 0
          ? gatusService.hasFreshResults(endpoints.map((endpoint) => endpoint.gatus_key), updatedAt)
          : gatusService.hasNoStackPulseEndpoints(),
        timeoutMs,
        {
          started: () => trustPulseService.startInterruption('gatus', 'configuration_reload', true),
          finished: (interruptionId) => trustPulseService.endInterruption(interruptionId),
        }
      );
      if (updated) this.setEngineState('available', null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gatus configuration update failed';
      this.setEngineState('degraded', message);
      logger.error('Gatus config update failed; native monitoring remains authoritative', { error: message });
    }
  }

  getByPublicSlug(slug: string): EndpointRow | undefined {
    return db.prepare(
      'SELECT * FROM endpoints WHERE public_slug = ? AND enabled = 1 AND deleted_at IS NULL'
    ).get(slug) as EndpointRow | undefined;
  }

  getEngineHealth(): Array<Record<string, unknown>> {
    return db.prepare(
      'SELECT engine, status, version, image_digest, last_checked_at, last_error, updated_at FROM monitoring_engine_health ORDER BY engine'
    ).all() as Array<Record<string, unknown>>;
  }

  private setEngineState(status: 'available' | 'unavailable' | 'disabled' | 'degraded', error: string | null): void {
    trustPulseService.recordEngineState('gatus', status, error);
  }

  seedDefaultsIfEmpty(): void {
    // No implicit endpoints: monitoring begins only after an administrator creates one.
  }
}

export default new EndpointService();
