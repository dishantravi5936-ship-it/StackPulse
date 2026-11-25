import type { Freshness, ServiceState } from '../types';

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return 'Not yet recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, options ?? {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return 'No completed checks yet';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Time unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatPercent(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

export function formatLatency(value: number | null | undefined): string {
  if (value == null) return '—';
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
}

export function serviceLabel(
  status: ServiceState | 'operational' | 'outage' | 'degraded',
  freshness?: Freshness
): string {
  if (freshness === 'engine_unavailable') return 'Monitoring offline';
  if (freshness === 'stale') return 'Stale data';
  if (freshness === 'paused') return 'Paused';
  if (freshness === 'pending') return 'Pending first check';
  if (freshness === 'unknown') return 'Unknown';
  if (status === 'up' || status === 'operational') return 'Operational';
  if (status === 'down' || status === 'outage') return 'Failure observed';
  if (status === 'degraded') return 'Degraded';
  return 'Unknown';
}

export function serviceTone(
  status: ServiceState | 'operational' | 'outage' | 'degraded',
  freshness?: Freshness
): 'green' | 'red' | 'amber' | 'gray' | 'neutral' {
  if (freshness === 'engine_unavailable' || freshness === 'stale') return 'amber';
  if (freshness === 'paused' || freshness === 'pending') return 'neutral';
  if (freshness === 'unknown') return 'gray';
  if (status === 'up' || status === 'operational') return 'green';
  if (status === 'down' || status === 'outage') return 'red';
  if (status === 'degraded') return 'amber';
  return 'gray';
}
