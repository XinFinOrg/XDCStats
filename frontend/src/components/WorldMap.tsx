import React, { memo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';
import type { Node } from '../types';
import { bubbleColor } from '../utils/filters';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface WorldMapProps {
  nodes: Node[];
  bestBlock: number;
}

const WorldMap: React.FC<WorldMapProps> = ({ nodes, bestBlock }) => {
  const geoNodes = nodes.filter((n) => n.geo !== null && n.geo.ll[0] !== 0 && n.geo.ll[1] !== 0);

  return (
    <div>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [10, 20] }}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#e8edf2"
                stroke="#cdd4db"
                strokeWidth={0.5}
                style={{
                  default: { outline: 'none' },
                  hover: { outline: 'none', fill: '#d0d9e2' },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        {geoNodes.map((node) => {
          const [lat, lng] = node.geo!.ll;
          const color = bubbleColor(node, bestBlock);
          return (
            <Marker key={node.id} coordinates={[lng, lat]}>
              <circle
                r={5}
                fill={color}
                fillOpacity={0.85}
                stroke="#fff"
                strokeWidth={1}
              />
              <title>
                {node.info.name}
                {node.geo?.city ? ` – ${node.geo.city}, ${node.geo.country}` : ''}
              </title>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs text-muted flex-wrap">
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#29b348', display: 'inline-block' }} />
          Active
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f5b225', display: 'inline-block' }} />
          Few peers
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ec536c', display: 'inline-block' }} />
          No peers / error
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#a1a7cc', display: 'inline-block' }} />
          Offline
        </span>
      </div>
    </div>
  );
};

export default memo(WorldMap);
