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
const COL_STORAGE_KEY = 'xdcstats_visible_cols';

interface ColDef {
  key: string;
  label: string;
  defaultOn: boolean;
  sortPreds?: string[];
  tooltip: string;
  align: 'left' | 'right';
}

const COLUMNS: ColDef[] = [
  {
    key: 'name', label: 'Node Name', defaultOn: true, align: 'left',
    sortPreds: ['info.name'],
    tooltip: 'The name reported by the node when it connected.',
  },
  {
    key: 'type', label: 'Type', defaultOn: true, align: 'left',
    sortPreds: ['info.node'],
    tooltip: 'Client software and version string reported by the node (e.g. XDCChain/v2.0/linux/go1.21).',
  },
  {
    key: 'latency', label: 'Latency', defaultOn: true, align: 'right',
    sortPreds: ['stats.latency'],
    tooltip: 'Round-trip time between this server and the node, measured via WebSocket ping every 30 seconds.',
  },
  {
    key: 'peers', label: 'Peers', defaultOn: true, align: 'right',
    sortPreds: ['-stats.peers'],
    tooltip: 'Number of other nodes this node is currently connected to in the P2P network.',
  },
  {
    key: 'pending', label: 'Pending', defaultOn: true, align: 'right',
    sortPreds: ['-stats.pending'],
    tooltip: "Number of transactions currently waiting in this node's mempool to be included in a block.",
  },
  {
    key: 'lastBlock', label: 'Last Block', defaultOn: true, align: 'right',
    sortPreds: ['-stats.block.number', 'stats.block.propagation'],
    tooltip: 'The latest block number this node has seen, and how long after it was mined that this node received it.',
  },
  {
    key: 'propagation', label: 'Propagation', defaultOn: true, align: 'left',
    tooltip: 'Sparkline showing block propagation times for the last 40 blocks. Taller bars mean slower propagation. Grey bars indicate the block was not received.',
  },
  {
    key: 'uptime', label: 'Uptime', defaultOn: true, align: 'right',
    sortPreds: ['-stats.uptime'],
    tooltip: 'Percentage of time this node has been connected and actively reporting data to the stats server.',
  },
];

function loadVisibleCols(): Set<string> {
  try {
    const stored = localStorage.getItem(COL_STORAGE_KEY);
    if (stored) {
      const parsed: string[] = JSON.parse(stored);
      // Keep only keys that still exist in COLUMNS
      const valid = new Set(COLUMNS.map((c) => c.key));
      return new Set(parsed.filter((k) => valid.has(k)));
    }
  } catch {}
  return new Set(COLUMNS.filter((c) => c.defaultOn).map((c) => c.key));
}

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
  visibleCols: Set<string>;
  onPin: (id: string) => void;
  onShowTooltip: (e: React.MouseEvent, node: Node) => void;
  onHideTooltip: () => void;
  onMoveTooltip: (e: React.MouseEvent) => void;
}

