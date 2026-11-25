import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Check,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import api, { getErrorMessage, unwrap } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { usePolling } from '../hooks/usePolling';
import type { ApiEnvelope, Endpoint, EndpointWithIntelligence } from '../types';
import { formatLatency, formatPercent, formatRelative } from '../lib/format';
import { EndpointForm, type EndpointPayload } from '../components/EndpointForm';
import { Button, Card, EmptyState, ErrorBanner, IconButton, LoadingBlock, Modal, PageHeader, StatusBadge } from '../components/ui';

type Filter = 'all' | 'operational' | 'failure' | 'unknown' | 'paused';

function matchesFilter(endpoint: EndpointWithIntelligence, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paused') return endpoint.enabled === 0;
  if (filter === 'operational') return endpoint.enabled === 1 &&
    endpoint.trustPulse.freshness === 'fresh' && endpoint.trustPulse.serviceState === 'up';
  if (filter === 'failure') return endpoint.enabled === 1 &&
    endpoint.trustPulse.freshness === 'fresh' && endpoint.trustPulse.serviceState === 'down';
  return endpoint.enabled === 1 && (
    endpoint.trustPulse.freshness !== 'fresh' ||
    endpoint.trustPulse.serviceState === 'unknown'
  );
}

export default function EndpointsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const load = useCallback(async () => unwrap(await api.get<ApiEnvelope<EndpointWithIntelligence[]>>('/endpoints')), []);
  const { data: endpoints, loading, error, refresh } = usePolling(load);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => (endpoints ?? []).filter((endpoint) => {
    const text = `${endpoint.name} ${endpoint.group_name} ${endpoint.url}`.toLowerCase();
    return text.includes(query.toLowerCase()) && matchesFilter(endpoint, filter);
  }), [endpoints, filter, query]);

  const openNew = () => {
    setEditing(undefined);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (endpoint: EndpointWithIntelligence) => {
    setEditing(endpoint);
    setFormError(null);
    setFormOpen(true);
  };

  const save = async (payload: EndpointPayload) => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/endpoints/${editing.id}`, payload);
      } else {
        await api.post('/endpoints', payload);
      }
      setFormOpen(false);
      refresh();
    } catch (requestError) {
      setFormError(getErrorMessage(requestError, 'Could not save this endpoint.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (endpoint: EndpointWithIntelligence) => {
    setBusyId(endpoint.id);
    setActionError(null);
    try {
      await api.post(`/endpoints/${endpoint.id}/${endpoint.enabled === 1 ? 'pause' : 'resume'}`);
      refresh();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, 'Could not update endpoint monitoring.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    setActionError(null);
    try {
      await api.delete(`/endpoints/${deleting.id}`);
      setDeleting(null);
      refresh();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, 'Could not delete the endpoint.'));
    } finally {
      setBusyId(null);
    }
  };

  const copyPublicLink = async (endpoint: EndpointWithIntelligence) => {
    if (!endpoint.public_slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/status/${endpoint.public_slug}`);
      setCopiedId(endpoint.id);
      window.setTimeout(() => setCopiedId((id) => id === endpoint.id ? null : id), 1800);
    } catch {
      setActionError('Clipboard access is unavailable in this browser.');
    }
  };

  if (!endpoints && loading) return <LoadingBlock />;
  if (!endpoints) {
    return (
      <>
        <PageHeader eyebrow="Monitoring" title="Endpoints" description="Manage the services you monitor." />
        <ErrorBanner>{error ?? 'Could not load endpoints.'}</ErrorBanner>
        <Button className="mt-4" onClick={refresh}>Retry</Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Endpoints"
        description="Monitor authorized services and review the confidence of every result."
        actions={isAdmin ? <Button onClick={openNew}><Plus size={15} /> Add endpoint</Button> : undefined}
      />
      {error && <div className="mb-4"><ErrorBanner>Refresh failed: {error}. Showing the last loaded data.</ErrorBanner></div>}
      {actionError && <div className="mb-4"><ErrorBanner>{actionError}</ErrorBanner></div>}
      <Card className="surface-pad">
        <div className="toolbar mb-4">
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search endpoints…" aria-label="Search endpoints" />
          </label>
          <select className="input filter-select" aria-label="Filter endpoints" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="all">All states</option>
            <option value="operational">Operational</option>
            <option value="failure">Failure observed</option>
            <option value="unknown">Unknown / stale</option>
            <option value="paused">Paused</option>
          </select>
          <span className="toolbar-note">{filtered.length} of {endpoints.length} endpoints</span>
        </div>

        {endpoints.length === 0 ? (
          <EmptyState
            title="No endpoints yet"
            description={isAdmin ? 'Add an authorized URL to begin collecting real monitoring data.' : 'An administrator has not shared any endpoints with this account yet.'}
            icon={<Activity size={21} />}
            action={isAdmin ? <Button size="sm" onClick={openNew}><Plus size={14} /> Add endpoint</Button> : undefined}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matching endpoints" description="Try another search or clear the current state filter." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Endpoint</th><th>Service state</th><th>Observed uptime</th><th>Coverage</th><th>Latency</th><th>Last check</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {filtered.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td>
                      <Link className="endpoint-name-cell" to={`/dashboard/endpoints/${endpoint.id}`}>
                        <span className="endpoint-symbol"><Activity size={14} /></span>
                        <span className="endpoint-name-copy"><strong>{endpoint.name}</strong><small>{endpoint.group_name} · every {endpoint.interval_seconds}s</small></span>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge
                        status={endpoint.trustPulse.serviceState}
                        freshness={endpoint.enabled === 0 ? 'paused' : endpoint.trustPulse.freshness}
                      />
                      {endpoint.enabled === 1 && endpoint.trustPulse.freshness === 'fresh' && endpoint.trustPulse.missingChecks > 0 && (
                        <small className="table-substatus">Coverage degraded</small>
                      )}
                    </td>
                    <td>{formatPercent(endpoint.trustPulse.observedUptimePercent)}</td>
                    <td>{formatPercent(endpoint.trustPulse.monitoringCoveragePercent)}</td>
                    <td className="mono">{formatLatency(endpoint.latestCheck?.latencyMs)}</td>
                    <td title={endpoint.trustPulse.lastCompletedCheckAt ?? undefined}>
                      {formatRelative(endpoint.trustPulse.lastCompletedCheckAt)}
                    </td>
                    <td>
                      <div className="row-actions">
                        {endpoint.public_slug && (
                          <IconButton label="Copy public status link" onClick={() => void copyPublicLink(endpoint)}>
                            {copiedId === endpoint.id ? <Check size={14} /> : <ExternalLink size={14} />}
                          </IconButton>
                        )}
                        {isAdmin && (
                          <>
                            <IconButton label="Edit endpoint" onClick={() => openEdit(endpoint)}><Settings2 size={14} /></IconButton>
                            <IconButton label={endpoint.enabled === 1 ? 'Pause monitoring' : 'Resume monitoring'} disabled={busyId === endpoint.id} onClick={() => void togglePause(endpoint)}>
                              {endpoint.enabled === 1 ? <Pause size={14} /> : <Play size={14} />}
                            </IconButton>
                            <IconButton label="Delete endpoint" className="danger-icon" disabled={busyId === endpoint.id} onClick={() => setDeleting(endpoint)}><Trash2 size={14} /></IconButton>
                          </>
                        )}
                        <Link className="table-action detail-action" to={`/dashboard/endpoints/${endpoint.id}`} aria-label={`View ${endpoint.name} details`}><MoreHorizontal size={16} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EndpointForm
        open={formOpen}
        onOpenChange={setFormOpen}
        endpoint={editing}
        saving={saving}
        error={formError}
        onSubmit={save}
      />
      <Modal
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open && !busyId) setDeleting(null); }}
        title="Delete endpoint?"
        description="Monitoring will stop and its public status page will be removed. Historical checks and incidents are retained."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={Boolean(busyId)}>Cancel</Button>
            <Button variant="danger" onClick={() => void remove()} disabled={Boolean(busyId)}><Trash2 size={14} /> {busyId ? 'Deleting…' : 'Delete endpoint'}</Button>
          </>
        }
      >
        {deleting && <p className="confirm-copy"><strong>{deleting.name}</strong> will no longer be monitored.</p>}
      </Modal>
    </>
  );
}
