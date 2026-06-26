import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BootnodeHealthReport, BootnodeStatus } from '../types';

type StatusFilter = 'all' | 'healthy' | 'unhealthy';

function isFullyHealthy(node: BootnodeStatus): boolean {
  return node.healthy && node.tcpHealthy;
}

function hasAnyIssue(node: BootnodeStatus): boolean {
  return !node.healthy || !node.tcpHealthy;
}

const PAGE_SIZE_OPTIONS = [10, 15, 25] as const;

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  html: string;
}

const BOOTNODE_COLUMNS: {
  label: string;
  align: 'left' | 'right';
  description: string;
}[] = [
  {
    label: '#',
    align: 'left',
    description: 'Position in the bootnode list.',
  },
  {
    label: 'Address',
    align: 'left',
    description: 'IP address and port used for UDP discv4 and TCP RLPx probes.',
  },
  {
    label: 'UDP Status',
    align: 'left',
    description:
      'UDP discv4 ping result (3 probes, healthy when at least 2 succeed).',
  },
  {
    label: 'UDP RTT',
    align: 'right',
    description: 'Round-trip time for the discv4 ping response, in milliseconds.',
  },
  {
    label: 'TCP Status',
    align: 'left',
    description:
      'TCP RLPx handshake result (3 probes, healthy when at least 2 succeed). Warnings surface protocol mismatches.',
  },
  {
    label: 'TCP RTT',
    align: 'right',
    description: 'Round-trip time for the TCP RLPx handshake, in milliseconds.',
  },
  {
    label: 'Enode',
    align: 'left',
    description: 'Full enode URL (search matches node ID or IP address).',
  },
  {
    label: 'Errors',
    align: 'left',
    description: 'UDP/TCP error messages when a probe failed or timed out.',
  },
];

interface BootnodesPanelProps {
  report: BootnodeHealthReport | null;
  loading: boolean;
  checking: boolean;
  error: string | null;
  disabled: boolean;
  onCheckNow: () => void;
}

const STORAGE_KEY = 'xdcstats_bootnodes_collapsed';

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
        title="Reachable but degraded"
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
        title="Probe client error (not the bootnode)"
      >
        Probe error
      </span>
    );
  }
  return (
    <span
      className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
      style={{ background: '#fdecea', color: '#e74c3c' }}
      title="Unreachable"
    >
      Unreachable
    </span>
  );
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
  return parts.join(' · ');
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

const BootnodeRow: React.FC<{ node: BootnodeStatus }> = ({ node }) => (
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
    <td className="px-3 py-2 text-right">
      {node.healthy && node.rttMs != null ? `${node.rttMs} ms` : '–'}
    </td>
    <td className="px-3 py-2">{statusBadge(node.tcpHealthy, 'TCP OK', node.tcpErrorKind)}</td>
    <td className="px-3 py-2 text-right">
      {node.tcpHealthy && node.tcpRttMs != null ? `${node.tcpRttMs} ms` : '–'}
    </td>
    <td className="px-3 py-2 font-mono text-muted max-w-xs truncate" title={node.enode}>
      {truncateEnode(node.enode, 56)}
    </td>
    <td className="px-3 py-2 text-muted max-w-[14rem] truncate" title={formatErrors(node)}>
      {formatErrors(node)}
    </td>
  </tr>
);

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const btnStyle = (disabled: boolean) => ({
    background: disabled ? '#f0f4f8' : '#242c6d',
    color: disabled ? '#a1a7cc' : '#fff',
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 text-xs text-muted"
      style={{ borderTop: '1px solid #e4eaf0' }}
    >
      <span>
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2 py-1 rounded focus:outline-none"
          style={btnStyle(page === 0)}
        >
          ‹ Prev
        </button>
        <span className="px-2">
          Page {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded focus:outline-none"
          style={btnStyle(page >= totalPages - 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

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
    if (!q) return nodes;
    return nodes.filter((node) => matchesBootnodeSearch(node, q));
  }, [allNodes, filter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredNodes.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [report?.checkedAt, filter, pageSize, searchQuery, filteredNodes.length]);

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

  return (
    <section className="mt-2 mb-4">
      <div
        className="bg-white rounded-xl overflow-hidden"
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: collapsed ? 'none' : '1px solid #e4eaf0' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <p className="header-title mb-0" style={{ whiteSpace: 'nowrap' }}>
              Bootnode Health
            </p>
            {!collapsed && (
              <span className="text-xs text-muted hidden sm:inline">UDP discv4 + TCP RLPx</span>
            )}
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

          <div className="flex items-center gap-3 ml-auto">
            {!collapsed && (
              <>
                <input
                  type="text"
                  placeholder="Search enode, node ID, or IP…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-md border-2 border-blue-400 bg-white text-blue-900 placeholder-blue-300 focus:outline-none focus:border-blue-600"
                  style={{ minWidth: 220, maxWidth: 320 }}
                  aria-label="Search bootnodes"
                />

                <label className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold uppercase tracking-wide">Show</span>
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
                  <span className="font-semibold uppercase tracking-wide">Per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={selectStyle}
                    aria-label="Bootnodes per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
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
              className="text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded focus:outline-none"
              style={{
                background: busy ? '#e4eaf0' : '#242c6d',
                color: busy ? '#a1a7cc' : '#fff',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {checking ? 'Checking…' : 'Check now'}
            </button>

            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex items-center justify-center focus:outline-none shrink-0"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 2px',
                color: '#a1a7cc',
                fontSize: 11,
                lineHeight: 1,
                transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand bootnode health' : 'Collapse bootnode health'}
            >
              ▾
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
        <div
          className="flex flex-wrap items-center gap-4 px-6 py-3 text-xs"
          style={{ borderBottom: '1px solid #e4eaf0', background: '#f7f9fb' }}
        >
          {loading && !report ? (
            <span className="text-muted">Waiting for first bootnode check…</span>
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
              {filter !== 'all' && (
                <span className="text-muted">
                  Showing {filteredNodes.length} filtered
                </span>
              )}
              {searchQuery.trim() && (
                <span className="text-muted">
                  Search: {filteredNodes.length} match{filteredNodes.length === 1 ? '' : 'es'}
                </span>
              )}
              {report?.checkedAt && (
                <span className="text-muted" title={report.checkedAt}>
                  Last check: {new Date(report.checkedAt).toLocaleString()}
                </span>
              )}
              {report?.duration && (
                <span className="text-muted">({report.duration})</span>
              )}
            </>
          )}
          {error && <span style={{ color: '#e74c3c' }}>{error}</span>}
        </div>

        <div className="table-responsive">
          <table className="stats-table w-full" style={{ minWidth: 860 }}>
            <thead>
              <tr className="border-b border-gray-100">
                {BOOTNODE_COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    onMouseEnter={(e) => showHeaderTooltip(e, col.description)}
                    onMouseLeave={hideTooltip}
                    onMouseMove={moveTooltip}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedNodes.length ? (
                pagedNodes.map((node) => (
                  <BootnodeRow key={`${node.index}-${node.endpoint}`} node={node} />
                ))
              ) : (
                <tr>
                  <td colSpan={BOOTNODE_COLUMNS.length} className="text-center text-muted py-8 text-sm">
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

        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={filteredNodes.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />

        {tooltip.visible && (
          <div
            className="node-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            dangerouslySetInnerHTML={{ __html: tooltip.html }}
          />
        )}
          </>
        )}
      </div>
    </section>
  );
};

export default BootnodesPanel;
