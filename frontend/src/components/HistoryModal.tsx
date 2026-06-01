import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

export type HistoryMetric = 'blocktime' | 'transactions' | 'gasUsed';

interface HistoryData {
  heights: number[];
  values: number[];
  count: number;
}

interface HistoryModalProps {
  metric: HistoryMetric;
  title: string;
  color: string;
  unit: string;
  formatValue: (v: number) => string;
  yAxisTitle: string;
  apiUrl: string;
  onClose: () => void;
}

const W = 1000;
const H = 300;
const PAD_LEFT = 64;
const PAD_BOTTOM = 36;
const PAD_TOP = 16;
const PAD_RIGHT = 16;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_BOTTOM - PAD_TOP;
const PAGE_SIZE = 1000;

const HistoryModal: React.FC<HistoryModalProps> = ({
  metric, title, color, unit, formatValue, yAxisTitle, apiUrl, onClose,
}) => {
  const [allData, setAllData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch full history once
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/v2/history?metric=${metric}&limit=100000`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: HistoryData) => {
        setAllData(d);
        // Default to last PAGE_SIZE blocks
        setWindowStart(Math.max(0, d.values.length - PAGE_SIZE));
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [metric, apiUrl]);

  // Current window slice
  const vals = useMemo(
    () => (allData ? allData.values.slice(windowStart, windowStart + PAGE_SIZE) : []),
    [allData, windowStart],
  );
  const hts = useMemo(
    () => (allData ? allData.heights.slice(windowStart, windowStart + PAGE_SIZE) : []),
    [allData, windowStart],
  );

  const totalCount = allData?.values.length ?? 0;
  const canGoLeft = windowStart > 0;
  const canGoRight = windowStart + PAGE_SIZE < totalCount;

  const goLeft = useCallback(
    () => setWindowStart((p) => Math.max(0, p - PAGE_SIZE)),
    [],
  );
  const goRight = useCallback(
    () => setWindowStart((p) => Math.min(totalCount - PAGE_SIZE, p + PAGE_SIZE)),
    [totalCount],
  );

  // Stats for current window
  const stats = useMemo(() => {
    const nonZero = vals.filter((v) => v > 0);
    if (nonZero.length === 0) return null;
    const sum = nonZero.reduce((a, b) => a + b, 0);
    return { min: Math.min(...nonZero), max: Math.max(...nonZero), avg: sum / nonZero.length };
  }, [vals]);

  const maxVal = useMemo(() => Math.max(...vals, 1), [vals]);

  // SVG paths
  const { areaPath, linePath } = useMemo(() => {
    if (vals.length < 2) return { areaPath: '', linePath: '' };
    const pts = vals.map((v, i) => {
      const x = PAD_LEFT + (i / (vals.length - 1)) * CHART_W;
      const y = PAD_TOP + CHART_H - (v / maxVal) * CHART_H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = 'M' + pts.join('L');
    const lastX = (PAD_LEFT + CHART_W).toFixed(1);
    const baseY = (PAD_TOP + CHART_H).toFixed(1);
    const firstX = PAD_LEFT.toFixed(1);
    return {
      linePath: line,
      areaPath: `${line}L${lastX},${baseY}L${firstX},${baseY}Z`,
    };
  }, [vals, maxVal]);

  // Y-axis ticks
  const yTicks = useMemo(
    () => [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: PAD_TOP + CHART_H - f * CHART_H,
      label: formatValue(f * maxVal),
    })),
    [maxVal, formatValue],
  );

  // X-axis ticks (5 evenly spaced block numbers)
  const xTicks = useMemo(() => {
    if (hts.length === 0) return [];
    return [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const idx = Math.round(f * (hts.length - 1));
      return { x: PAD_LEFT + f * CHART_W, label: `#${hts[idx]?.toLocaleString() ?? ''}` };
    });
  }, [hts]);

  // Hover crosshair
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || vals.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left - rect.width * (PAD_LEFT / W);
    const chartPxW = rect.width * (CHART_W / W);
    const idx = Math.round((relX / chartPxW) * (vals.length - 1));
    setHoveredIdx(Math.max(0, Math.min(vals.length - 1, idx)));
  }, [vals.length]);

  const hoveredX = hoveredIdx !== null ? PAD_LEFT + (hoveredIdx / (vals.length - 1)) * CHART_W : null;
  const hoveredY = hoveredIdx !== null ? PAD_TOP + CHART_H - (vals[hoveredIdx] / maxVal) * CHART_H : null;
  const hoveredBlock = hoveredIdx !== null ? hts[hoveredIdx] : null;
  const hoveredVal = hoveredIdx !== null ? vals[hoveredIdx] : null;

  // Keyboard: Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goLeft();
      if (e.key === 'ArrowRight') goRight();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goLeft, goRight]);

  const gradId = `modal-grad-${metric}`;

  const navBtnStyle = (enabled: boolean): React.CSSProperties => ({
    background: enabled ? '#f0f4f8' : '#f8fafb',
    border: 'none',
    borderRadius: 8,
    width: 36,
    height: 36,
    cursor: enabled ? 'pointer' : 'default',
    fontSize: 18,
    color: enabled ? '#1e2a6e' : '#c4cdd6',
    lineHeight: '36px',
    textAlign: 'center',
    flexShrink: 0,
    transition: 'background 0.15s',
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10,18,50,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16,
          padding: '28px 32px 24px',
          width: '92vw', maxWidth: 1100,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 48px rgba(0,0,0,0.22)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1e2a6e' }}>{title}</span>
            {allData && (
              <span style={{ fontSize: 12, color: '#8a95a3', marginLeft: 12 }}>
                {allData.count.toLocaleString()} blocks in memory
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f0f4f8', border: 'none', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer',
              fontSize: 18, color: '#6b7280', lineHeight: '32px', textAlign: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Stats bar */}
        {stats && (
          <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
            {([
              { label: 'Min', value: formatValue(stats.min) + unit },
              { label: 'Avg', value: formatValue(stats.avg) + unit },
              { label: 'Max', value: formatValue(stats.max) + unit },
            ] as const).map(({ label, value }) => (
              <div key={label}>
                <span style={{ fontSize: 11, color: '#8a95a3', display: 'block' }}>{label}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#1e2a6e', fontFamily: 'monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8a95a3' }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#ec536c' }}>
            Error: {error}
          </div>
        )}
        {!loading && !error && vals.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8a95a3' }}>
            No data yet
          </div>
        )}
        {!loading && !error && vals.length > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 300, display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((t) => (
              <line key={t.y} x1={PAD_LEFT} y1={t.y} x2={PAD_LEFT + CHART_W} y2={t.y}
                stroke="#e4eaf0" strokeWidth="1" />
            ))}

            {/* Area + Line */}
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />

            {/* Y-axis ticks + labels */}
            {yTicks.map((t) => (
              <g key={t.y}>
                <line x1={PAD_LEFT - 4} y1={t.y} x2={PAD_LEFT} y2={t.y} stroke="#c4cdd6" strokeWidth="1" />
                <text x={PAD_LEFT - 8} y={t.y} textAnchor="end" dominantBaseline="middle"
                  style={{ fontSize: 10, fill: '#8a95a3', fontFamily: 'monospace' }}>
                  {t.label}
                </text>
              </g>
            ))}

            {/* Y-axis title */}
            <text
              x={12} y={PAD_TOP + CHART_H / 2} textAnchor="middle"
              transform={`rotate(-90, 12, ${PAD_TOP + CHART_H / 2})`}
              style={{ fontSize: 11, fill: '#8a95a3', fontFamily: 'monospace' }}
            >
              {yAxisTitle}
            </text>

            {/* X-axis ticks + labels */}
            {xTicks.map((t) => (
              <g key={t.x}>
                <line x1={t.x} y1={PAD_TOP + CHART_H} x2={t.x} y2={PAD_TOP + CHART_H + 4} stroke="#c4cdd6" strokeWidth="1" />
                <text x={t.x} y={PAD_TOP + CHART_H + 14} textAnchor="middle"
                  style={{ fontSize: 10, fill: '#8a95a3', fontFamily: 'monospace' }}>
                  {t.label}
                </text>
              </g>
            ))}

            {/* X-axis title */}
            <text x={PAD_LEFT + CHART_W / 2} y={H - 2} textAnchor="middle"
              style={{ fontSize: 11, fill: '#8a95a3', fontFamily: 'monospace' }}>
              Block
            </text>

            {/* Axes borders */}
            <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + CHART_H} stroke="#c4cdd6" strokeWidth="1" />
            <line x1={PAD_LEFT} y1={PAD_TOP + CHART_H} x2={PAD_LEFT + CHART_W} y2={PAD_TOP + CHART_H} stroke="#c4cdd6" strokeWidth="1" />

            {/* Hover crosshair */}
            {hoveredX !== null && hoveredY !== null && (
              <>
                <line x1={hoveredX} y1={PAD_TOP} x2={hoveredX} y2={PAD_TOP + CHART_H}
                  stroke="#1e2a6e" strokeWidth="1" strokeDasharray="4 3" opacity={0.4} />
                <circle cx={hoveredX} cy={hoveredY} r={4} fill={color} stroke="#fff" strokeWidth="2" />
                <g transform={`translate(${Math.min(hoveredX + 10, W - 130)},${Math.max(hoveredY - 36, PAD_TOP)})`}>
                  <rect x={0} y={0} width={120} height={36} rx={5} fill="rgba(30,42,110,0.88)" />
                  <text x={8} y={13} style={{ fontSize: 9, fill: '#a1a7cc', fontFamily: 'monospace' }}>
                    Block #{hoveredBlock?.toLocaleString()}
                  </text>
                  <text x={8} y={27} style={{ fontSize: 12, fill: '#fff', fontWeight: 700, fontFamily: 'monospace' }}>
                    {hoveredVal !== null ? formatValue(hoveredVal) + unit : ''}
                  </text>
                </g>
              </>
            )}
          </svg>
        )}

        {/* Navigation bar */}
        {!loading && !error && totalCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 }}>
            <button
              onClick={goLeft}
              disabled={!canGoLeft}
              style={navBtnStyle(canGoLeft)}
              title="Older blocks (←)"
            >
              ←
            </button>

            <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace', minWidth: 280, textAlign: 'center' }}>
              {hts.length > 0
                ? `#${hts[0]?.toLocaleString()} – #${hts[hts.length - 1]?.toLocaleString()}`
                : '–'}
              <span style={{ color: '#a1a7cc', marginLeft: 8 }}>
                ({Math.min(vals.length, PAGE_SIZE).toLocaleString()} of {totalCount.toLocaleString()} blocks)
              </span>
            </span>

            <button
              onClick={goRight}
              disabled={!canGoRight}
              style={navBtnStyle(canGoRight)}
              title="Newer blocks (→)"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModal;
