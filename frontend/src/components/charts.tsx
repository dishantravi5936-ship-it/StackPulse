import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HealthCheck, PublicHistoryCheck } from '../types';
import { formatDate, formatLatency } from '../lib/format';

export function LatencyChart({ checks }: { checks: HealthCheck[] }) {
  const data = useMemo(() => checks
    .filter((check) => check.latencyMs !== null)
    .slice()
    .sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt))
    .map((check) => ({
      time: Date.parse(check.checkedAt),
      latency: check.latencyMs,
      ok: check.success,
    })), [checks]);

  if (data.length === 0) {
    return <div className="chart-empty">Latency appears after the first completed check.</div>;
  }

  return (
    <div className="chart-wrap" role="img" aria-label="Response latency from persisted endpoint checks">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(value: number) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            minTickGap={30}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            unit=" ms"
            width={52}
          />
          <Tooltip
            labelFormatter={(value) => formatDate(new Date(Number(value)).toISOString())}
            formatter={(value) => [formatLatency(Number(value)), 'Latency']}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--foreground)',
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--chart-line)', stroke: 'var(--surface)', strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PublicHistoryStrip({
  checks,
  now = Date.now(),
}: {
  checks: PublicHistoryCheck[];
  now?: number;
}) {
  const buckets = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, index) => {
      const start = now - (23 - index) * 60 * 60 * 1000;
      const end = start + 60 * 60 * 1000;
      const results = checks.filter((check) => {
        const time = Date.parse(check.checkedAt);
        return time >= start && time < end;
      });
      return {
        start,
        results,
        state: results.length === 0
          ? 'unknown'
          : results.some((result) => !result.success)
            ? 'failure'
            : 'observed-success',
      } as const;
    });
    return hours;
  }, [checks, now]);

  return (
    <div>
      <div className="uptime-strip" role="img" aria-label="Observed check results by hour for the last 24 hours">
        {buckets.map((bucket) => {
          const label = bucket.state === 'unknown'
            ? 'No recorded checks'
            : bucket.state === 'failure'
              ? 'At least one failed check observed'
              : 'Recorded checks succeeded';
          return (
            <span
              key={bucket.start}
              className={`uptime-segment uptime-${bucket.state}`}
              title={`${new Date(bucket.start).toLocaleString()}: ${label}${bucket.results.length ? ` (${bucket.results.length} checks)` : ''}`}
            />
          );
        })}
      </div>
      <div className="uptime-legend">
        <span><i className="legend-dot legend-success" />Successful results</span>
        <span><i className="legend-dot legend-failure" />Failure observed</span>
        <span><i className="legend-dot legend-unknown" />No recorded checks</span>
      </div>
      <p className="microcopy">Hourly observations only. Empty periods are unknown, not operational.</p>
    </div>
  );
}

export function CheckTimeline({
  checks,
  intervalSeconds,
}: {
  checks: HealthCheck[];
  intervalSeconds: number;
}) {
  const ordered = checks.slice().sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  const timeline = ordered.slice(-48);
  if (timeline.length === 0) {
    return <div className="chart-empty">No completed checks are available for this endpoint.</div>;
  }
  return (
    <div>
      <div className="check-strip" role="img" aria-label={`Last ${timeline.length} recorded scheduled check results`}>
        {timeline.map((check) => (
          <span
            key={check.id}
            className={`check-segment ${check.success ? 'check-success' : 'check-failure'}`}
            title={`${formatDate(check.checkedAt)} · ${check.success ? 'Success' : `Failure${check.httpStatus ? ` · HTTP ${check.httpStatus}` : ''}`}`}
          />
        ))}
      </div>
      <div className="check-strip-labels">
        <span>{formatDate(timeline[0].checkedAt)}</span>
        <span>{formatDate(timeline[timeline.length - 1].checkedAt)}</span>
      </div>
      <p className="microcopy">Showing the latest {timeline.length} completed results; missing scheduled slots are not filled with success.</p>
      <span className="microcopy">Configured interval: {intervalSeconds}s</span>
    </div>
  );
}
