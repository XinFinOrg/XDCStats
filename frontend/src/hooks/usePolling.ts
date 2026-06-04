import { useEffect, useRef } from 'react';
import type { Node, ChartsData } from '../types';

interface SnapshotResponse {
  nodes: Node[];
  charts: ChartsData;
}

interface UsePollingOptions {
  apiUrl: string;
  onSnapshot: (nodes: Node[], charts: ChartsData) => void;
  intervalMs?: number;
}

export function usePolling({ apiUrl, onSnapshot, intervalMs = 5000 }: UsePollingOptions) {
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const fetchSnapshot = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`${apiUrl}/v2/snapshot`);
        if (!res.ok) {
          console.error('[XDCStats] Snapshot fetch failed:', res.status);
          return;
        }
        const data: SnapshotResponse = await res.json();
        if (!cancelled && Array.isArray(data.nodes)) {
          onSnapshotRef.current(data.nodes, data.charts);
        }
      } catch (err) {
        console.error('[XDCStats] Polling error:', err);
      } finally {
        inFlight = false;
      }
    };

    fetchSnapshot();
    const timer = setInterval(fetchSnapshot, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiUrl, intervalMs]);
}
