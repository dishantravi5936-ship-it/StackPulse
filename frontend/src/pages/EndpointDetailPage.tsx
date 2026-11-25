import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  Copy,
  ExternalLink,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import api, { getErrorMessage, unwrap } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { usePolling } from '../hooks/usePolling';
import type {
  ApiEnvelope,
  EndpointDetail,
  HealthCheck,
  Incident,
  VerificationResult,
} from '../types';
import { formatDate, formatLatency, formatPercent, formatRelative } from '../lib/format';
import { EndpointForm, type EndpointPayload } from '../components/EndpointForm';
import { LatencyChart, PublicHistoryStrip } from '../components/charts';
import { Button, Card, EmptyState, ErrorBanner, IconButton, InfoBanner, LoadingBlock, Modal, PageHeader, StatusBadge } from '../components/ui';

interface EndpointPageData {
  detail: EndpointDetail;
  checks: HealthCheck[];
  incidents: Incident[];
}

export default function EndpointDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const load = useCallback(async () => {
    const [detailResponse, checksResponse, incidentResponse] = await Promise.all([
      api.get<ApiEnvelope<EndpointDetail>>(`/endpoints/${id}`),
      api.get<ApiEnvelope<HealthCheck[]>>(`/endpoints/${id}/checks?limit=500`),
      api.get<ApiEnvelope<Incident[]>>('/incidents'),
    ]);
    return {
      detail: unwrap(detailResponse),
      checks: unwrap(checksResponse),
      incidents: unwrap(incidentResponse).filter((incident) => incident.endpoint_id === id),
    };
  }, [id]);
  const { data, loading, error, refresh } = usePolling(load);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const save = async (payload: EndpointPayload) => {
    setSaving(true);
    setFormError(null);
    try {
      await api.patch(`/endpoints/${id}`, payload);
      setFormOpen(false);
      refresh();
    } catch (requestError) {
      setFormError(getErrorMessage(requestError, 'Could not save endpoint changes.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleMonitoring = async () => {
    if (!data) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/endpoints/${id}/${data.detail.endpoint.enabled === 1 ? 'pause' : 'resume'}`);
      refresh();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, 'Could not update monitoring state.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteEndpoint = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api.delete(`/endpoints/${id}`);
      navigate('/dashboard/endpoints', { replace: true });
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, 'Could not delete the endpoint.'));
      setBusy(false);
    }
  };

  const runVerification = async () => {
    setBusy(true);
    setActionError(null);
    setVerification(null);
    try {
      const response = await api.post<ApiEnvelope<VerificationResult>>(`/endpoints/${id}/verify`);
      setVerification(unwrap(response));
      refresh();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, 'Failure verification could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const copyPublicLink = async () => {
    if (!data?.detail.endpoint.public_slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/status/${data.detail.endpoint.public_slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError('Clipboard access is unavailable in this browser.');
    }
  };

  if (!data && loading) return <LoadingBlock />;
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Endpoint" title="Endpoint details" />
        <ErrorBanner>{error ?? 'Unable to load this endpoint.'}</ErrorBanner>
        <Button className="mt-4" onClick={refresh}><RefreshCw size={14} /> Retry</Button>
      </>
    );
  }

  const { endpoint, trustPulse, incidentLens, tls, latestVerification } = data.detail;
  const openIncidents = data.incidents.filter((incident) => incident.status !== 'resolved');
  const latestCheck = data.detail.latestCheck;
  const showVerification = Boolean(verification ?? latestVerification);
  const verificationResult = verification ?? latestVerification;

  return (
    <>
      <div className="back-link-row">
        <Link to="/dashboard/endpoints" className="back-link"><ArrowLeft size={14} /> All endpoints</Link>
      </div>
      <PageHeader
        eyebrow={endpoint.group_name}
        title={endpoint.name}
        description={endpoint.url}
        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={refresh}><RefreshCw size={13} /> Refresh</Button>
            {isAdmin && (
              <>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void toggleMonitoring()}>
                  {endpoint.enabled === 1 ? <Pause size={13} /> : <Play size={13} />}
                  {endpoint.enabled === 1 ? 'Pause' : 'Resume'}
                </Button>
                <Button size="sm" onClick={() => { setFormError(null); setFormOpen(true); }}><Settings2Icon /> Edit</Button>
              </>
            )}
          </>
        )}
      />
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}. Showing the latest available data.</ErrorBanner></div>}
      {actionError && <div className="mb-4"><ErrorBanner>{actionError}</ErrorBanner></div>}
      <div className="endpoint-detail-grid">
        <div className="detail-main-stack">
          <Card className="surface-pad">
            <div className="detail-hero">
              <div>
                <div className="inline-status">
                  <StatusBadge status={trustPulse.serviceState} freshness={endpoint.enabled === 0 ? 'paused' : trustPulse.freshness} />
                  {endpoint.public_slug && <span className="public-label"><ExternalLink size={11} /> Public status enabled</span>}
                </div>
                <p>Expected HTTP {endpoint.expected_status}{endpoint.expected_content ? ` · content contains “${endpoint.expected_content}”` : ''}</p>
              </div>
              <div className="detail-hero-actions">
                {endpoint.public_slug && <Button variant="secondary" size="sm" onClick={() => void copyPublicLink()}>{copied ? <BadgeCheck size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy status link'}</Button>}
                {isAdmin && <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</Button>}
              </div>
            </div>
            <div className="detail-stats">
              <div className="detail-stat"><span>Observed uptime · 24h</span><strong>{formatPercent(trustPulse.observedUptimePercent)}</strong></div>
              <div className="detail-stat"><span>Monitoring coverage</span><strong>{formatPercent(trustPulse.monitoringCoveragePercent)}</strong></div>
              <div className="detail-stat"><span>Response latency</span><strong>{formatLatency(latestCheck?.latencyMs)}</strong></div>
            </div>
            <div className="coverage-row">
              <div className="coverage-label"><span>Completed scheduled checks</span><strong>{trustPulse.completedChecks} / {trustPulse.expectedChecks}</strong></div>
              <div className="progress-track"><div className={`progress-fill ${trustPulse.monitoringCoveragePercent !== null && trustPulse.monitoringCoveragePercent < 90 ? 'warn' : ''}`} style={{ width: `${trustPulse.monitoringCoveragePercent ?? 0}%` }} /></div>
            </div>
            <div className="check-counts">
              <span><i className="count-success" />{trustPulse.successfulChecks} successful</span>
              <span><i className="count-failed" />{trustPulse.failedChecks} failed</span>
              <span><i className="count-missing" />{trustPulse.missingChecks} missing</span>
            </div>
            <InfoBanner>{trustPulse.availabilityNote}</InfoBanner>
          </Card>

          <Card className="surface-pad">
            <div className="section-heading">
              <div><h2>24-hour check history</h2><p>Hourly view of persisted results. Periods without checks remain unknown.</p></div>
            </div>
            <PublicHistoryStrip checks={data.checks.filter((check) => Date.now() - Date.parse(check.checkedAt) <= 24 * 60 * 60 * 1000)} />
          </Card>

          <Card className="surface-pad">
            <div className="section-heading">
              <div><h2>Response time</h2><p>Recorded latency for up to 500 latest checks.</p></div>
              <span className="section-caption">{data.checks.filter((check) => check.latencyMs !== null).length} samples</span>
            </div>
            <LatencyChart checks={data.checks} />
          </Card>

          <Card className="surface-pad">
            <div className="section-heading">
              <div><h2>Incident history</h2><p>Incidents resolve only after a successful scheduled check.</p></div>
              <Link to="/dashboard/incidents" className="section-action">View all <ArrowUpRight size={13} /></Link>
            </div>
            {data.incidents.length === 0 ? (
              <div className="compact-empty"><BadgeCheck size={17} /><span>No incident records for this endpoint.</span></div>
            ) : (
              <div className="incident-list">
                {data.incidents.slice(0, 6).map((incident) => (
                  <Link key={incident.id} to={`/dashboard/incidents/${incident.id}`} className="incident-row">
                    <span className="incident-row-main"><strong>{incident.title}</strong><p>{incident.description ?? 'No description available.'}</p></span>
                    <span className="incident-row-meta"><span className={`severity-pill severity-${incident.severity}`}>{incident.status}</span><br />{formatRelative(incident.updated_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="detail-side-stack">
          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Monitoring state</h2><p>Freshness is separate from the last known service result.</p></div></div>
            <div className="info-pair"><span>Freshness</span><StatusBadge status={trustPulse.serviceState} freshness={trustPulse.freshness} /></div>
            <div className="info-pair"><span>Last completed check</span><strong title={trustPulse.lastCompletedCheckAt ?? undefined}>{formatRelative(trustPulse.lastCompletedCheckAt)}</strong></div>
            <div className="info-pair"><span>Last successful check</span><strong>{formatRelative(trustPulse.lastSuccessfulCheckAt)}</strong></div>
            <div className="info-pair"><span>Latest HTTP status</span><strong>{latestCheck?.httpStatus ?? 'Not available'}</strong></div>
            <div className="info-pair"><span>Configured schedule</span><strong>Every {endpoint.interval_seconds}s</strong></div>
            <div className="info-pair"><span>Native engine</span><strong className="capitalize">{trustPulse.engineStatus.replace('_', ' ')}</strong></div>
            {trustPulse.freshness === 'engine_unavailable' || trustPulse.freshness === 'stale' ? (
              <div className="freshness-warning"><InfoBanner>Last known state: {trustPulse.lastKnownServiceState}. Current availability is unverified.</InfoBanner></div>
            ) : null}
          </Card>

          <Card className="surface-pad">
            <div className="section-heading"><div><h2>TLS certificate</h2><p>Native certificate inspection.</p></div><LockKeyhole size={15} className="text-muted" /></div>
            {tls.status === 'not_applicable' ? (
              <div className="compact-empty"><span>This endpoint uses HTTP; TLS inspection does not apply.</span></div>
            ) : (
              <>
                <div className="tls-summary">
                  <span className={`tls-icon ${tls.status === 'available' ? 'tls-ok' : 'tls-unknown'}`}>
                    {tls.status === 'available' ? <BadgeCheck size={16} /> : <ShieldAlert size={16} />}
                    {tls.status === 'available' ? 'Certificate data available' : 'Certificate data unavailable'}
                  </span>
                </div>
                <div className="info-pair"><span>Expires</span><strong>{tls.expiresAt ? formatDate(tls.expiresAt, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not available'}</strong></div>
                <div className="info-pair"><span>Issuer</span><strong>{tls.issuer ?? 'Not available'}</strong></div>
                <div className="info-pair"><span>Common name</span><strong>{tls.commonName ?? 'Not available'}</strong></div>
                <div className="info-pair"><span>Days remaining</span><strong>{tls.daysUntilExpiry ?? 'Not available'}</strong></div>
              </>
            )}
          </Card>

          <Card className="surface-pad">
            <div className="section-heading"><div><h2>IncidentLens</h2><p>Rule-based interpretation of observed evidence.</p></div><Zap size={15} className="text-muted" /></div>
            <span className={`severity-pill severity-${incidentLens.diagnosticConfidence === 'limited' ? 'high' : 'medium'}`}>{incidentLens.diagnosticConfidence} confidence</span>
            <p className="diagnostic-category">{incidentLens.failureCategory.replace(/_/g, ' ')}</p>
            {incidentLens.observedEvidence.failureDetail && (
              <div className="evidence-block"><span>Observed evidence</span><p>{incidentLens.observedEvidence.failureDetail}</p></div>
            )}
            {incidentLens.possibleCauses.length > 0 && (
              <div className="diagnostic-section"><h3>Possible causes</h3><ul>{incidentLens.possibleCauses.map((cause) => <li key={cause}>{cause}</li>)}</ul></div>
            )}
            {incidentLens.recommendedTroubleshootingSteps.length > 0 && (
              <div className="diagnostic-section"><h3>Suggested checks</h3><ul>{incidentLens.recommendedTroubleshootingSteps.map((step) => <li key={step}>{step}</li>)}</ul></div>
            )}
            <p className="microcopy">No exact root cause is asserted. See evidence limitations below.</p>
            {incidentLens.evidenceLimitations.map((limitation) => <p key={limitation} className="diagnostic-limit">{limitation}</p>)}
          </Card>

          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Failure verification</h2><p>Manual, bounded retry. Not counted as a scheduled check.</p></div></div>
            {showVerification && verificationResult ? (
              <div className="verification-result">
                <StatusBadge status={verificationResult.outcome === 'verified_endpoint_failure' ? 'down' : verificationResult.outcome === 'possible_monitoring_network_failure' ? 'degraded' : 'unknown'} label={verificationResult.outcome.replace(/_/g, ' ')} />
                <p>{verificationResult.reason}</p>
                <small>{verificationResult.createdAt ? formatDate(verificationResult.createdAt) : 'Latest stored result'}</small>
              </div>
            ) : (
              <p className="microcopy">A retry is available after a failed scheduled check. Global outage is never inferred from one location.</p>
            )}
            {isAdmin && (
              <Button className="mt-3" size="sm" variant="secondary" disabled={busy || !latestCheck || latestCheck.success || endpoint.enabled === 0} onClick={() => void runVerification()}>
                <Zap size={13} /> {busy ? 'Verifying…' : 'Verify latest failure'}
              </Button>
            )}
            {verificationResult?.globalOutageConfirmed === false && <p className="microcopy">Global outage confirmed: no.</p>}
          </Card>

          <Card className="surface-pad">
            <div className="section-heading"><div><h2>Configuration</h2><p>Endpoint details</p></div></div>
            <div className="info-pair"><span>Group</span><strong>{endpoint.group_name}</strong></div>
            <div className="info-pair"><span>Created</span><strong>{formatDate(endpoint.created_at)}</strong></div>
            <div className="info-pair"><span>Last updated</span><strong>{formatDate(endpoint.updated_at)}</strong></div>
            <div className="info-pair"><span>Monitoring</span><strong>{endpoint.enabled ? 'Enabled' : 'Paused'}</strong></div>
          </Card>
        </aside>
      </div>

      <EndpointForm open={formOpen} onOpenChange={setFormOpen} endpoint={endpoint} saving={saving} error={formError} onSubmit={save} />
      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete endpoint?"
        description="This stops monitoring and removes the public status page. History remains in the workspace."
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void deleteEndpoint()}><Trash2 size={14} /> {busy ? 'Deleting…' : 'Delete endpoint'}</Button>
          </>
        }
      >
        <p className="confirm-copy"><strong>{endpoint.name}</strong> will be archived.</p>
      </Modal>
    </>
  );
}

function Settings2Icon() {
  return <Activity size={13} />;
}
