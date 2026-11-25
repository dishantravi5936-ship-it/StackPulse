import { useCallback } from 'react';
import { Activity, Bell, Mail, Webhook } from 'lucide-react';
import api, { unwrap } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import type { ApiEnvelope, Notification } from '../types';
import { formatDate, formatRelative } from '../lib/format';
import { Card, EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '../components/ui';
import { Link } from 'react-router-dom';

export default function NotificationsPage() {
  const load = useCallback(async () => unwrap(await api.get<ApiEnvelope<Notification[]>>('/notifications')), []);
  const { data: notifications, loading, error, refresh } = usePolling(load);

  if (!notifications && loading) return <LoadingBlock />;
  if (!notifications) {
    return (
      <>
        <PageHeader eyebrow="Workspace" title="Notifications" description="Simulated incident alert records." />
        <ErrorBanner>{error ?? 'Unable to load notifications.'}</ErrorBanner>
        <button className="button button-secondary button-sm mt-4" onClick={refresh}>Retry</button>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Notifications" description="A record of simulated email and webhook alerts. No external delivery is performed." />
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}. Showing cached records.</ErrorBanner></div>}
      <Card className="surface-pad">
        <div className="notification-table-head">
          <div><h2 className="surface-title">Alert history</h2><p className="surface-subtitle">{notifications.length} recent records</p></div>
          <span className="simulated-tag"><Activity size={12} /> Simulated delivery</span>
        </div>
        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" description="Notification records are created when an incident opens or recovers." icon={<Bell size={20} />} />
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const isEmail = notification.channel === 'email';
              return (
                <article className="notification-card notification-row-card" key={notification.id}>
                  <span className="notification-mark">{isEmail ? <Mail size={15} /> : <Webhook size={15} />}</span>
                  <div className="notification-copy">
                    <strong>{notification.event_type === 'incident_created' ? 'Incident opened' : 'Incident recovered'}</strong>
                    <p>{notification.channel === 'email' ? 'Simulated email' : 'Simulated webhook'} to {notification.recipient}</p>
                    <small className="notification-payload">{notification.payload}</small>
                  </div>
                  <span className="notification-meta" title={formatDate(notification.created_at)}>{formatRelative(notification.created_at)}</span>
                  {notification.incident_id && <Link className="table-action" to={`/dashboard/incidents/${notification.incident_id}`} aria-label="View incident"><Bell size={14} /></Link>}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
