import { useEffect, useState } from 'react';
import api from '../services/api';
import type { StatusSummary, Incident } from '../types';

function statusColor(s: string) {
  if (s === 'up' || s === 'operational') return 'bg-green-500';
  if (s === 'down' || s === 'outage') return 'bg-red-500';
  if (s === 'degraded') return 'bg-yellow-400';
  return 'bg-gray-400';
}

function statusLabel(s: string) {
  if (s === 'up' || s === 'operational') return 'Operational';
  if (s === 'down' || s === 'outage') return 'Major Outage';
  if (s === 'degraded') return 'Degraded';
  return 'Unknown';
}

export default function StatusPage() {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [summaryRes, incidentRes] = await Promise.all([
        api.get<StatusSummary>('/status'),
        api.get<Incident[]>('/status/incidents'),
      ]);
      setSummary(summaryRes.data);
      setIncidents(incidentRes.data);
      setError(null);
    } catch {
      setError('Failed to load status. Retrying...');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        Loading status...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overall banner */}
      <div className={`rounded-xl p-6 text-white ${statusColor(summary?.overall ?? 'unknown')} shadow-md`}>
        <h1 className="text-2xl font-bold">{statusLabel(summary?.overall ?? 'unknown')}</h1>
        <p className="text-sm opacity-80 mt-1">
          Last updated: {summary ? new Date(summary.generatedAt).toLocaleTimeString() : '—'}
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}

      {/* Active incidents */}
      {incidents.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Active Incidents</h2>
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="border border-yellow-300 bg-yellow-50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="font-medium text-gray-800">{inc.title}</span>
                  <span className="ml-auto text-xs text-gray-500 capitalize">{inc.severity}</span>
                </div>
                {inc.description && (
                  <p className="text-sm text-gray-600 mt-1 ml-4">{inc.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Endpoints */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Services</h2>
        {summary?.endpoints.length === 0 ? (
          <p className="text-gray-400 text-sm">No endpoints configured yet.</p>
        ) : (
          <div className="space-y-2">
            {summary?.endpoints.map((ep) => (
              <div
                key={ep.id}
                className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusColor(ep.status)}`} />
                  <div>
                    <span className="font-medium text-gray-800">{ep.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{ep.group}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500">
                    {ep.latencyMs != null ? `${ep.latencyMs} ms` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

