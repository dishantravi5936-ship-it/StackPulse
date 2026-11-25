import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowUpRight, AlertCircle, Clock3, ShieldCheck } from 'lucide-react';
import api, { unwrap } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import type {
  ApiEnvelope,
  EndpointDetail,
  EndpointWithIntelligence,
  Incident,
  IncidentDetail,
  Notification,
} from '../types';
import { formatDate, formatRelative } from '../lib/format';
import { Button, Card, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from '../components/ui';

type IncidentFilter = 'active' | 'resolved' | 'all';

interface IncidentListData {
  incidents: Incident[];
  endpoints: EndpointWithIntelligence[];
}

interface IncidentDetailData {
  detail: IncidentDetail;
  endpoint: EndpointDetail | null;
  notifications: Notification[];
}

function IncidentRow({
  incident,
  endpointName,
}: {
  incident: Incident;
  endpointName?: string;
}) {
  return (
    <Link to={`/dashboard/incidents/${incident.id}`} className="incident-card surface">
      <span className={`incident-card-icon ${incident.status === 'resolved' ? 'incident-resolved' : ''}`}>
        {incident.status === 'resolved' ? <ShieldCheck size={17} /> : <AlertCircle size={17} />}
      </span>
      <span className="incident-card-copy">
        <strong>{incident.title}</strong>
        <small>{endpointName ?? 'Endpoint'} · {incident.description ?? 'No description provided'}</small>
      </span>
      <span className={`severity-pill severity-${incident.severity}`}>{incident.severity}</span>
      <span className={`incident-status-text incident-status-${incident.status}`}>{incident.status}</span>
      <span className="incident-date">{formatRelative(incident.updated_at)}</span>
      <ArrowUpRight size={14} className="text-muted" />
    </Link>
  );
}

export default function IncidentsPage() {
  const { id } = useParams();
  return id ? <IncidentDetailView id={id} /> : <IncidentListView />;
}

function IncidentListView() {
  const load = useCallback(async () => {
    const [incidentsResponse, endpointsResponse] = await Promise.all([
      api.get<ApiEnvelope<Incident[]>>('/incidents'),
      api.get<ApiEnvelope<EndpointWithIntelligence[]>>('/endpoints'),
    ]);
    return {
      incidents: unwrap(incidentsResponse),
      endpoints: unwrap(endpointsResponse),
    };
  }, []);
  const { data, loading, error, refresh } = usePolling<IncidentListData>(load);
  const [filter, setFilter] = useState<IncidentFilter>('active');

  const filtered = useMemo(() => (data?.incidents ?? []).filter((incident) => (
    filter === 'all' || (filter === 'active' ? incident.status !== 'resolved' : incident.status === 'resolved')
  )), [data, filter]);
  const endpointNames = useMemo(() => new Map(
    (data?.endpoints ?? []).map((endpoint) => [endpoint.id, endpoint.name])
  ), [data]);

  if (!data && loading) return <LoadingBlock />;
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Reliability" title="Incident center" description="Incident history and evidence from scheduled monitoring checks." />
        <ErrorBanner>{error ?? 'Unable to load incidents.'}</ErrorBanner>
        <Button className="mt-4" onClick={refresh}>Retry</Button>
      </>
    );
  }

  const activeCount = data.incidents.filter((incident) => incident.status !== 'resolved').length;
  return (
    <>
      <PageHeader
        eyebrow="Reliability"
        title="Incident center"
        description="Review incident state, evidence, and recovery timelines."
        actions={<StatusBadge status={activeCount ? 'down' : 'up'} label={`${activeCount} active`} />}
      />
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}. Showing cached incident records.</ErrorBanner></div>}
      <div className="incident-filter-row">
        <div className="segmented-control" role="group" aria-label="Incident filter">
          {(['active', 'resolved', 'all'] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'segment-active' : ''}>
              {value === 'active' ? `Active · ${activeCount}` : value === 'resolved' ? 'Resolved' : 'All incidents'}
            </button>
          ))}
        </div>
        <span className="text-muted small-copy">{filtered.length} incident{filtered.length === 1 ? '' : 's'}</span>
      </div>
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === 'active' ? 'No active incidents' : 'No incidents in this view'}
            description={filter === 'active' ? 'There are no active incident records. Monitoring gaps remain visible on endpoint pages.' : 'Incident records will appear here after scheduled checks meet the incident threshold.'}
            icon={<ShieldCheck size={21} />}
          />
        </Card>
      ) : (
        <div className="incident-cards">
          {filtered.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} endpointName={endpointNames.get(incident.endpoint_id ?? '')} />
          ))}
        </div>
      )}
    </>
  );
}

