import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
  refresh: () => void;
}

export function usePolling<T>(
  load: () => Promise<T>,
  pollMs = 15_000
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (inFlightRef.current) {
        timer = setTimeout(poll, 250);
        return;
      }
      inFlightRef.current = true;
      try {
        const next = await load();
        if (active) {
          setData(next);
          setError(null);
          setUpdatedAt(new Date().toISOString());
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load data');
      } finally {
        inFlightRef.current = false;
        if (active) {
          setLoading(false);
          timer = setTimeout(poll, pollMs);
        }
      }
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load, pollMs, refreshVersion]);

  const refresh = useCallback(() => {
    setLoading(data === null);
    setRefreshVersion((value) => value + 1);
  }, [data]);

  return { data, loading, error, updatedAt, refresh };
}
