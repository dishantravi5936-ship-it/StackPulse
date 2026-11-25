import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  AlertCircle,
  Clock3,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Signal,
  Timer,
} from 'lucide-react';
import api, { unwrap } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import type { ApiEnvelope, DashboardData, EndpointWithIntelligence } from '../types';
import { formatDate, formatLatency, formatPercent, formatRelative, serviceLabel } from '../lib/format';
import { Button, Card, EmptyState, ErrorBanner, LoadingBlock, MetricCard, PageHeader, StatusBadge } from '../components/ui';

function isFreshEndpoint(endpoint: EndpointWithIntelligence): boolean {
  return endpoint.enabled === 1 && endpoint.trustPulse.freshness === 'fresh';
}

function averageLatency(endpoints: EndpointWithIntelligence[]): number | null {
  const values = endpoints
    .filter(isFreshEndpoint)
    .map((endpoint) => endpoint.latestCheck?.latencyMs)
    .filter((value): value is number => value !== null && value !== undefined);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export default function DashboardPage() {
  const load = useCallback(async () => unwrap(await api.get<ApiEnvelope<DashboardData>>('/dashboard')), []);
  const { data, loading, error, updatedAt, refresh } = usePolling(load);

  if (!data && loading) return <LoadingBlock />;
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Workspace" title="Overview" description="A live view of service health and monitoring confidence." />
        <ErrorBanner>{error ?? 'Unable to load the dashboard.'}</ErrorBanner>
        <Button className="mt-4" onClick={refresh}><RefreshCw size={14} /> Retry</Button>
      </>
    );
  }

  const endpoints = data.endpoints;
  const up = endpoints.filter((endpoint) => isFreshEndpoint(endpoint) && endpoint.trustPulse.serviceState === 'up').length;
  const failures = endpoints.filter((endpoint) => isFreshEndpoint(endpoint) && endpoint.trustPulse.serviceState === 'down').length;
  const unknown = endpoints.length - up - failures;
  const expected = endpoints.reduce((total, endpoint) => total + endpoint.trustPulse.expectedChecks, 0);
  const completed = endpoints.reduce((total, endpoint) => total + endpoint.trustPulse.completedChecks, 0);
  const successful = endpoints.reduce((total, endpoint) => total + endpoint.trustPulse.successfulChecks, 0);
  const uptime = completed ? (successful / completed) * 100 : null;
  const coverage = expected ? (completed / expected) * 100 : null;
  const activeIncidents = data.incidents.filter((incident) => incident.status !== 'resolved');
  const nativeEngine = data.monitoringEngines.find((engine) => engine.engine === 'native');
  const overall = failures > 0
    ? 'failure'
    : endpoints.length === 0
      ? 'empty'
      : unknown > 0
        ? 'unknown'
        : 'healthy';

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description="Service state and monitoring confidence, side by side."
        actions={<Button variant="secondary" size="sm" onClick={refresh}><RefreshCw size={13} /> Refresh</Button>}
      />
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}. Showing the most recently loaded data.</ErrorBanner></div>}

      <Card className="hero-status-card">
        <div className="hero-status-main">
          <span className={`hero-status-icon ${overall === 'failure' || overall === 'unknown' ? 'is-alert' : ''}`}>
              {overall === 'failure' ? <AlertCircle size={19} /> : overall === 'empty' ? <Activity size={19} /> : overall === 'unknown' ? <Clock3 size={19} /> : <ShieldCheck size={19} />}
          </span>
          <div>
            <h2>
              {overall === 'empty' ? 'No endpoints configured'
                : overall === 'failure' ? `${failures} service${failures === 1 ? '' : 's'} with a fresh failed check`
                  : overall === 'unknown' ? `${unknown} service${unknown === 1 ? '' : 's'} need monitoring attention`
                    : 'All monitored services are operational'}
            </h2>
            <p>
              {overall === 'empty' ? 'Add an authorized endpoint to begin collecting real monitoring data.'
                : overall === 'unknown' ? 'Stale or missing monitoring data is not treated as healthy.'
                  : `Last refreshed ${formatRelative(updatedAt)} · Native engine ${nativeEngine?.status ?? 'unknown'}`}
            </p>
          </div>
        </div>
        <Link className="table-action" to="/dashboard/endpoints">Manage endpoints <ArrowUpRight size={13} /></Link>
      </Card>

      <div className="grid metrics-grid">
        <MetricCard label="Monitored endpoints" value={String(endpoints.length)} detail={`${up} operational · ${unknown} unknown`} icon={<Signal />} />
        <MetricCard label="Active incidents" value={String(activeIncidents.length)} detail={activeIncidents.length ? 'Scheduled failures recorded' : 'No active incident records'} icon={<AlertCircle />} accent={activeIncidents.length > 0} />
        <MetricCard label="Observed uptime · 24h" value={formatPercent(uptime)} detail={`${completed} completed of ${expected} expected checks`} icon={<Gauge />} />
        <MetricCard label="Monitoring coverage · 24h" value={formatPercent(coverage)} detail={`${Math.max(0, expected - completed)} scheduled checks missing`} icon={<Timer />} />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-stack">
          <Card className="surface-pad">
            <div className="section-heading">
              <div><h2>Live monitoring</h2><p>Latest scheduled results, with freshness shown separately.</p></div>
              <Link to="/dashboard/endpoints" className="section-action">All endpoints <ArrowUpRight size={13} /></Link>
            </div>
            {endpoints.length === 0 ? (
              <EmptyState title="Nothing monitored yet" description="Create an endpoint to start collecting real health checks." action={<Link className="button button-primary button-sm" to="/dashboard/endpoints">Add endpoint</Link>} />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Endpoint</th><th>Service state</th><th>Freshness</th><th>Latency</th><th>Last check</th></tr></thead>
                  <tbody>
                    {endpoints.map((endpoint) => (
                      <tr key={endpoint.id}>
                        <td>
                          <Link to={`/dashboard/endpoints/${endpoint.id}`} className="endpoint-name-cell">
                            <span className="endpoint-symbol"><Activity size={14} /></span>
                            <span className="endpoint-name-copy"><strong>{endpoint.name}</strong><small>{endpoint.group_name}</small></span>
                          </Link>
                        </td>
                        <td><StatusBadge status={endpoint.trustPulse.serviceState} freshness={endpoint.enabled === 0 ? 'paused' : endpoint.trustPulse.freshness} /></td>
                        <td><span className={`freshness-text freshness-${endpoint.trustPulse.freshness}`}>{serviceLabel(endpoint.trustPulse.serviceState, endpoint.enabled === 0 ? 'paused' : endpoint.trustPulse.freshness)}</span></td>
                        <td className="mono">{formatLatency(endpoint.latestCheck?.latencyMs)}</td>
                        <td title={formatDate(endpoint.trustPulse.lastCompletedCheckAt)} className="text-muted">{formatRelative(endpoint.trustPulse.lastCompletedCheckAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="surface-pad">
            <div className="section-heading">
              <div><h2>Recent incident activity</h2><p>Incident records from scheduled health checks.</p></div>
              <Link to="/dashboard/incidents" className="section-action">Incident center <ArrowUpRight size={13} /></Link>
            </div>
            {data.incidents.length === 0 ? (
              <div className="compact-empty"><ShieldCheck size={17} /><span>No incidents recorded for this workspace.</span></div>
            ) : (
              <div className="incident-list">
                {data.incidents.slice(0, 5).map((incident) => (
                  <Link key={incident.id} to={`/dashboard/incidents/${incident.id}`} className="incident-row">
                    <span className="incident-row-main"><strong>{incident.title}</strong><p>{incident.description ?? 'No additional description.'}</p></span>
                    <span className="incident-row-meta"><span className={`severity-pill severity-${incident.severity}`}>{incident.severity}</span><br />{formatRelative(incident.updated_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="dashboard-stack">
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Monitoring confidence</h2><p>Successful observations are not the same as complete coverage.</p></div></div>
            <div className="coverage-row">
              <div className="coverage-label"><span>Observed uptime</span><strong>{formatPercent(uptime)}</strong></div>
              <div className="progress-track"><div className={`progress-fill ${uptime === null ? '' : uptime < 99 ? 'warn' : ''}`} style={{ width: `${uptime ?? 0}%` }} /></div>
            </div>
            <div className="coverage-row">
              <div className="coverage-label"><span>Monitoring coverage</span><strong>{formatPercent(coverage)}</strong></div>
              <div className="progress-track"><div className={`progress-fill ${coverage === null ? '' : coverage < 90 ? 'warn' : ''}`} style={{ width: `${coverage ?? 0}%` }} /></div>
            </div>
            <p className="microcopy">Missing scheduled checks are unknown. They are excluded from observed uptime and never shown as healthy.</p>
          </Card>

          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Engine health</h2><p>Native Node.js checks are authoritative.</p></div></div>
            {data.monitoringEngines.length === 0 ? (
              <div className="compact-empty"><Clock3 size={16} /><span>Engine heartbeat has not been recorded.</span></div>
            ) : data.monitoringEngines.map((engine) => (
              <div key={engine.engine} className="engine-row">
                <span className="engine-name"><i className={`engine-dot ${engine.status}`} />{engine.engine === 'native' ? 'Native monitor' : 'Gatus (optional)'}</span>
                <span className={`engine-state engine-${engine.status}`}>{engine.status}</span>
              </div>
            ))}
            {nativeEngine?.last_error && <p className="microcopy">{nativeEngine.last_error}</p>}
          </Card>

          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Response time</h2><p>Average latest latency for fresh endpoints.</p></div></div>
            <div className="mini-latency">
              <Activity size={17} />
              <strong>{formatLatency(averageLatency(endpoints))}</strong>
              <span>{endpoints.filter(isFreshEndpoint).length} fresh endpoint{endpoints.filter(isFreshEndpoint).length === 1 ? '' : 's'}</span>
            </div>
            <p className="microcopy">Detailed response-time history is available on each endpoint.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
