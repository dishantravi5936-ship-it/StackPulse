import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';
import notificationService from './notification.service';

export interface IncidentRow {
  id: string;
  endpoint_id: string | null;
  owner_id: string | null;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'resolved';
  dedupe_key: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface CreateIncidentInput {
  title: string;
  description?: string;
  severity: IncidentRow['severity'];
  status?: IncidentRow['status'];
}

interface MonitorCheck {
  id: string;
  endpoint_id: string;
  owner_id: string;
  endpoint_name: string;
  success: boolean;
}

class IncidentService {
  listForOwner(ownerId: string): IncidentRow[] {
    return db.prepare('SELECT * FROM incidents WHERE owner_id = ? ORDER BY created_at DESC')
      .all(ownerId) as IncidentRow[];
  }

  listActiveForOwner(ownerId: string): IncidentRow[] {
    return db.prepare(
      "SELECT * FROM incidents WHERE owner_id = ? AND status != 'resolved' ORDER BY created_at DESC"
    ).all(ownerId) as IncidentRow[];
  }

  listPublicForEndpoint(endpointId: string): IncidentRow[] {
    return db.prepare(
      'SELECT id, endpoint_id, title, description, severity, status, created_at, updated_at, resolved_at FROM incidents WHERE endpoint_id = ? ORDER BY created_at DESC'
    ).all(endpointId) as IncidentRow[];
  }

  listActivePublic(): IncidentRow[] {
    return db.prepare(`
      SELECT i.id, i.endpoint_id, i.title, i.description, i.severity, i.status,
             i.created_at, i.updated_at, i.resolved_at
      FROM incidents i JOIN endpoints e ON e.id = i.endpoint_id
      WHERE i.status != 'resolved' AND e.public_slug IS NOT NULL AND e.enabled = 1
      ORDER BY i.created_at DESC
    `).all() as IncidentRow[];
  }

  getOwned(id: string, ownerId: string): IncidentRow | undefined {
    return db.prepare('SELECT * FROM incidents WHERE id = ? AND owner_id = ?').get(id, ownerId) as
      | IncidentRow
      | undefined;
  }

  getEvents(incidentId: string): Array<Record<string, unknown>> {
    return db.prepare(
      'SELECT id, event_type, message, health_check_id, created_at FROM incident_events WHERE incident_id = ? ORDER BY created_at, id'
    ).all(incidentId) as Array<Record<string, unknown>>;
  }

  createForCheck(check: MonitorCheck): void {
    const now = nowISO();
    const active = db.prepare(
      "SELECT * FROM incidents WHERE endpoint_id = ? AND status != 'resolved'"
    ).get(check.endpoint_id) as IncidentRow | undefined;

    if (!check.success) {
      const failures = db.prepare(
        'SELECT success FROM health_checks WHERE endpoint_id = ? ORDER BY checked_at DESC, id DESC LIMIT 100'
      ).all(check.endpoint_id) as Array<{ success: number }>;
      let consecutiveFailures = 0;
      for (const row of failures) {
        if (row.success === 1) break;
        consecutiveFailures += 1;
      }

      if (active) {
        db.prepare('UPDATE incidents SET failure_count = ?, updated_at = ? WHERE id = ?')
          .run(consecutiveFailures, now, active.id);
        db.prepare(
          "INSERT INTO incident_events (id, incident_id, event_type, message, health_check_id, created_at) VALUES (?, ?, 'failure', ?, ?, ?)"
        ).run(generateId(), active.id, `Scheduled check failed (${consecutiveFailures} consecutive failures)`, check.id, now);
        return;
      }

      if (consecutiveFailures < 3) return;

      const incidentId = generateId();
      const title = `${check.endpoint_name} is unavailable`;
      const dedupeKey = `endpoint:${check.endpoint_id}:active`;
      db.prepare(`
        INSERT INTO incidents
          (id, endpoint_id, owner_id, title, description, severity, status, dedupe_key, failure_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'critical', 'open', ?, ?, ?, ?)
      `).run(
        incidentId,
        check.endpoint_id,
        check.owner_id,
        title,
        'Three consecutive scheduled monitoring checks failed.',
        dedupeKey,
        consecutiveFailures,
        now,
        now
      );
      db.prepare(
        "INSERT INTO incident_events (id, incident_id, event_type, message, health_check_id, created_at) VALUES (?, ?, 'created', ?, ?, ?)"
      ).run(generateId(), incidentId, 'Incident opened after three consecutive failed checks', check.id, now);
      notificationService.recordIncidentNotification(
        check.owner_id,
        incidentId,
        'incident_created',
        title,
        check.endpoint_name
      );
      return;
    }

    if (!active) return;
    db.prepare(
      "UPDATE incidents SET status = 'resolved', failure_count = 0, updated_at = ?, resolved_at = ? WHERE id = ?"
    ).run(now, now, active.id);
    db.prepare(
      "INSERT INTO incident_events (id, incident_id, event_type, message, health_check_id, created_at) VALUES (?, ?, 'recovered', ?, ?, ?)"
    ).run(generateId(), active.id, 'Incident resolved after a successful scheduled check', check.id, now);
    notificationService.recordIncidentNotification(
      check.owner_id,
      active.id,
      'incident_recovered',
      active.title,
      check.endpoint_name
    );
  }

