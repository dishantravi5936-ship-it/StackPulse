import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, AlertCircle, ArrowLeft, ArrowUpRight, Clock3, LockKeyhole, Moon, RefreshCw, ShieldCheck, Sun } from 'lucide-react';
import api, { unwrap } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { usePolling } from '../hooks/usePolling';
import type { ApiEnvelope, Incident, PublicOverview, PublicStatusResponse } from '../types';
import { formatDate, formatLatency, formatPercent, formatRelative } from '../lib/format';
import { PublicHistoryStrip } from '../components/charts';
import { Button, Card, EmptyState, ErrorBanner, LoadingBlock, StatusBadge } from '../components/ui';

function Brand() {
  return (
    <Link to="/" className="brand-lockup">
      <span className="brand-mark"><Activity size={16} strokeWidth={2.5} /></span>
      <span>stack<span className="brand-light">pulse</span></span>
    </Link>
  );
}

export default function StatusPage() {
  const { slug } = useParams();
  return (
    <div className="public-layout">
      <PublicHeader />
      <main className="public-main">{slug ? <PublicEndpointPage slug={slug} /> : <PublicOverviewPage />}</main>
      <footer className="public-footer">
        <span>StackPulse public status</span>
        <span>Monitoring freshness is shown separately from service state</span>
      </footer>
    </div>
  );
}

function PublicHeader() {
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="public-topbar">
      <Brand />
      <div className="public-topbar-actions">
        <Link className="public-nav-link" to="/">About</Link>
        <Link className="public-nav-link" to="/login">Workspace sign in</Link>
        <button className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

function PublicOverviewPage() {
  const load = useCallback(async () => {
    const [overviewResponse, incidentsResponse] = await Promise.all([
      api.get<PublicOverview>('/status'),
      api.get<Incident[]>('/status/incidents'),
    ]);
    return { overview: overviewResponse.data, incidents: incidentsResponse.data };
  }, []);
  const { data, loading, error, updatedAt, refresh } = usePolling(load);

  if (!data && loading) return <LoadingBlock label="Loading public status…" />;
  if (!data) {
    return <div className="public-error"><ErrorBanner>{error ?? 'Public status is temporarily unavailable.'}</ErrorBanner><Button className="mt-4" onClick={refresh}><RefreshCw size={14} /> Retry</Button></div>;
  }

  const { overview, incidents } = data;
  const summary = overview.overall === 'operational'
    ? { title: 'All monitored public services are operational', icon: <ShieldCheck size={21} />, unknown: false }
    : overview.overall === 'outage'
      ? { title: 'A service failure has been observed', icon: <AlertCircle size={21} />, unknown: false }
      : { title: 'Monitoring is degraded or incomplete', icon: <Clock3 size={21} />, unknown: true };

  return (
    <>
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}. Showing the latest available status.</ErrorBanner></div>}
      <section className="public-hero">
        <div className="public-hero-content">
          <span className={`public-hero-symbol ${summary.unknown ? 'is-unknown' : ''}`}>{summary.icon}</span>
          <div>
            <p className="eyebrow">StackPulse status</p>
            <h1>{summary.title}</h1>
            <p>Updated {formatRelative(updatedAt ?? overview.generatedAt)} · Source timestamp {formatDate(overview.generatedAt)}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh}><RefreshCw size={13} /> Refresh</Button>
      </section>

      <section className="public-section">
        <div className="section-heading">
          <div><h2>Services</h2><p>Only endpoints explicitly approved for public status appear here.</p></div>
          <span className="small-copy text-muted">{overview.endpoints.length} public service{overview.endpoints.length === 1 ? '' : 's'}</span>
        </div>
        {overview.endpoints.length === 0 ? (
          <Card><EmptyState title="No public services configured" description="There are no endpoints currently approved for this status page." icon={<Activity size={20} />} /></Card>
        ) : (
          <div className="public-endpoint-list">
            {overview.endpoints.map((endpoint) => {
              const content = (
                <>
                  <span className="public-endpoint-name">
                    <span className="endpoint-symbol"><Activity size={14} /></span>
                    <span><strong>{endpoint.name}</strong><small>{endpoint.group} · Last check {formatRelative(endpoint.lastChecked)}</small></span>
                  </span>
                  <span className="public-metrics">
                    <span className="public-metric"><small>Observed uptime · 24h</small><strong>{formatPercent(endpoint.uptime.uptime_24h)}</strong></span>
                    <span className="public-metric"><small>Coverage</small><strong>{formatPercent(endpoint.monitoringCoveragePercent)}</strong></span>
                    <span className="public-metric"><small>Latency</small><strong>{formatLatency(endpoint.latencyMs)}</strong></span>
                    <StatusBadge status={endpoint.status} freshness={endpoint.monitoringFreshness} />
                  </span>
                </>
              );
              return endpoint.publicSlug
                ? <Link key={endpoint.id} to={`/status/${endpoint.publicSlug}`} className="public-endpoint-card">{content}<ArrowUpRight size={14} className="text-muted public-arrow" /></Link>
                : <article key={endpoint.id} className="public-endpoint-card">{content}</article>;
            })}
          </div>
        )}
      </section>

      <section className="public-section">
        <div className="section-heading"><div><h2>Incident updates</h2><p>Public incident summaries from enabled public services.</p></div></div>
        {incidents.length === 0 ? (
          <Card className="public-empty-incident"><ShieldCheck size={17} /><span>No active public incidents.</span></Card>
        ) : (
          <Card className="surface-pad">
            {incidents.slice(0, 10).map((incident) => (
              <article className="public-incident" key={incident.id}>
                <div className="public-incident-heading"><strong>{incident.title}</strong><span className={`severity-pill severity-${incident.severity}`}>{incident.status}</span></div>
                {incident.description && <p>{incident.description}</p>}
                <small className="text-muted">{formatRelative(incident.updated_at)}</small>
              </article>
            ))}
          </Card>
        )}
      </section>
      <p className="public-note">{overview.overall === 'degraded' ? 'Unknown or stale monitoring periods are not represented as operational.' : 'Observed uptime describes completed checks only; see individual service pages for monitoring coverage.'}</p>
    </>
  );
}