const NodeRow = React.memo<NodeRowProps>(({ node, bestBlock, visibleCols, onPin, onShowTooltip, onHideTooltip, onMoveTooltip }) => {
  const lat = node.readable?.latency ?? (node.stats.active ? node.stats.latency + ' ms' : 'offline');
  const latCls = node.readable?.latencyClass ?? (node.stats.active ? 'text-success' : 'text-danger');
  const peerCls = peerClass(node.stats.peers, node.stats.active);
  const blkCls = blockClass(node.stats, bestBlock);
  const propCls = propagationTimeClass(node.stats, bestBlock);
  const uptimeCls = upTimeClass(node.stats.uptime, node.stats.active);
  const show = (key: string) => visibleCols.has(key);

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      {/* Pin — always visible */}
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

      {show('name') && (
        <td className="px-3 py-2" style={{ minWidth: 320 }}>
          <span
            className="cursor-help font-medium truncate block"
            style={{ maxWidth: 280 }}
            title={node.info.name}
            onMouseEnter={(e) => onShowTooltip(e, node)}
            onMouseLeave={onHideTooltip}
            onMouseMove={onMoveTooltip}
          >
            {node.info.name || node.id}
          </span>
          {node.info.coinbase && (
            <span
              className="text-xs font-mono text-muted block"
              title={node.info.coinbase}
            >
              {node.info.coinbase}
            </span>
          )}
          {node.geo && (
            <span className="text-xs text-muted block truncate" style={{ maxWidth: 180 }}>
              {[node.geo.city, node.geo.country].filter(Boolean).join(', ')}
            </span>
          )}
        </td>
      )}

      {show('type') && (
        <td className="px-3 py-2">
          <span className="text-xs font-mono text-dark">
            {nodeVersionFilter(node.info.node) || '–'}
          </span>
        </td>
      )}

      {show('latency') && (
        <td className={`px-3 py-2 text-right font-mono text-sm ${latCls}`}>{lat}</td>
      )}

      {show('peers') && (
        <td className={`px-3 py-2 text-right font-mono text-sm ${peerCls}`}>
          {node.stats.active ? node.stats.peers : '–'}
        </td>
      )}

      {show('pending') && (
        <td className="px-3 py-2 text-right font-mono text-sm text-dark">
          {node.stats.active ? (node.stats.pending ?? 0) : '–'}
        </td>
      )}

      {show('lastBlock') && (
        <td className="px-3 py-2 text-right">
          <span className={`font-mono text-sm ${blkCls}`}>
            #{node.stats.block.number}
          </span>
          <span className={`text-xs block ${propCls}`}>
            {blockPropagationFilter(node.stats.block.propagation)}
          </span>
        </td>
      )}

      {show('propagation') && (
        <td className="px-3 py-2">
          <PropagationHistory history={node.history} />
        </td>
      )}

      {show('uptime') && (
        <td className={`px-3 py-2 text-right font-mono text-sm ${uptimeCls}`}>
          {node.stats.active ? upTimeFilter(node.stats.uptime) : '–'}
        </td>
      )}
    </tr>
  );
});

