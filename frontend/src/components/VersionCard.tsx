import React, { useMemo } from 'react';
import type { Node } from '../types';

interface VersionCardProps {
  nodes: Node[];
}

function extractVersion(nodeStr: string): string {
  if (!nodeStr) return 'unknown';
  const v = nodeStr.split('/')[1];
  return v ?? 'unknown';
}

const VersionCard: React.FC<VersionCardProps> = ({ nodes }) => {
  const versions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      const v = extractVersion(n.info?.node ?? '');
      counts[v] = (counts[v] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  return (
    <div
      className="bg-white rounded-xl mb-4 flex flex-col"
      style={{
        padding: '20px 24px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
      }}
    >
      <p className="header-title mb-3">Node Versions</p>
      {versions.length === 0 ? (
        <span className="text-muted text-sm">–</span>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 120 }}>
          {versions.map(([ver, count]) => (
            <div key={ver} className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-mono text-dark truncate"
                style={{ maxWidth: '75%' }}
                title={ver}
              >
                {ver}
              </span>
              <span
                className="text-xs font-semibold rounded-full px-2 py-0.5 flex-shrink-0"
                style={{ background: '#eef2f7', color: '#242c6d', minWidth: 28, textAlign: 'center' }}
              >
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VersionCard;
