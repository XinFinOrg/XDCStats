import React, { useState, useCallback, useRef } from 'react';
import { usePolling } from './hooks/usePolling';
import type { Node, ChartsData, PropagationBin } from './types';
import {
  computeLatencyReadable,
  nodesActiveClass,
  blockTimeFilter,
  transactionRateFilter,
  gasPriceFilter,
  gasFilter,
  upTimeFilter,
  upTimeClass,
  timeClass,
} from './utils/filters';

import StatCard from './components/StatCard';
import SmallStatCard from './components/SmallStatCard';
import VersionCard from './components/VersionCard';
import HistoryModal, { type HistoryMetric } from './components/HistoryModal';
import SparklineChart from './components/SparklineChart';
import BlockPropagationChart from './components/BlockPropagationChart';
import WorldMap from './components/WorldMap';
import NodesTable from './components/NodesTable';

const MAX_BINS = 40;
const API_URL = import.meta.env.VITE_API_URL ?? '';

function fillArray(len: number, val = 0): number[] {
  return Array(len).fill(val);
}

const CollapsibleMap: React.FC<{ nodes: Node[]; bestBlock: number }> = ({ nodes, bestBlock }) => {
  const [expanded, setExpanded] = React.useState(false);
  const geoCount = nodes.filter((n) => n.geo !== null && n.geo.ll[0] !== 0).length;

  return (
    <div
      className="bg-white rounded-xl mb-4"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)' }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 focus:outline-none"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex items-center gap-3">
          <p className="header-title" style={{ marginBottom: 0 }}>Node Locations</p>
          {geoCount > 0 && (
            <span className="text-xs text-muted font-normal">{geoCount} nodes</span>
          )}
        </div>
        <span
          className="text-muted text-sm"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'inline-block' }}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid #f0f4f8', padding: '0 12px 12px' }}>
          <WorldMap nodes={nodes} bestBlock={bestBlock} />
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  // ─── State ───────────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<Node[]>([]);
  const [bestBlock, setBestBlock] = useState(0);
  const [lastBlock, setLastBlock] = useState(0);
  const [bestStats, setBestStats] = useState<Node['stats'] | null>(null);

  const [nodesTotal, setNodesTotal] = useState(0);
  const [nodesActive, setNodesActive] = useState(0);
  const [upTimeTotal, setUpTimeTotal] = useState(0);

  const [avgTransactionRate, setAvgTransactionRate] = useState(0);
  const [blockPropagationAvg, setBlockPropagationAvg] = useState(0);
  const [blockPropagationChart, setBlockPropagationChart] = useState<PropagationBin[]>([]);

  const [lastBlocksTime, setLastBlocksTime] = useState<number[]>(fillArray(MAX_BINS, 2));
  const [transactionDensity, setTransactionDensity] = useState<number[]>(fillArray(MAX_BINS, 0));
  const [gasUsedHistory, setGasUsedHistory] = useState<number[]>(fillArray(MAX_BINS, 0));

  const [historyModal, setHistoryModal] = useState<HistoryMetric | null>(null);

  // Pinned node IDs (persisted)
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('xdcstats_pinned');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  // Keep a ref to nodes so callbacks can access latest without stale closure
  const nodesRef = useRef<Node[]>([]);
  const pinnedIdsRef = useRef<string[]>(pinnedIds);

  // ─── Derived stats helpers ────────────────────────────────────────────────

  const updateBestBlock = useCallback((currentNodes: Node[]) => {
    if (currentNodes.length === 0) return;

    let maxNum = 0;
    let maxNode: Node | null = null;
    for (const n of currentNodes) {
      if (n.stats.block.number > maxNum) {
        maxNum = n.stats.block.number;
        maxNode = n;
      }
    }

    setBestBlock((prev) => {
      if (maxNum !== prev && maxNode) {
        setBestStats(maxNode.stats);
        setLastBlock(maxNode.stats.block.arrived);
      }
      return maxNum;
    });
  }, []);

  const updateActiveNodes = useCallback((currentNodes: Node[]) => {
    const total = currentNodes.length;
    const active = currentNodes.filter((n) => n.stats.active).length;
    const upSum = currentNodes.reduce((acc, n) => acc + (n.stats.uptime ?? 0), 0);
    const avgUp = total > 0 ? upSum / total : 0;

    setNodesTotal(total);
    setNodesActive(active);
    setUpTimeTotal(avgUp);
    updateBestBlock(currentNodes);
  }, [updateBestBlock]);

  // ─── Polling handler ─────────────────────────────────────────────────────

  const handleSnapshot = useCallback(
    (rawNodes: Node[], charts: ChartsData) => {
      const currentPinned = pinnedIdsRef.current;
      const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]));

      const initialized: Node[] = (rawNodes as Node[]).map((node) => {
        const n: Node = {
          ...node,
          history: node.history ?? Array(40).fill(-1),
          pinned: currentPinned.includes(node.id),
        };
        n.readable = computeLatencyReadable(n);

        // Reuse the previous reference if nothing display-relevant changed,
        // so React.memo on NodeRow can skip re-rendering unchanged rows.
        const prev = prevMap.get(node.id);
        if (
          prev &&
          prev.stats.block.number === n.stats.block.number &&
          prev.stats.block.propagation === n.stats.block.propagation &&
          prev.stats.latency === n.stats.latency &&
          prev.stats.peers === n.stats.peers &&
          prev.stats.pending === n.stats.pending &&
          prev.stats.uptime === n.stats.uptime &&
          prev.stats.active === n.stats.active &&
          prev.pinned === n.pinned
        ) {
          return prev;
        }
        return n;
      });

      nodesRef.current = initialized;
      setNodes(initialized);
      updateActiveNodes(initialized);

      if (charts) {
        if (charts.avgTransactionRate !== undefined) setAvgTransactionRate(charts.avgTransactionRate);
        if (charts.gasSpending?.length > 0) setGasUsedHistory(charts.gasSpending);
        if (charts.blocktime?.length > 0) setLastBlocksTime(charts.blocktime);
        if (charts.transactions?.length > 0) setTransactionDensity(charts.transactions);
        if (charts.propagation?.histogram) {
          setBlockPropagationChart(charts.propagation.histogram);
          setBlockPropagationAvg(charts.propagation.avg ?? 0);
        }
      }
    },
    [updateActiveNodes]
  );

  usePolling({
    apiUrl: API_URL,
    onSnapshot: handleSnapshot,
    intervalMs: 5000,
  });

  // ─── Pin handler ─────────────────────────────────────────────────────────

  const handlePin = useCallback((id: string) => {
    setNodes((prev) => {
      const idx = prev.findIndex((n) => n.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], pinned: !next[idx].pinned };

      const newPinned = next
        .filter((n) => n.pinned)
        .map((n) => n.id);
      setPinnedIds(newPinned);
      pinnedIdsRef.current = newPinned;
      try {
        localStorage.setItem('xdcstats_pinned', JSON.stringify(newPinned));
      } catch { /* ignore */ }

      nodesRef.current = next;
      return next;
    });
  }, []);

  // ─── Derived display values ───────────────────────────────────────────────
  const activeNodesClass = nodesActiveClass(nodesActive, nodesTotal);
  const lastBlockClass = lastBlock > 0 ? timeClass(lastBlock) : 'text-muted';
  const uptimeClass = upTimeClass(upTimeTotal, nodesActive > 0);

  // Gas price: use best active node with the highest block
  const gasPrice =
    bestStats?.gasPrice ??
    nodes.find((n) => n.stats.active)?.stats.gasPrice ??
    '0';

  const maxGasLimit = bestStats?.block.gasLimit ?? 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#eff3f6' }}>
      {/* Header */}
      <header
        className="bg-white sticky top-0 z-50"
        style={{ borderBottom: '1px solid #e4eaf0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="font-bold text-lg tracking-tight select-none" style={{ color: '#1e2a6e' }}>
              <span style={{ color: '#44a2d2' }}>XDC</span>Stats
            </span>
            <span
              className="hidden sm:block text-xs font-semibold uppercase tracking-widest text-muted"
              style={{ borderLeft: '1px solid #dde3eb', paddingLeft: 12 }}
            >
              Network Monitor
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span
                className={nodesActive > 0 ? 'live-dot' : ''}
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: nodesActive > 0 ? '#29b348' : '#a1a7cc',
                  flexShrink: 0,
                }}
              />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: nodesActive > 0 ? '#29b348' : '#a1a7cc' }}>
                {nodesActive > 0 ? 'Live' : 'Connecting'}
              </span>
            </div>
            <span className="text-xs">
              <span className="font-bold" style={{ color: '#2d3b48' }}>{nodesActive}</span>
              <span className="text-muted">/{nodesTotal} nodes</span>
            </span>
          </div>
        </div>
      </header>

      <main className="px-6 py-6">

        {/* Row 1: Best Block, Tx Rate, Last Block, Node Versions */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title="Best Block"
            value={`#${bestBlock.toLocaleString()}`}
            valueClass="text-primary"
          />
          <StatCard
            title="Avg Transaction Rate"
            value={avgTransactionRate > 0 ? transactionRateFilter(avgTransactionRate) : '–'}
            valueClass="text-info"
          />
          <StatCard
            title="Last Block"
            value={lastBlock > 0 ? blockTimeFilter(lastBlock) : '–'}
            valueClass={lastBlockClass}
          />
          <VersionCard nodes={nodes} />
        </div>

        {/* Row 2: Active Nodes, Gas Price, Max Block Size, Uptime */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SmallStatCard
            title="Active Nodes"
            value={
              <span className={activeNodesClass}>
                {nodesActive}/{nodesTotal}
              </span>
            }
          />
          <SmallStatCard
            title="Gas Price"
            value={gasPrice && gasPrice !== '0' ? gasPriceFilter(gasPrice) : '–'}
            valueClass="text-dark"
          />
          <SmallStatCard
            title="Max Block Size"
            value={gasFilter(maxGasLimit)}
            unit="gas"
            valueClass="text-dark"
          />
          <SmallStatCard
            title="Avg Uptime"
            value={
              <span className={uptimeClass}>
                {upTimeFilter(upTimeTotal)}
              </span>
            }
          />
        </div>

        {/* Row 3: Charts */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SparklineChart
            data={lastBlocksTime}
            title="Block Time"
            color="#44a2d2"
            height={100}
            formatValue={(v) => v.toFixed(2)}
            unit=" s"
            showAxes
            onClick={() => setHistoryModal('blocktime')}
          />
          <SparklineChart
            data={transactionDensity}
            title="Transactions Per Block"
            color="#29b348"
            height={100}
            formatValue={(v) => Math.round(v).toString()}
            unit=" tx"
            showAxes
            yAxisTitle="Transactions"
            xAxisTitle="Blocks (last 40)"
            onClick={() => setHistoryModal('transactions')}
          />
          <SparklineChart
            data={gasUsedHistory}
            title="Gas Used"
            color="#f5b225"
            height={100}
            formatValue={(v) => Math.round(v).toLocaleString()}
            unit=""
            showAxes
            yAxisTitle="Gas"
            xAxisTitle="Blocks (last 40)"
            onClick={() => setHistoryModal('gasUsed')}
          />
          <BlockPropagationChart
            histogram={blockPropagationChart}
            avg={blockPropagationAvg}
          />
        </div>

        {/* World Map — collapsible */}
        <CollapsibleMap nodes={nodes} bestBlock={bestBlock} />

        {/* Nodes Table */}
        <NodesTable
          nodes={nodes}
          bestBlock={bestBlock}
          onPin={handlePin}
        />
      </main>

      <footer
        className="text-center text-muted text-xs py-6"
        style={{ borderTop: '1px solid #e4eaf0', marginTop: 8 }}
      >
        <span style={{ color: '#44a2d2', fontWeight: 600 }}>XDC</span>Stats &mdash; XinFin Network Monitor
      </footer>

      {historyModal && (() => {
        const cfg = {
          blocktime:    { title: 'Block Time',            color: '#44a2d2', unit: ' s',  formatValue: (v: number) => v.toFixed(2),                  yAxisTitle: 'Seconds' },
          transactions: { title: 'Transactions Per Block', color: '#29b348', unit: ' tx', formatValue: (v: number) => Math.round(v).toString(),        yAxisTitle: 'Transactions' },
          gasUsed:      { title: 'Gas Used',               color: '#f5b225', unit: '',    formatValue: (v: number) => Math.round(v).toLocaleString(),  yAxisTitle: 'Gas' },
        }[historyModal];
        return (
          <HistoryModal
            metric={historyModal}
            title={cfg.title}
            color={cfg.color}
            unit={cfg.unit}
            formatValue={cfg.formatValue}
            yAxisTitle={cfg.yAxisTitle}
            apiUrl={API_URL}
            onClose={() => setHistoryModal(null)}
          />
        );
      })()}
    </div>
  );
};

export default App;