const NodesTable: React.FC<NodesTableProps> = ({ nodes, bestBlock, onPin }) => {
  // ── Column visibility ─────────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<string>>(loadVisibleCols);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const toggleCol = useCallback((key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // keep at least one column
        next.delete(key);
      } else {
        next.add(key);
      }
      localStorage.setItem(COL_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (!colPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as HTMLElement)) {
        setColPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colPickerOpen]);

  // ── Refresh interval ──────────────────────────────────────────────────────
  const [refreshMs, setRefreshMs] = useState<RefreshMs>(5000);

  const [displayedNodes, setDisplayedNodes] = useState<Node[]>(nodes);
  const [displayedBestBlock, setDisplayedBestBlock] = useState(bestBlock);
  const pendingRef = useRef({ nodes, bestBlock });

  useEffect(() => {
    pendingRef.current = { nodes, bestBlock };
    if (refreshMs === 0) {
      setDisplayedNodes(nodes);
      setDisplayedBestBlock(bestBlock);
      return;
    }
    // Show the first snapshot immediately; later updates follow the refresh interval.
    setDisplayedNodes((prev) => (prev.length === 0 && nodes.length > 0 ? nodes : prev));
    setDisplayedBestBlock((prev) => (prev === 0 && bestBlock > 0 ? bestBlock : prev));
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
  const [stableOrder, setStableOrder] = useState<string[]>([]);
  const [activeColSort, setActiveColSort] = useState<ColumnSort | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => {
    if (nodes.length === 0) return;
    setStableOrder((prev) => {
      const existing = new Set(prev);
      const incoming = nodes.filter((n) => !existing.has(n.id));

      if (prev.length === 0) {
        return [...nodes]
          .sort((a, b) =>
            (a.info?.name ?? a.id).localeCompare(b.info?.name ?? b.id, undefined, { numeric: true, sensitivity: 'base' })
          )
          .map((n) => n.id);
      }

      if (incoming.length === 0) return prev;

      const appended = [...incoming].sort((a, b) =>
        (a.info?.name ?? a.id).localeCompare(b.info?.name ?? b.id, undefined, { numeric: true, sensitivity: 'base' })
      );
      return [...prev, ...appended.map((n) => n.id)];
    });
  }, [nodes]);

  const sorted = useMemo(() => {
    const nodeMap = new Map(displayedNodes.map((n) => [n.id, n]));
    const ordered = stableOrder
      .map((id) => nodeMap.get(id))
      .filter((n): n is Node => n !== undefined);
    const inOrder = new Set(stableOrder);
    const extras = displayedNodes.filter((n) => !inOrder.has(n.id));
    return [...ordered, ...extras];
  }, [displayedNodes, stableOrder]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) =>
      (n.info.name || n.id).toLowerCase().includes(q) ||
      (n.info.node || '').toLowerCase().includes(q) ||
      (n.info.coinbase || '').toLowerCase().includes(q)
    );
  }, [sorted, searchQuery]);

  useEffect(() => { setPage(0); }, [searchQuery]);

  const totalPages = Math.ceil(filteredNodes.length / PAGE_SIZE);
  const pagedNodes = useMemo(
    () => filteredNodes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredNodes, page],
  );

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
      const resorted = sortNodes(nodesRef.current, newPreds);
      setStableOrder(resorted.map((n) => n.id));
    },
    [activeColSort]
  );

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, html: '',
  });
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((e: React.MouseEvent, node: Node) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 10, html: geoTooltipContent(node) });
  }, []);

  const showHeaderTooltip = useCallback((e: React.MouseEvent, text: string) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 10, html: `<div style="max-width:220px;white-space:normal">${text}</div>` });
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

  // 1 (pin) + visible data columns
  const colSpan = 1 + visibleCols.size;

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
          className="text-sm font-semibold px-3 py-1.5 rounded-md border-2 border-blue-400 bg-white text-blue-900 placeholder-blue-300 focus:outline-none focus:border-blue-600"
          style={{ minWidth: 300 }}
        />
        <div className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
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

          {/* Column picker */}
          <div ref={colPickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setColPickerOpen((v) => !v)}
              className="text-xs px-3 py-1 rounded-full transition-colors focus:outline-none"
              style={{
                background: colPickerOpen ? '#242c6d' : '#f0f4f8',
                color: colPickerOpen ? '#fff' : '#6b7280',
                border: 'none',
                cursor: 'pointer',
                fontWeight: colPickerOpen ? 600 : 400,
              }}
            >
              Columns ▾
            </button>
            {colPickerOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  padding: '8px 0',
                  zIndex: 100,
                  minWidth: 160,
                }}
              >
                {COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 14px',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: '#374151',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                      style={{ accentColor: '#242c6d', cursor: 'pointer' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 text-xs text-muted">
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

      <div className="table-responsive">
        <table className="stats-table w-full" style={{ minWidth: 600 }}>
          <thead>
            <tr className="border-b border-gray-100">
              {/* Pin — always visible */}
              <th
                className="px-3 py-2 text-left cursor-pointer"
                onClick={() => handleSort(['-pinned'])}
                onMouseEnter={(e) => showHeaderTooltip(e, 'Pin a node to keep it at the top of the list.')}
                onMouseLeave={hideTooltip}
                onMouseMove={moveTooltip}
              >
                <SortIcon preds={['-pinned']} />
              </th>

              {COLUMNS.map((col) => {
                if (!visibleCols.has(col.key)) return null;
                const hasPreds = !!col.sortPreds;
                return (
                  <th
                    key={col.key}
                    className={`px-3 py-2 text-${col.align}${hasPreds ? ' cursor-pointer' : ''}`}
                    onClick={hasPreds ? () => handleSort(col.sortPreds!) : undefined}
                    onMouseEnter={(e) => showHeaderTooltip(e, col.tooltip)}
                    onMouseLeave={hideTooltip}
                    onMouseMove={moveTooltip}
                  >
                    {col.label}{hasPreds && <SortIcon preds={col.sortPreds!} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredNodes.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="text-center text-muted py-8 text-sm">
                  {sorted.length === 0 ? 'Waiting for nodes…' : 'No nodes match your search.'}
                </td>
              </tr>
            )}
            {pagedNodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                bestBlock={displayedBestBlock}
                visibleCols={visibleCols}
                onPin={onPin}
                onShowTooltip={showTooltip}
                onHideTooltip={hideTooltip}
                onMoveTooltip={moveTooltip}
              />
            ))}
          </tbody>
        </table>
      </div>

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
