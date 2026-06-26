import { useCallback, useEffect, useRef, useState } from 'react';
import type { BootnodeHealthReport } from '../types';

interface UseBootnodePollingOptions {
  apiUrl: string;
  intervalMs?: number;
  enabled?: boolean;
  adminSecret?: string;
}

export function useBootnodePolling({
  apiUrl,
  intervalMs = 30000,
  enabled = true,
  adminSecret = '',
}: UseBootnodePollingOptions) {
  const [report, setReport] = useState<BootnodeHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const reportRef = useRef(report);
  reportRef.current = report;

  const fetchHealth = useCallback(async (): Promise<BootnodeHealthReport | null> => {
    const res = await fetch(`${apiUrl}/v2/bootnodes/health`);
    if (res.status === 503) {
      setDisabled(true);
      setError(null);
      setLoading(false);
      return null;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: BootnodeHealthReport = await res.json();
    setReport(data);
    setError(null);
    setLoading(false);
    return data;
  }, [apiUrl]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight || disabled) return;
      inFlight = true;
      try {
        await fetchHealth();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'fetch failed');
          setLoading(false);
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    const timer = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiUrl, intervalMs, enabled, disabled, fetchHealth]);

  const refresh = useCallback(async () => {
    try {
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    }
  }, [fetchHealth]);

  const triggerCheck = useCallback(async () => {
    if (checking || disabled) return;

    const previousCheckedAt = reportRef.current?.checkedAt ?? '';
    setChecking(true);
    setError(null);

    try {
      const headers: HeadersInit = {};
      if (adminSecret) {
        headers['x-api-secret'] = adminSecret;
      }
      const res = await fetch(`${apiUrl}/v2/bootnodes/check`, {
        method: 'POST',
        headers,
      });
      if (res.status === 401) {
        throw new Error('Check requires admin secret');
      }
      if (!res.ok && res.status !== 202) {
        throw new Error(`HTTP ${res.status}`);
      }

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const data = await fetchHealth();
        if (data?.checkedAt && data.checkedAt !== previousCheckedAt) {
          return;
        }
      }
      throw new Error('Check timed out waiting for results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'check failed');
    } finally {
      setChecking(false);
    }
  }, [apiUrl, adminSecret, checking, disabled, fetchHealth]);

  return { report, loading, checking, error, disabled, refresh, triggerCheck };
}
