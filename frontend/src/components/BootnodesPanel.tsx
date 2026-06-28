import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BootnodeHealthReport, BootnodeStatus } from '../types';

type StatusFilter = 'all' | 'healthy' | 'unhealthy';
type SortDir = 'asc' | 'desc';

type BootnodeSortKey =
  | 'index'
  | 'address'
  | 'udpStatus'
  | 'udpRtt'
  | 'tcpStatus'
  | 'tcpRtt'
  | 'enode'
  | 'errors';

interface ColumnSort {
  key: BootnodeSortKey;
  dir: SortDir;
}

interface ColDef {
  key: BootnodeSortKey;
  label: string;
  align: 'left' | 'right';
  sortable: boolean;
  tooltip: string;
}

const BOOTNODE_COLUMNS: ColDef[] = [
  { key: 'index', label: '#', align: 'left', sortable: true, tooltip: 'Position in the bootnode list.' },
  {
    key: 'address',
    label: 'Address',
    align: 'left',
    sortable: true,
    tooltip: 'IP address and port used for UDP discv4 and TCP RLPx probes.',
  },
  {
    key: 'udpStatus',
    label: 'UDP Status',
    align: 'left',
    sortable: true,
    tooltip: 'UDP discv4 ping result (3 probes, healthy when at least 2 succeed).',
  },
  {
    key: 'udpRtt',
    label: 'UDP RTT',
    align: 'right',
    sortable: true,
    tooltip: 'Round-trip time for the discv4 ping response, in milliseconds.',
  },
  {
    key: 'tcpStatus',
    label: 'TCP Status',
    align: 'left',
    sortable: true,
    tooltip: 'TCP RLPx handshake result (3 probes, healthy when at least 2 succeed).',
  },
  {
    key: 'tcpRtt',
    label: 'TCP RTT',
    align: 'right',
    sortable: true,
    tooltip: 'Round-trip time for the TCP RLPx handshake, in milliseconds.',
  },
  {
    key: 'enode',
    label: 'Enode',
    align: 'left',
    sortable: true,
    tooltip: 'Full enode URL (search matches node ID or IP address). Hover to see full text.',
  },
  {
    key: 'errors',
    label: 'Errors',
    align: 'left',
    sortable: true,
    tooltip: 'UDP/TCP error messages when a probe failed or timed out. Click to view full text.',
  },
];

const PAGE_SIZE_OPTIONS = [10, 15, 25] as const;

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  html: string;
}

interface BootnodesPanelProps {
  report: BootnodeHealthReport | null;
  loading: boolean;
  checking: boolean;
  error: string | null;
  disabled: boolean;
  onCheckNow: () => void;
}

const STORAGE_KEY = 'xdcstats_bootnodes_collapsed';

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All bootnodes' },
  { value: 'healthy', label: 'Healthy only (UDP + TCP)' },
  { value: 'unhealthy', label: 'Any issue (UDP or TCP)' },
];

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: '6px 28px 6px 10px',
  borderRadius: 6,
  border: '2px solid #c5d4e8',
  background: '#fff',
  color: '#1e2a6e',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7c93' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
};

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function isFullyHealthy(node: BootnodeStatus): boolean {
  return node.healthy && node.tcpHealthy;
}

function hasAnyIssue(node: BootnodeStatus): boolean {
  return !node.healthy || !node.tcpHealthy;
}

function statusRank(healthy: boolean, errorKind?: string): number {
  if (healthy) return 0;
  if (errorKind === 'warning') return 1;
  if (errorKind === 'local') return 2;
  return 3;
}

function formatProbeError(
  label: string,
  error?: string,
  kind?: string,
  probes?: number,
  fails?: number,
) {
  if (!error) return '';
  const meta =
    probes != null && fails != null ? ` (${fails}/${probes} failed)` : '';
  const prefix = kind === 'local' ? `${label} probe` : label;
  return `${prefix}: ${error}${meta}`;
}

function formatErrors(node: BootnodeStatus) {
  const parts: string[] = [];
  const udp = formatProbeError('UDP', node.error, node.errorKind, node.probes, node.probeFails);
  const tcp = formatProbeError(
    'TCP',
    node.tcpError,
    node.tcpErrorKind,
    node.tcpProbes,
    node.tcpProbeFails,
  );
  if (udp) parts.push(udp);
  if (tcp) parts.push(tcp);
  if (!parts.length) return '–';
  return parts.join('\n');
}

function formatErrorsInline(node: BootnodeStatus) {
  const text = formatErrors(node);
  return text === '–' ? text : text.replace(/\n/g, ' · ');
}