function PublicEndpointPage({ slug }: { slug: string }) {
  const load = useCallback(async () => unwrap(await api.get<ApiEnvelope<PublicStatusResponse>>(`/public/status/${encodeURIComponent(slug)}`)), [slug]);
  const { data, loading, error, updatedAt, refresh } = usePolling(load);

  if (!data && loading) return <LoadingBlock label="Loading public service details…" />;
  if (!data) {
    return <><Link to="/status" className="back-link"><ArrowLeft size={14} /> All services</Link><div className="public-error"><ErrorBanner>{error ?? 'This public status page is unavailable.'}</ErrorBanner></div></>;
  }

  const { endpoint, incidents, history } = data;
  return (
    <>
      <Link to="/status" className="back-link"><ArrowLeft size={14} /> All services</Link>
      {error && <div className="my-4"><ErrorBanner>Refresh failed: {error}. Showing cached status.</ErrorBanner></div>}
      <section className="public-detail-hero">
        <div className="public-detail-title">
          <div><p className="eyebrow">Public service status</p><h1>{endpoint.name}</h1><p>Last updated {formatRelative(updatedAt ?? data.generatedAt)}</p></div>
          <StatusBadge status={endpoint.serviceState} freshness={endpoint.monitoringFreshness} />
        </div>
        {(endpoint.monitoringFreshness === 'stale' || endpoint.monitoringFreshness === 'engine_unavailable') && <div className="freshness-warning"><InfoPublicBanner lastKnown={endpoint.lastKnownServiceState} /></div>}
      </section>
      <div className="public-cards public-metric-grid">
        <Card className="public-card"><span>Observed uptime · 24h</span><strong>{formatPercent(endpoint.observedUptimePercent)}</strong></Card>
        <Card className="public-card"><span>Monitoring coverage · 24h</span><strong>{formatPercent(endpoint.monitoringCoveragePercent)}</strong></Card>
        <Card className="public-card"><span>Completed / expected checks</span><strong>{endpoint.completedChecks24h} / {endpoint.expectedChecks24h}</strong></Card>
        <Card className="public-card"><span>Last completed check</span><strong>{formatRelative(endpoint.lastCheckedAt)}</strong></Card>
        <Card className="public-card"><span>Latest HTTP status</span><strong>{endpoint.httpStatus ?? 'Unknown'}</strong></Card>
        <Card className="public-card"><span>Current latency</span><strong>{formatLatency(endpoint.latencyMs)}</strong></Card>
      </div>
      <div className="public-detail-grid">
        <div>
          <Card className="history-panel">
            <div className="section-heading"><div><h2>24-hour observed history</h2><p>Hourly view of persisted results; no check is treated as success.</p></div></div>
            <PublicHistoryStrip checks={history} />
            <p className="public-note">{endpoint.availabilityNote}</p>
          </Card>
          <Card className="surface-pad public-history-list">
            <div className="section-heading"><div><h2>Incident history</h2><p>Public summaries only.</p></div></div>
            {incidents.length === 0 ? (
              <div className="compact-empty"><ShieldCheck size={16} /><span>No incident history recorded.</span></div>
            ) : incidents.slice(0, 10).map((incident) => (
              <article className="public-incident" key={incident.id}>
                <div className="public-incident-heading"><strong>{incident.title}</strong><span className={`severity-pill severity-${incident.severity}`}>{incident.status}</span></div>
                {incident.description && <p>{incident.description}</p>}
                <small className="text-muted">{formatDate(incident.created_at)}{incident.resolved_at ? ` · Resolved ${formatDate(incident.resolved_at)}` : ''}</small>
              </article>
            ))}
          </Card>
        </div>
        <aside className="dashboard-stack">
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Monitoring confidence</h2><p>Availability and freshness are separate signals.</p></div></div>
            <div className="info-pair"><span>Monitoring state</span><StatusBadge status={endpoint.serviceState} freshness={endpoint.monitoringFreshness} /></div>
            <div className="info-pair"><span>Last successful check</span><strong>{formatRelative(endpoint.lastSuccessfulCheckAt)}</strong></div>
            <div className="info-pair"><span>Missing scheduled checks</span><strong>{endpoint.missedChecks24h}</strong></div>
            <div className="info-pair"><span>Check interval</span><strong>Every {endpoint.checkIntervalSeconds}s</strong></div>
            <p className="microcopy">{endpoint.availabilityNote}</p>
          </Card>
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>TLS certificate</h2><p>Native certificate inspection</p></div><LockKeyhole size={15} className="text-muted" /></div>
            <div className="info-pair"><span>Status</span><strong>{endpoint.tls.status.replace(/_/g, ' ')}</strong></div>
            <div className="info-pair"><span>Expires</span><strong>{endpoint.tls.expiresAt ? formatDate(endpoint.tls.expiresAt, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not available'}</strong></div>
          </Card>
        </aside>
      </div>
      <div className="public-refresh-footer"><span>Public view contains no endpoint URL or diagnostic error details.</span><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw size={13} /> Refresh now</Button></div>
    </>
  );
}

function InfoPublicBanner({ lastKnown }: { lastKnown: string }) {
  return <div className="notice notice-info"><Clock3 size={16} /><span>Monitoring is stale or unavailable. Current service state is unknown; last known state was {lastKnown}.</span></div>;
}
