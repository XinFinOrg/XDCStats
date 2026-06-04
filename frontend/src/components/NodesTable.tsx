import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { Node } from '../types';
import {
  blockClass,
  blockPropagationFilter,
  geoTooltipContent,
  nodeVersionFilter,
  peerClass,
  propagationHistoryColor,
  propagationTimeClass,
  sortNodes,
  upTimeClass,
  upTimeFilter,
} from '../utils/filters';

const PAGE_SIZE = 50;

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  html: string;
}

interface NodesTableProps {
  nodes: Node[];
  bestBlock: number;
  onPin: (id: string) => void;
}

type SortDir = 'asc' | 'desc';
// -1 = paused (no updates at all)
type RefreshMs = -1 | 0 | 5000 | 10000;

const REFRESH_OPTIONS: { label: string; value: RefreshMs }[] = [
  { label: 'Every 5s',  value: 5000 },
  { label: 'Every 10s', value: 10000 },
  { label: 'Paused',    value: -1 },
];

interface ColumnSort {
  predicates: string[];
  dir: SortDir;
}

// Propagation history sparkline for a single node
const PropagationHistory = React.memo<{ history: number[] }>(({ history }) => {
  const bars = history.slice(-40);
  const maxVal = Math.max(...bars.filter((v) => v >= 0), 1);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', height: 20, gap: 1 }}>
      {bars.map((ms, i) => {
        const h = ms < 0 ? 2 : Math.max(2, (ms / maxVal) * 18);
        return (
          <span
            key={i}
            className="prop-bar"
            title={ms < 0 ? 'no data' : blockPropagationFilter(ms)}
            style={{
              height: h,
              width: 4,
              background: propagationHistoryColor(ms),
              display: 'inline-block',
              borderRadius: 1,
            }}
          />
        );
      })}
    </div>
  );
});

interface NodeRowProps {
  node: Node;
  bestBlock: number;
  onPin: (id: string) => void;
  onShowTooltip: (e: React.MouseEvent, node: Node) => void;
  onHideTooltip: () => void;
  onMoveTooltip: (e: React.MouseEvent) => void;
}

const NodeRow = React.memo<NodeRowProps>(({ node, bestBlock, onPin, onShowTooltip, onHideTooltip, onMoveTooltip }) => {
  const lat = node.readable?.latency ?? (node.stats.active ? node.stats.latency + ' ms' : 'offline');
  const latCls = node.readable?.latencyClass ?? (node.stats.active ? 'text-success' : 'text-danger');
  const peerCls = peerClass(node.stats.peers, node.stats.active);
  const blkCls = blockClass(node.stats, bestBlock);
  const propCls = propagationTimeClass(node.stats, bestBlock);
  const uptimeCls = upTimeClass(node.stats.uptime, node.stats.active);

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2 text-center" style={{ width: 36 }}>
        <button
          onClick={() => onPin(node.id)}
          title={node.pinned ? 'Unpin node' : 'Pin node'}
          className="text-muted hover:text-info transition-colors focus:outline-none"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 16 }}
        >
          {node.pinned ? '📌' : '📍'}
        </button>
      </td>
      <td className="px-3 py-2" style={{ maxWidth: 200 }}>
        <span
          className="cursor-help font-medium truncate block"
          style={{ maxWidth: 180 }}
          title={node.info.name}
          onMouseEnter={(e) => onShowTooltip(e, node)}
          onMouseLeave={onHideTooltip}
          onMouseMove={onMoveTooltip}
        >
          {node.info.name || node.id}
        </span>
        {node.geo && (
          <span className="text-xs text-muted block truncate" style={{ maxWidth: 180 }}>
            {[node.geo.city, node.geo.country].filter(Boolean).join(', ')}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="text-xs font-mono text-dark">
          {nodeVersionFilter(node.info.node) || '–'}
        </span>
      </td>
      <td className={`px-3 py-2 text-right font-mono text-sm ${latCls}`}>{lat}</td>
      <td className={`px-3 py-2 text-right font-mono text-sm ${peerCls}`}>
        {node.stats.active ? node.stats.peers : '–'}
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm text-dark">
        {node.stats.active ? (node.stats.pending ?? 0) : '–'}
      </td>
      <td className="px-3 py-2 text-right">
        <span className={`font-mono text-sm ${blkCls}`}>
          #{node.stats.block.number}
        </span>
        <span className={`text-xs block ${propCls}`}>
          {blockPropagationFilter(node.stats.block.propagation)}
        </span>
      </td>
      <td className="px-3 py-2">
        <PropagationHistory history={node.history} />
      </td>
      <td className={`px-3 py-2 text-right font-mono text-sm ${uptimeCls}`}>
        {node.stats.active ? upTimeFilter(node.stats.uptime) : '–'}
      </td>
    </tr>
  );
});

