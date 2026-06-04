import React, { useMemo, useState, useRef } from 'react';

interface SparklineChartProps {
  data: number[];
  title: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  unit?: string;
  showAxes?: boolean;
  xAxisTitle?: string;
  yAxisTitle?: string;
  onClick?: () => void;
}

const MAX_BARS = 40;

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  title,
  color = '#44a2d2',
  height = 80,
  formatValue,
  unit = '',
  showAxes = false,
  xAxisTitle,
  yAxisTitle,
  onClick,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const values = useMemo(() => {
    const slice = data.slice(-MAX_BARS);
    return slice.map((v) => (v < 0 ? 0 : v));
  }, [data]);

  const max = useMemo(() => Math.max(...values, 1), [values]);

  const barWidth = 100 / (values.length || 1);

  const latestLabel =
    values.length > 0 && formatValue
      ? formatValue(values[values.length - 1]) + unit
      : null;

  const gradientId = `grad-${title.replace(/\s+/g, '-')}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.floor((x / rect.width) * values.length);
    setHoveredIdx(Math.max(0, Math.min(values.length - 1, idx)));
  };

  const tooltipLabel =
    hoveredIdx !== null
      ? (formatValue ? formatValue(values[hoveredIdx]) + unit : String(values[hoveredIdx]))
      : null;

  // Tooltip left position as percentage, clamped so it doesn't overflow the container
  const tooltipLeft =
    hoveredIdx !== null
      ? `clamp(20px, ${((hoveredIdx + 0.5) / values.length) * 100}%, calc(100% - 20px))`
      : '0';

  const bars = (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.9} />
          <stop offset="100%" stopColor={color} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      {showAxes &&
        [0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            y1={f * height}
            x2="100"
            y2={f * height}
            stroke="#e4eaf0"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {values.map((v, i) => {
        const barH = max > 0 ? (v / max) * (height - 4) : 0;
        const x = i * barWidth;
        const y = height - barH;
        const isHovered = i === hoveredIdx;
        return (
          <rect
            key={i}
            x={x + 0.3}
            y={y}
            width={barWidth - 0.6}
            height={barH}
            fill={isHovered ? color : `url(#${gradientId})`}
            rx={0.8}
            opacity={hoveredIdx !== null && !isHovered ? 0.5 : 1}
          />
        );
      })}
    </>
  );

  return (
    <div
      className="bg-white rounded-xl mb-4 flex flex-col"
      style={{
        padding: '16px 20px 12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="header-title" style={{ marginBottom: 0 }}>
          {title}
          {onClick && (
            <span style={{ fontSize: 10, color: '#a1a7cc', marginLeft: 6, fontWeight: 400 }}>
              ↗ expand
            </span>
          )}
        </p>
        {latestLabel && (
          <span className="text-xs font-semibold font-mono" style={{ color }}>
            {latestLabel}
          </span>
        )}
      </div>

      {showAxes ? (
        <div>
          <div style={{ display: 'flex', gap: 4 }}>
            {/* Y-axis title (rotated) */}
            {yAxisTitle && (
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 9,
                    color: '#8a95a3',
                    fontFamily: 'monospace',
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  {yAxisTitle}
                </span>
              </div>
            )}
            {/* Y-axis tick labels */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                width: 32,
                flexShrink: 0,
                paddingBottom: 2,
              }}
            >
              <span style={{ fontSize: 9, color: '#8a95a3', fontFamily: 'monospace', lineHeight: 1 }}>
                {formatValue ? formatValue(max) : max}
              </span>
              <span style={{ fontSize: 9, color: '#8a95a3', fontFamily: 'monospace', lineHeight: 1 }}>
                0
              </span>
            </div>
            {/* Chart area with tooltip */}
            <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }}>
              <svg
                viewBox={`0 0 100 ${height}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
                aria-label={title}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {bars}
              </svg>
              {hoveredIdx !== null && tooltipLabel && (
                <div
                  style={{
                    position: 'absolute',
                    left: tooltipLeft,
                    top: 4,
                    transform: 'translateX(-50%)',
                    background: 'rgba(30,42,110,0.88)',
                    color: '#fff',
                    borderRadius: 5,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                  }}
                >
                  {tooltipLabel}
                </div>
              )}
            </div>
          </div>
          {/* X-axis tick labels */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingLeft: yAxisTitle ? 52 : 36,
              marginTop: 3,
            }}
          >
            <span style={{ fontSize: 9, color: '#8a95a3', fontFamily: 'monospace' }}>Oldest</span>
            <span style={{ fontSize: 9, color: '#8a95a3', fontFamily: 'monospace' }}>Latest</span>
          </div>
          {/* X-axis title */}
          {xAxisTitle && (
            <div
              style={{
                textAlign: 'center',
                paddingLeft: yAxisTitle ? 52 : 36,
                marginTop: 2,
              }}
            >
              <span style={{ fontSize: 9, color: '#8a95a3', fontFamily: 'monospace' }}>
                {xAxisTitle}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
            aria-label={title}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {bars}
          </svg>
          {hoveredIdx !== null && tooltipLabel && (
            <div
              style={{
                position: 'absolute',
                left: tooltipLeft,
                top: 4,
                transform: 'translateX(-50%)',
                background: 'rgba(30,42,110,0.88)',
                color: '#fff',
                borderRadius: 5,
                padding: '3px 8px',
                fontSize: 11,
                fontFamily: 'monospace',
                fontWeight: 600,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              {tooltipLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SparklineChart;