function IncidentDetailView({ id }: { id: string }) {
  const load = useCallback(async () => {
    const detailResponse = await api.get<ApiEnvelope<IncidentDetail>>(`/incidents/${id}`);
    const detail = unwrap(detailResponse);
    const [notificationsResponse, endpointResponse] = await Promise.all([
      api.get<ApiEnvelope<Notification[]>>('/notifications'),
      detail.incident.endpoint_id
        ? api.get<ApiEnvelope<EndpointDetail>>(`/endpoints/${detail.incident.endpoint_id}`)
        : Promise.resolve(null),
    ]);
    return {
      detail,
      endpoint: endpointResponse ? unwrap(endpointResponse) : null,
      notifications: unwrap(notificationsResponse).filter((notification) => notification.incident_id === id),
    };
  }, [id]);
  const { data, loading, error, refresh } = usePolling<IncidentDetailData>(load);

  if (!data && loading) return <LoadingBlock />;
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Reliability" title="Incident details" />
        <ErrorBanner>{error ?? 'This incident could not be loaded.'}</ErrorBanner>
        <Button className="mt-4" onClick={refresh}>Retry</Button>
      </>
    );
  }

  const { incident } = data.detail;
  const endpoint = data.endpoint;
  return (
    <>
      <div className="back-link-row"><Link to="/dashboard/incidents" className="back-link"><ArrowLeft size={14} /> Incident center</Link></div>
      <PageHeader
        eyebrow="Incident timeline"
        title={incident.title}
        description={incident.description ?? 'No additional incident description.'}
        actions={<StatusBadge status={incident.status === 'resolved' ? 'up' : 'down'} label={incident.status} />}
      />
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}.</ErrorBanner></div>}
      <div className="incident-detail-grid">
        <div className="detail-main-stack">
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Timeline</h2><p>Events are ordered by persisted event timestamps.</p></div></div>
            {data.detail.events.length === 0 ? <EmptyState title="No timeline events" description="No incident events were returned by the API." /> : (
              <div className="timeline">
                {data.detail.events.map((event) => (
                  <div className="timeline-item" key={event.id}>
                    <i className={`timeline-mark ${event.event_type === 'failure' ? 'failure' : ''}`} />
                    <strong>{event.event_type.replace(/_/g, ' ')}</strong>
                    <p>{event.message}</p>
                    <time>{formatDate(event.created_at)}</time>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Notification history</h2><p>Simulated notification records; no external delivery is implied.</p></div></div>
            {data.notifications.length === 0 ? (
              <div className="compact-empty"><Clock3 size={16} /><span>No notification records are associated with this incident.</span></div>
            ) : (
              <div className="notification-list">
                {data.notifications.map((notification) => (
                  <div className="notification-card" key={notification.id}>
                    <span className="notification-mark"><Activity size={15} /></span>
                    <span className="notification-copy">
                      <strong>{notification.event_type.replace(/_/g, ' ')} · {notification.channel}</strong>
                      <p>{notification.recipient} · {notification.delivery_status}</p>
                    </span>
                    <span className="notification-meta">{formatRelative(notification.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <aside className="detail-side-stack">
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Incident summary</h2><p>State changes are driven by scheduled checks.</p></div></div>
            <div className="info-pair"><span>Severity</span><strong className="capitalize">{incident.severity}</strong></div>
            <div className="info-pair"><span>Status</span><strong className="capitalize">{incident.status}</strong></div>
            <div className="info-pair"><span>Failure count</span><strong>{incident.failure_count}</strong></div>
            <div className="info-pair"><span>Opened</span><strong>{formatDate(incident.created_at)}</strong></div>
            <div className="info-pair"><span>Resolved</span><strong>{incident.resolved_at ? formatDate(incident.resolved_at) : 'Not resolved'}</strong></div>
            {incident.endpoint_id && <div className="info-pair"><span>Endpoint</span><Link className="section-action" to={`/dashboard/endpoints/${incident.endpoint_id}`}>View endpoint <ArrowUpRight size={12} /></Link></div>}
          </Card>
          {endpoint ? (
            <>
              <Card className="surface-pad">
                <div className="section-heading"><div><h2>Observed evidence</h2><p>Latest endpoint evidence may differ from incident-opening evidence.</p></div></div>
                <StatusBadge status={endpoint.trustPulse.serviceState} freshness={endpoint.trustPulse.freshness} />
                <div className="info-pair"><span>Latest HTTP status</span><strong>{endpoint.latestCheck?.httpStatus ?? 'Not available'}</strong></div>
                <div className="info-pair"><span>Failure classification</span><strong>{endpoint.latestCheck?.failureClassification ?? 'None recorded'}</strong></div>
                <div className="info-pair"><span>Failure detail</span><strong>{endpoint.latestCheck?.failureDetail ?? 'None recorded'}</strong></div>
                <div className="info-pair"><span>Latest verification</span><strong>{endpoint.latestVerification?.outcome.replace(/_/g, ' ') ?? 'Not run'}</strong></div>
              </Card>
              <Card className="surface-pad">
                <div className="section-heading"><div><h2>IncidentLens</h2><p>Possible causes, not a confirmed root cause.</p></div></div>
                <span className="severity-pill severity-medium">{endpoint.incidentLens.failureCategory.replace(/_/g, ' ')}</span>
                {endpoint.incidentLens.possibleCauses.map((cause) => <p className="diagnostic-line" key={cause}>{cause}</p>)}
                <div className="diagnostic-section"><h3>Recommended troubleshooting</h3><ul>{endpoint.incidentLens.recommendedTroubleshootingSteps.map((step) => <li key={step}>{step}</li>)}</ul></div>
                {endpoint.incidentLens.evidenceLimitations.map((limitation) => <p className="diagnostic-limit" key={limitation}>{limitation}</p>)}
              </Card>
              {endpoint.latestVerification && (
                <Card className="surface-pad">
                  <div className="section-heading"><div><h2>Failure verification</h2><p>{formatDate(endpoint.latestVerification.createdAt)}</p></div></div>
                  <StatusBadge status={endpoint.latestVerification.outcome === 'verified_endpoint_failure' ? 'down' : endpoint.latestVerification.outcome === 'possible_monitoring_network_failure' ? 'degraded' : 'unknown'} label={endpoint.latestVerification.outcome.replace(/_/g, ' ')} />
                  <p className="microcopy">{endpoint.latestVerification.reason}</p>
                  <p className="microcopy">Global outage confirmed: no.</p>
                </Card>
              )}
            </>
          ) : (
            <Card className="surface-pad"><InfoUnavailable /></Card>
          )}
        </aside>
      </div>
    </>
  );
}

function InfoUnavailable() {
  return <p className="microcopy">Endpoint evidence is unavailable for this incident.</p>;
}