const NodesTable: React.FC<NodesTableProps> = ({ nodes, bestBlock, onPin }) => {
  // ── Refresh interval ──────────────────────────────────────────────────────
  const [refreshMs, setRefreshMs] = useState<RefreshMs>(5000);

  // displayedNodes is what the table actually renders.
  // In real-time mode it mirrors `nodes` directly.
  // In interval mode it only updates when the timer fires.
  const [displayedNodes, setDisplayedNodes] = useState<Node[]>(nodes);
  const [displayedBestBlock, setDisplayedBestBlock] = useState(bestBlock);
  const pendingRef = useRef({ nodes, bestBlock });

  useEffect(() => {
    pendingRef.current = { nodes, bestBlock };
    if (refreshMs === 0) {
      setDisplayedNodes(nodes);
      setDisplayedBestBlock(bestBlock);
    }
    // refreshMs === -1: paused — pendingRef stays updated but display never changes
    // refreshMs > 0: interval handles it
  }, [nodes, bestBlock, refreshMs]);

  useEffect(() => {
    if (refreshMs <= 0) return;
    const id = setInterval(() => {
      setDisplayedNodes(pendingRef.current.nodes);
      setDisplayedBestBlock(pendingRef.current.bestBlock);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  // ── Stable row order ──────────────────────────────────────────────────────
  // Stable display order: array of node IDs.
  // Only changes when nodes first arrive, new nodes join, or user clicks a column header.
  const [stableOrder, setStableOrder] = useState<string[]>([]);
  const [activeColSort, setActiveColSort] = useState<ColumnSort | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  // Always-current nodes ref so sort callbacks don't close over stale data
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Initialise / append to stable order when nodes arrive
  useEffect(() => {
    if (nodes.length === 0) return;
    setStableOrder((prev) => {
      const existing = new Set(prev);
      const incoming = nodes.filter((n) => !existing.has(n.id));

      if (prev.length === 0) {
        // First load: sort alphabetically by node name
        return [...nodes]
          .sort((a, b) =>
            (a.info?.name ?? a.id).localeCompare(b.info?.name ?? b.id, undefined, { numeric: true, sensitivity: 'base' })
          )
          .map((n) => n.id);
      }

      if (incoming.length === 0) return prev; // Nothing new — keep order unchanged

      // New nodes joined mid-session: append them sorted by name
      const appended = [...incoming].sort((a, b) =>
        (a.info?.name ?? a.id).localeCompare(b.info?.name ?? b.id, undefined, { numeric: true, sensitivity: 'base' })
      );
      return [...prev, ...appended.map((n) => n.id)];
    });
  }, [nodes]);

  // Derive the display list from the stable order mapped to displayed (buffered) node data
  const sorted = useMemo(() => {
    const nodeMap = new Map(displayedNodes.map((n) => [n.id, n]));
    const ordered = stableOrder
      .map((id) => nodeMap.get(id))
      .filter((n): n is Node => n !== undefined);
    // Safety net: nodes not yet in stableOrder appear at the bottom
    const inOrder = new Set(stableOrder);
    const extras = displayedNodes.filter((n) => !inOrder.has(n.id));
    return [...ordered, ...extras];
  }, [displayedNodes, stableOrder]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => (n.info.name || n.id).toLowerCase().includes(q));
  }, [sorted, searchQuery]);

  // Reset to page 0 when the filtered set changes
  useEffect(() => { setPage(0); }, [searchQuery]);

  const totalPages = Math.ceil(filteredNodes.length / PAGE_SIZE);
  const pagedNodes = useMemo(
    () => filteredNodes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredNodes, page],
  );

  // Column header click: re-sort and lock in the new order
  const handleSort = useCallback(
    (columnPreds: string[]) => {
      let newPreds: string[];
      let newDir: SortDir;

      if (
        activeColSort &&
        JSON.stringify(activeColSort.predicates) === JSON.stringify(columnPreds)
      ) {
        newDir = activeColSort.dir === 'asc' ? 'desc' : 'asc';
        const toggled = columnPreds.map((p) => (p.startsWith('-') ? p.slice(1) : '-' + p));
        newPreds = ['-pinned', ...toggled];
      } else {
        newDir = 'asc';
        newPreds = ['-pinned', ...columnPreds];
      }

      setActiveColSort({ predicates: columnPreds, dir: newDir });
      // Re-sort current nodes and lock the result as the new stable order
      const resorted = sortNodes(nodesRef.current, newPreds);
      setStableOrder(resorted.map((n) => n.id));
    },
    [activeColSort]
  );

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    html: '',
  });
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((e: React.MouseEvent, node: Node) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 10, html: geoTooltipContent(node) });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimeout.current = setTimeout(() => {
      setTooltip((t) => ({ ...t, visible: false }));
    }, 100);
  }, []);

  const moveTooltip = useCallback(
    (e: React.MouseEvent) => {
      if (tooltip.visible) {
        setTooltip((t) => ({ ...t, x: e.clientX + 14, y: e.clientY - 10 }));
      }
    },
    [tooltip.visible]
  );

  useEffect(() => {
    return () => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    };
  }, []);

  const SortIcon: React.FC<{ preds: string[] }> = ({ preds }) => {
    if (!activeColSort || JSON.stringify(activeColSort.predicates) !== JSON.stringify(preds)) {
      return <span className="ml-1 opacity-30">↕</span>;
    }
    return <span className="ml-1 text-info">{activeColSort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div
      className="bg-white rounded mb-4"
      style={{ boxShadow: '1px 0 20px rgba(0,0,0,0.05)' }}
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <p className="header-title mb-0" style={{ whiteSpace: 'nowrap' }}>Nodes</p>
        <input
          type="text"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-sm px-3 py-1 rounded border border-gray-200 focus:outline-none focus:border-blue-400"
          style={{ minWidth: 180 }}
        />
        <div className="flex items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
          {REFRESH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRefreshMs(opt.value)}
              className="text-xs px-3 py-1 rounded-full transition-colors focus:outline-none"
              style={{
                background: refreshMs === opt.value ? '#242c6d' : '#f0f4f8',
                color: refreshMs === opt.value ? '#fff' : '#6b7280',
                border: 'none',
                cursor: 'pointer',
                fontWeight: refreshMs === opt.value ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-responsive">
        <table className="stats-table w-full" style={{ minWidth: 900 }}>
          <thead>
            <tr className="border-b border-gray-100">
              <th
                className="px-3 py-2 text-left cursor-pointer"
                onClick={() => handleSort(['-pinned'])}
              >
                <SortIcon preds={['-pinned']} />
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer"
                onClick={() => handleSort(['info.name'])}
              >
                Node Name <SortIcon preds={['info.name']} />
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer"
                onClick={() => handleSort(['info.node'])}
              >
                Type <SortIcon preds={['info.node']} />
              </th>
              <th
                className="px-3 py-2 text-right cursor-pointer"
                onClick={() => handleSort(['stats.latency'])}
              >
                Latency <SortIcon preds={['stats.latency']} />
              </th>
              <th
                className="px-3 py-2 text-right cursor-pointer"
                onClick={() => handleSort(['-stats.peers'])}
              >
                Peers <SortIcon preds={['-stats.peers']} />
              </th>
              <th
                className="px-3 py-2 text-right cursor-pointer"
                onClick={() => handleSort(['-stats.pending'])}
              >
                Pending <SortIcon preds={['-stats.pending']} />
              </th>
              <th
                className="px-3 py-2 text-right cursor-pointer"
                onClick={() => handleSort(['-stats.block.number', 'stats.block.propagation'])}
              >
                Last Block <SortIcon preds={['-stats.block.number', 'stats.block.propagation']} />
              </th>
              <th className="px-3 py-2 text-left">Propagation</th>
              <th
                className="px-3 py-2 text-right cursor-pointer"
                onClick={() => handleSort(['-stats.uptime'])}
              >
                Uptime <SortIcon preds={['-stats.uptime']} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredNodes.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-8 text-sm">
                  {sorted.length === 0 ? 'Waiting for nodes…' : 'No nodes match your search.'}
                </td>
              </tr>
            )}
            {pagedNodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                bestBlock={displayedBestBlock}
                onPin={onPin}
                onShowTooltip={showTooltip}
                onHideTooltip={hideTooltip}
                onMoveTooltip={moveTooltip}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-muted">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredNodes.length)} of {filteredNodes.length} nodes
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded focus:outline-none"
              style={{
                background: page === 0 ? '#f0f4f8' : '#242c6d',
                color: page === 0 ? '#a1a7cc' : '#fff',
                border: 'none',
                cursor: page === 0 ? 'default' : 'pointer',
              }}
            >
              ‹ Prev
            </button>
            <span className="px-2">
              Page {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded focus:outline-none"
              style={{
                background: page >= totalPages - 1 ? '#f0f4f8' : '#242c6d',
                color: page >= totalPages - 1 ? '#a1a7cc' : '#fff',
                border: 'none',
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              }}
            >
              Next ›
            </button>
          </div>
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip.visible && (
        <div
          className="node-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}
    </div>
  );
};

export default NodesTable;
