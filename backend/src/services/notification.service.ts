import db from '../database/db';
import { generateId, nowISO } from '../utils/helpers';

export type NotificationChannel = 'email' | 'webhook';
export type IncidentNotificationEvent = 'incident_created' | 'incident_recovered';

class NotificationService {
  recordIncidentNotification(
    ownerId: string,
    incidentId: string,
    eventType: IncidentNotificationEvent,
    incidentTitle: string,
    endpointName: string
  ): void {
    const now = nowISO();
    const email = process.env.SIMULATED_NOTIFICATION_EMAIL || 'simulated-email';
    const webhook = process.env.SIMULATED_WEBHOOK_LABEL || 'simulated-webhook';
    const payload = JSON.stringify({
      event: eventType,
      incidentId,
      incident: incidentTitle,
      endpoint: endpointName,
      createdAt: now,
      delivery: 'simulated',
    });
    const insert = db.prepare(`
      INSERT INTO notifications
        (id, owner_id, incident_id, channel, event_type, dedupe_key, recipient, payload, delivery_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'simulated', ?)
      ON CONFLICT(dedupe_key) DO NOTHING
    `);

    for (const [channel, recipient] of [
      ['email', email],
      ['webhook', webhook],
    ] as const) {
      insert.run(
        generateId(),
        ownerId,
        incidentId,
        channel,
        eventType,
        `${incidentId}:${eventType}:${channel}`,
        recipient,
        payload,
        now
      );
    }
  }

  listForOwner(ownerId: string, limit = 100): Array<Record<string, unknown>> {
    return db.prepare(`
      SELECT id, incident_id, channel, event_type, recipient, payload, delivery_status, created_at
      FROM notifications WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(ownerId, limit) as Array<Record<string, unknown>>;
  }
}

export default new NotificationService();
