import type { Node, NodeStats } from '../types';

// ─── Class helpers ───────────────────────────────────────────────────────────

export function peerClass(peers: number, active: boolean): string {
  if (!active) return 'text-muted';
  if (peers <= 1) return 'text-danger';
  if (peers > 1 && peers < 4) return 'text-warning';
  return 'text-success';
}

export function mainClass(node: { active: boolean; peers: number }, bestBlock: number): string {
  void bestBlock;
  if (!node.active) return 'text-muted';
  if (node.peers === 0) return 'text-danger';
  return peerClass(node.peers, node.active);
}

export function blockClass(stats: NodeStats, bestBlock: number): string {
  if (!stats.active) return 'text-muted';
  const diff = bestBlock - stats.block.number;
  if (diff < 1) return 'text-success';
  if (diff === 1) return 'text-warning';
  if (diff > 1 && diff < 4) return 'text-orange';
  return 'text-danger';
}

function blockTimeClass(diffSeconds: number): string {
  if (diffSeconds <= 13) return 'text-success';
  if (diffSeconds <= 20) return 'text-warning';
  if (diffSeconds <= 30) return 'text-orange';
  return 'text-danger';
}

export function timeClass(timestamp: number): string {
  const diff = (Date.now() - timestamp) / 1000;
  return blockTimeClass(diff);
}

export function latencyClass(stats: NodeStats): string {
  if (!stats.active) return 'text-danger';
  if (stats.latency <= 100) return 'text-success';
  if (stats.latency <= 1000) return 'text-warning';
  return 'text-danger';
}

export function upTimeClass(uptime: number, active: boolean): string {
  if (!active) return 'text-muted';
  if (uptime >= 90) return 'text-success';
  if (uptime >= 75) return 'text-warning';
  return 'text-danger';
}

export function propagationTimeClass(stats: NodeStats, bestBlock: number): string {
  if (!stats.active) return 'text-muted';
  if (stats.block.number < bestBlock) return 'text-muted';
  if (stats.block.propagation === 0) return 'text-info';
  if (stats.block.propagation < 1000) return 'text-success';
  if (stats.block.propagation < 3000) return 'text-warning';
  if (stats.block.propagation < 7000) return 'text-orange';
  return 'text-danger';
}

export function nodesActiveClass(active: number, total: number): string {
  const ratio = total === 0 ? 0 : active / total;
  if (ratio >= 0.9) return 'text-success';
  if (ratio >= 0.75) return 'text-info';
  if (ratio >= 0.5) return 'text-warning';
  return 'text-danger';
}