  create(ownerId: string, input: CreateIncidentInput & { endpoint_id: string }): IncidentRow {
    const endpoint = db.prepare('SELECT id FROM endpoints WHERE id = ? AND owner_id = ?').get(input.endpoint_id, ownerId);
    if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });

    const id = generateId();
    const now = nowISO();
    db.prepare(`
      INSERT INTO incidents (id, endpoint_id, owner_id, title, description, severity, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.endpoint_id, ownerId, input.title, input.description ?? null, input.severity, input.status ?? 'open', now, now);
    db.prepare(
      "INSERT INTO incident_events (id, incident_id, event_type, message, created_at) VALUES (?, ?, 'created', ?, ?)"
    ).run(generateId(), id, 'Incident created by an administrator', now);
    return this.getOwned(id, ownerId)!;
  }

  update(id: string, ownerId: string, patch: Partial<CreateIncidentInput>): IncidentRow {
    const existing = this.getOwned(id, ownerId);
    if (!existing) throw Object.assign(new Error('Incident not found'), { status: 404 });
    const now = nowISO();
    const status = patch.status ?? existing.status;
    const resolvedAt = status === 'resolved' ? existing.resolved_at ?? now : null;
    db.prepare(`
      UPDATE incidents SET title = ?, description = ?, severity = ?, status = ?, updated_at = ?, resolved_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      patch.title ?? existing.title,
      patch.description !== undefined ? patch.description : existing.description,
      patch.severity ?? existing.severity,
      status,
      now,
      resolvedAt,
      id,
      ownerId
    );
    db.prepare(
      "INSERT INTO incident_events (id, incident_id, event_type, message, created_at) VALUES (?, ?, 'updated', ?, ?)"
    ).run(generateId(), id, `Incident updated; status is ${status}`, now);
    return this.getOwned(id, ownerId)!;
  }

  getDetail(id: string, ownerId: string): { incident: IncidentRow; events: Array<Record<string, unknown>> } | undefined {
    const incident = this.getOwned(id, ownerId);
    return incident ? { incident, events: this.getEvents(id) } : undefined;
  }

  listAll(): IncidentRow[] {
    return db.prepare('SELECT * FROM incidents ORDER BY created_at DESC').all() as IncidentRow[];
  }

  listActive(): IncidentRow[] {
    return db.prepare("SELECT * FROM incidents WHERE status != 'resolved' ORDER BY created_at DESC").all() as IncidentRow[];
  }

  getById(id: string): IncidentRow | undefined {
    return db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as IncidentRow | undefined;
  }
}

export default new IncidentService();