function truncateEnode(enode: string, max = 48) {
  if (enode.length <= max) return enode;
  return `${enode.slice(0, max)}…`;
}

function displayAddress(node: BootnodeStatus): string {
  if (!node.tcpEndpoint || node.endpoint === node.tcpEndpoint) {
    return node.endpoint;
  }
  return node.tcpEndpoint;
}

function addressTitle(node: BootnodeStatus): string | undefined {
  if (!node.tcpEndpoint || node.endpoint === node.tcpEndpoint) {
    return undefined;
  }
  return `UDP ${node.endpoint} · TCP ${node.tcpEndpoint}`;
}

function matchesBootnodeSearch(node: BootnodeStatus, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    node.enode.toLowerCase().includes(q) ||
    node.nodeId.toLowerCase().includes(q) ||
    node.endpoint.toLowerCase().includes(q) ||
    (node.tcpEndpoint || '').toLowerCase().includes(q)
  );
}

function compareBootnodes(
  a: BootnodeStatus,
  b: BootnodeStatus,
  key: BootnodeSortKey,
  dir: SortDir,
): number {
  let cmp = 0;
  switch (key) {
    case 'index':
      cmp = a.index - b.index;
      break;
    case 'address':
      cmp = displayAddress(a).localeCompare(displayAddress(b));
      break;
    case 'udpStatus':
      cmp = statusRank(a.healthy, a.errorKind) - statusRank(b.healthy, b.errorKind);
      break;
    case 'udpRtt':
      cmp = (a.rttMs ?? -1) - (b.rttMs ?? -1);
      break;
    case 'tcpStatus':
      cmp =
        statusRank(a.tcpHealthy, a.tcpErrorKind) -
        statusRank(b.tcpHealthy, b.tcpErrorKind);
      break;
    case 'tcpRtt':
      cmp = (a.tcpRttMs ?? -1) - (b.tcpRttMs ?? -1);
      break;
    case 'enode':
      cmp = a.enode.localeCompare(b.enode);
      break;
    case 'errors':
      cmp = formatErrorsInline(a).localeCompare(formatErrorsInline(b));
      break;
  }
  return dir === 'asc' ? cmp : -cmp;
}

function statusBadge(healthy: boolean, okLabel: string, errorKind?: string) {
  if (healthy) {
    return (
      <span
        className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
        style={{ background: '#e8f8ec', color: '#29b348' }}
      >
        {okLabel}
      </span>
    );
  }
  if (errorKind === 'warning') {
    return (
      <span
        className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
        style={{ background: '#fff8e6', color: '#f5b225' }}
      >
        Warning
      </span>
    );
  }
  if (errorKind === 'local') {
    return (
      <span
        className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
        style={{ background: '#eef2ff', color: '#4a5fc1' }}
      >
        Probe error
      </span>
    );
  }
  return (
    <span
      className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
      style={{ background: '#fdecea', color: '#e74c3c' }}
    >
      Unreachable
    </span>
  );
}