// Color for bubble on world map — returns a fill color hex
export function bubbleColor(node: Node, bestBlock: number): string {
  const cls = mainClass(
    { active: node.stats.active, peers: node.stats.peers },
    bestBlock
  );
  switch (cls) {
    case 'text-success': return '#29b348';
    case 'text-warning': return '#f5b225';
    case 'text-danger':  return '#ec536c';
    case 'text-info':    return '#44a2d2';
    case 'text-orange':  return '#ffb86c';
    default:             return '#a1a7cc';
  }
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function gasPriceFilter(price: string | number | undefined): string {
  if (price === undefined || price === null) return '0 wei';
  const p = String(price);
  if (p.length < 4) return p + ' wei';
  if (p.length < 7) return (parseFloat(p) / 1000).toFixed(2) + ' kwei';
  if (p.length < 10) return (parseFloat(p) / 1_000_000).toFixed(2) + ' mwei';
  if (p.length < 13) return (parseFloat(p) / 1_000_000_000).toFixed(2) + ' gwei';
  if (p.length < 16) return (parseFloat(p) / 1_000_000_000_000).toFixed(2) + ' szabo';
  if (p.length < 19) return p.substring(0, p.length - 15) + ' finney';
  return p.substring(0, p.length - 18) + ' ether';
}

export function blockTimeFilter(timestamp: number): string {
  if (timestamp === 0) return '∞';
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${Math.round(diff)} s ago`;
  return humanizeDuration(Math.round(diff)) + ' ago';
}

export function avgTimeFilter(time: number): string {
  if (time < 60) return parseFloat(time.toString()).toFixed(2) + ' s';
  return humanizeDuration(Math.round(time));
}

export function hashFilter(hash: string | undefined): string {
  if (typeof hash === 'undefined') return '?';
  if (hash.startsWith('0x')) hash = hash.substring(2);
  return hash.substring(0, 8) + '...' + hash.substring(56, 64);
}

export function blockPropagationFilter(ms: number, prefix = '+'): string {
  if (ms < 1000) return (ms === 0 ? '' : prefix) + ms + ' ms';
  if (ms < 1000 * 60) return prefix + (ms / 1000).toFixed(1) + ' s';
  if (ms < 1000 * 60 * 60) return prefix + Math.round(ms / 1000 / 60) + ' min';
  if (ms < 1000 * 60 * 60 * 24) return prefix + Math.round(ms / 1000 / 60 / 60) + ' h';
  return prefix + Math.round(ms / 1000 / 60 / 60 / 24) + ' days';
}

export function transactionRateFilter(rate: number | null): string {
  const r = rate ?? 0;
  if (r < 10000) return Math.round(r).toString() + ' tx/s';
  if (r < 1_000_000) return (r / 1000).toFixed(1) + 'K tx/s';
  return (r / 1_000_000).toFixed(1) + 'M tx/s';
}

export function hashrateFilter(hashes: number, isMining: boolean): string {
  if (!isMining) return '-';
  let result = hashes;
  const units = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
  let unitIdx = 0;
  for (let i = 1; result > 1000; i++) {
    result /= 1000;
    unitIdx = i;
  }
  return result.toFixed(1) + ' ' + units[unitIdx] + 'H/s';
}

export function upTimeFilter(uptime: number): string {
  return Math.round(uptime) + '%';
}

export function nodeVersionFilter(version: string): string {
  if (!version) return '';
  const tmp = version.split('/');
  tmp[0] = tmp[0].replace('Ethereum(++)', 'Eth');
  if (tmp[0].startsWith('pyethapp')) tmp[0] = 'pyeth';
  if (tmp[1] && tmp[1][0] !== 'v' && tmp[1][2] !== '.') tmp.splice(1, 1);
  if (tmp[2] && tmp[2] === 'Release') tmp.splice(2, 1);
  if (tmp[2] && tmp[2].startsWith('Linux')) tmp[2] = 'linux';
  if (tmp[2] && tmp[2].startsWith('Darwin')) tmp[2] = 'darwin';
  return tmp.join('/');
}

export function gasFilter(gas: number | undefined): string {
  return typeof gas !== 'undefined' ? parseInt(gas.toString()).toString() : '?';
}

// ─── Latency readable ────────────────────────────────────────────────────────

export function computeLatencyReadable(node: Node): { latencyClass: string; latency: string } {
  if (!node.stats || node.stats.active === false) {
    return { latencyClass: 'text-danger', latency: 'offline' };
  }
  const lat = node.stats.latency;
  let cls: string;
  if (lat <= 100) cls = 'text-success';
  else if (lat <= 1000) cls = 'text-warning';
  else cls = 'text-danger';
  return { latencyClass: cls, latency: lat + ' ms' };
}

// ─── Tooltip content ─────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function geoTooltipContent(node: Node): string {
  const e = (v: string | number | undefined | null) => escapeHtml(String(v ?? ''));
  const parts: string[] = [];

  if (node.info.node) {
    const ethVersion = node.info.node.split('/');
    if (ethVersion[1]) {
      if (ethVersion[1][0] !== 'v' && ethVersion[1][2] !== '.') {
        ethVersion.splice(1, 1);
      }
      parts.push(`<b>${e(node.info.node)}</b>`);
      if (ethVersion[1]) parts.push(`Version: <b>${e(ethVersion[1])}</b>`);
    }
  }

  if (node.info.net) parts.push(`Network: <b>${e(node.info.net)}</b>`);
  if (node.info.protocol) parts.push(`Protocol: <b>${e(node.info.protocol)}</b>`);
  if (node.info.port) parts.push(`Port: <b>${e(node.info.port ?? '30303')}</b>`);
  if (node.info.api) parts.push(`Web3: <b>${e(node.info.api)}</b>`);
  if (node.info.client) parts.push(`API: <b>${e(node.info.client ?? '<= 0.0.3')}</b>`);
  if (node.info.os) {
    parts.push(`OS: <b>${e(node.info.os)} ${e(node.info.os_v)}</b>`);
  }
  if (node.geo) {
    let loc = 'Location: <b>';
    if (node.geo.city) loc += e(node.geo.city) + ', ';
    loc += e(node.geo.country) + '</b>';
    parts.push(loc);
  }
  if (node.info.contact) parts.push(`Contact: <b>${e(node.info.contact)}</b>`);

  return parts.join('<br>');
}

// ─── Propagation history bar color ───────────────────────────────────────────

export function propagationHistoryColor(ms: number): string {
  if (ms < 0) return '#a1a7cc';   // no data – gray
  if (ms === 0) return '#a1a7cc'; // 0 = gray (same as gray range)
  if (ms < 1) return '#a1a7cc';
  if (ms <= 1000) return '#29b348';  // green
  if (ms <= 3000) return '#f5b225';  // yellow
  if (ms <= 7000) return '#ffb86c';  // orange
  return '#ec536c';                   // red
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simple human-readable duration for seconds */
function humanizeDuration(seconds: number): string {
  if (seconds < 60) return seconds + ' s';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' h';
  const days = Math.floor(hours / 24);
  return days + ' day' + (days !== 1 ? 's' : '');
}

// ─── XSS filter ──────────────────────────────────────────────────────────────

export function xssFilter<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(xssFilter) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = xssFilter((obj as Record<string, unknown>)[key]);
    }
    return result as unknown as T;
  }
  if (typeof obj === 'string') {
    return obj
      .replace(/<\s*\/?\s*script\s*>/gi, '')
      .replace(/javascript/gi, '') as unknown as T;
  }
  return obj;
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

/** Deep-get a value from an object using a dot-separated path */
export function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Compare two nodes using an array of sort keys (prefix `-` for descending) */
export function sortNodes(nodes: Node[], predicates: string[]): Node[] {
  return [...nodes].sort((a, b) => {
    for (const pred of predicates) {
      const desc = pred.startsWith('-');
      const key = desc ? pred.slice(1) : pred;
      const av = deepGet(a as unknown as Record<string, unknown>, key);
      const bv = deepGet(b as unknown as Record<string, unknown>, key);

      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
        cmp = (av ? 1 : 0) - (bv ? 1 : 0);
      } else if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      } else if (av !== undefined && bv === undefined) {
        cmp = 1;
      } else if (av === undefined && bv !== undefined) {
        cmp = -1;
      }

      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
}
