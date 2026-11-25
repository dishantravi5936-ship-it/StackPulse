import { useState, useEffect } from 'react';
import api from '../services/api';
import type { StatusSummary } from '../types';

export function useServices(pollMs = 15_000) {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const { data } = await api.get<StatusSummary>('/status');
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Failed to fetch status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, pollMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  return { summary, loading, error };
}