function ErrorDetailModal({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const copy = () => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg m-4 w-full max-w-2xl max-h-[75vh] flex flex-col"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bootnode-error-detail-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span id="bootnode-error-detail-title" className="font-semibold text-sm" style={{ color: '#2d3b48' }}>
            Probe errors
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="text-xs px-3 py-1 rounded-full focus:outline-none"
              style={{ background: '#f0f4f8', color: '#6b7280', border: 'none', cursor: 'pointer' }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1 rounded-full focus:outline-none"
              style={{ background: '#242c6d', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
        <pre
          className="px-4 py-3 text-xs font-mono overflow-auto flex-1"
          style={{ color: '#2d3b48', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        >
          {text}
        </pre>
      </div>
    </div>
  );
}

interface BootnodeRowProps {
  node: BootnodeStatus;
  onShowErrors: (text: string) => void;
}

const BootnodeRow: React.FC<BootnodeRowProps> = ({ node, onShowErrors }) => {
  const errorsFull = formatErrors(node);
  const errorsInline = formatErrorsInline(node);
  const hasErrors = errorsFull !== '–';

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2">{node.index}</td>
      <td
        className="px-3 py-2 font-mono"
        style={{ color: '#1e2a6e' }}
        title={addressTitle(node)}
      >
        {displayAddress(node)}
      </td>
      <td className="px-3 py-2">{statusBadge(node.healthy, 'UDP OK', node.errorKind)}</td>
      <td className="px-3 py-2 text-right font-mono text-sm">
        {node.healthy && node.rttMs != null ? `${node.rttMs} ms` : '–'}
      </td>
      <td className="px-3 py-2">{statusBadge(node.tcpHealthy, 'TCP OK', node.tcpErrorKind)}</td>
      <td className="px-3 py-2 text-right font-mono text-sm">
        {node.tcpHealthy && node.tcpRttMs != null ? `${node.tcpRttMs} ms` : '–'}
      </td>
      <td className="px-3 py-2">
        <span
          className="font-mono text-sm text-muted truncate block"
          style={{ maxWidth: 280 }}
          title={node.enode}
        >
          {truncateEnode(node.enode, 56)}
        </span>
      </td>
      <td className="px-3 py-2">
        {hasErrors ? (
          <button
            type="button"
            className="text-sm text-left text-muted hover:text-danger focus:outline-none truncate block"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              maxWidth: 220,
              color: '#e74c3c',
            }}
            title="Click to view full errors"
            onClick={() => onShowErrors(errorsFull)}
          >
            {errorsInline}
          </button>
        ) : (
          <span className="text-muted">–</span>
        )}
      </td>
    </tr>
  );
};

const BootnodesPanel: React.FC<BootnodesPanelProps> = ({
  report,
  loading,
  checking,
  error,
  disabled,
  onCheckNow,
}) => {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [activeSort, setActiveSort] = useState<ColumnSort>({ key: 'index', dir: 'asc' });
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    html: '',
  });
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHeaderTooltip = useCallback((e: React.MouseEvent, text: string) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip({
      visible: true,
      x: e.clientX + 14,
      y: e.clientY - 10,
      html: `<div style="max-width:220px;white-space:normal">${text}</div>`,
    });
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
    [tooltip.visible],
  );

  useEffect(() => {
    return () => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      saveCollapsed(next);
      return next;
    });
  };

  const handleSort = useCallback((key: BootnodeSortKey) => {
    setActiveSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  }, []);

  const allNodes = report?.bootnodes ?? [];

  const filteredNodes = useMemo(() => {
    let nodes = allNodes;
    switch (filter) {
      case 'healthy':
        nodes = nodes.filter(isFullyHealthy);
        break;
      case 'unhealthy':
        nodes = nodes.filter(hasAnyIssue);
        break;
    }
    const q = searchQuery.trim();
    if (q) {
      nodes = nodes.filter((node) => matchesBootnodeSearch(node, q));
    }
    return [...nodes].sort((a, b) =>
      compareBootnodes(a, b, activeSort.key, activeSort.dir),
    );
  }, [allNodes, filter, searchQuery, activeSort]);

  const totalPages = Math.max(1, Math.ceil(filteredNodes.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [report?.checkedAt, filter, pageSize, searchQuery, activeSort]);

  useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const pagedNodes = useMemo(
    () => filteredNodes.slice(page * pageSize, (page + 1) * pageSize),
    [filteredNodes, page, pageSize],
  );

  if (disabled) {
    return null;
  }

  const healthy = report?.healthy ?? 0;
  const tcpHealthy = report?.tcpHealthy ?? 0;
  const total = report?.total ?? 0;
  const allUdpHealthy = total > 0 && healthy === total;
  const allTcpHealthy = total > 0 && tcpHealthy === total;
  const busy = checking || (loading && !report);

  const SortIcon: React.FC<{ colKey: BootnodeSortKey }> = ({ colKey }) => {
    if (activeSort.key !== colKey) {
      return <span className="ml-1 opacity-30">↕</span>;
    }
    return <span className="ml-1 text-info">{activeSort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <section className="mb-4">
      <div
        className="bg-white rounded mb-4"
        style={{ boxShadow: '1px 0 20px rgba(0,0,0,0.05)' }}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <p className="header-title mb-0" style={{ whiteSpace: 'nowrap' }}>
              Bootnode Health
            </p>
            {collapsed && !loading && report && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{
                  background:
                    allUdpHealthy && allTcpHealthy
                      ? '#e8f8ec'
                      : healthy > 0 || tcpHealthy > 0
                        ? '#fff8e6'
                        : '#fdecea',
                  color:
                    allUdpHealthy && allTcpHealthy
                      ? '#29b348'
                      : healthy > 0 || tcpHealthy > 0
                        ? '#f5b225'
                        : '#e74c3c',
                }}
              >
                UDP {healthy}/{total} · TCP {tcpHealthy}/{total}
              </span>
            )}
          </div>

          {!collapsed && (
            <input
              type="text"
              placeholder="Search enode, node ID, or IP…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm font-semibold px-3 py-1.5 rounded-md border-2 border-blue-400 bg-white text-blue-900 placeholder-blue-300 focus:outline-none focus:border-blue-600"
              style={{ minWidth: 300 }}
              aria-label="Search bootnodes"
            />
          )}

          <div className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
            {!collapsed && (
              <>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as StatusFilter)}
                    style={selectStyle}
                    aria-label="Filter bootnodes"
                  >
                    {FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-muted">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={selectStyle}
                    aria-label="Bootnodes per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <button
              type="button"
              onClick={onCheckNow}
              disabled={busy}
              className="text-xs px-3 py-1 rounded-full transition-colors focus:outline-none"
              style={{
                background: busy ? '#f0f4f8' : '#242c6d',
                color: busy ? '#a1a7cc' : '#fff',
                border: 'none',
                cursor: busy ? 'default' : 'pointer',
                fontWeight: 600,
              }}
            >
              {checking ? 'Checking…' : 'Check now'}
            </button>

            <button
              type="button"
              onClick={toggleCollapsed}
              className="text-xs px-3 py-1 rounded-full focus:outline-none"
              style={{
                background: '#f0f4f8',
                color: '#6b7280',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand bootnode health' : 'Collapse bootnode health'}
            >
              {collapsed ? 'Show ▾' : 'Hide ▴'}
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            <div
              className="flex flex-wrap items-center gap-4 px-4 py-2 border-b border-gray-100 text-xs text-muted"
            >
              {loading && !report ? (
                <span>Waiting for first bootnode check…</span>
              ) : (
                <>
                  <span>
                    <span className="text-muted">UDP </span>
                    <span
                      className="font-bold"
                      style={{ color: allUdpHealthy ? '#29b348' : healthy > 0 ? '#f5b225' : '#e74c3c' }}
                    >
                      {healthy}
                    </span>
                    <span className="text-muted">/{total}</span>
                  </span>
                  <span>
                    <span className="text-muted">TCP </span>
                    <span
                      className="font-bold"
                      style={{
                        color: allTcpHealthy ? '#29b348' : tcpHealthy > 0 ? '#f5b225' : '#e74c3c',
                      }}
                    >
                      {tcpHealthy}
                    </span>
                    <span className="text-muted">/{total}</span>
                  </span>
                  {filter !== 'all' && <span>Showing {filteredNodes.length} filtered</span>}
                  {searchQuery.trim() && (
                    <span>
                      Search: {filteredNodes.length} match{filteredNodes.length === 1 ? '' : 'es'}
                    </span>
                  )}
                  {report?.checkedAt && (
                    <span title={report.checkedAt}>
                      Last check: {new Date(report.checkedAt).toLocaleString()}
                    </span>
                  )}
                  {report?.duration && <span>({report.duration})</span>}
                </>
              )}
              {error && <span style={{ color: '#e74c3c' }}>{error}</span>}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 text-xs text-muted">
                <span>
                  {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredNodes.length)} of{' '}
                  {filteredNodes.length} bootnodes
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
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
                    type="button"
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
              <table className="stats-table w-full" style={{ minWidth: 860 }}>
                <thead>
                  <tr className="border-b border-gray-100">
                    {BOOTNODE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`px-3 py-2 text-${col.align}${col.sortable ? ' cursor-pointer' : ''}`}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                        onMouseEnter={(e) => showHeaderTooltip(e, col.tooltip)}
                        onMouseLeave={hideTooltip}
                        onMouseMove={moveTooltip}
                      >
                        {col.label}
                        {col.sortable && <SortIcon colKey={col.key} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedNodes.length ? (
                    pagedNodes.map((node) => (
                      <BootnodeRow
                        key={`${node.index}-${node.endpoint}`}
                        node={node}
                        onShowErrors={setErrorDetail}
                      />
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={BOOTNODE_COLUMNS.length}
                        className="text-center text-muted py-8 text-sm"
                      >
                        {busy
                          ? 'Running bootnode check…'
                          : searchQuery.trim()
                            ? 'No bootnodes match your search.'
                            : filter === 'all'
                              ? 'No bootnode results yet'
                              : 'No bootnodes match this filter'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {tooltip.visible && (
              <div
                className="node-tooltip"
                style={{ left: tooltip.x, top: tooltip.y }}
                dangerouslySetInnerHTML={{ __html: tooltip.html }}
              />
            )}

            {errorDetail && (
              <ErrorDetailModal
                text={errorDetail}
                onClose={() => setErrorDetail(null)}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default BootnodesPanel;
