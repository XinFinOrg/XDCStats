import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  peerClass,
  mainClass,
  blockClass,
  latencyClass,
  upTimeClass,
  propagationTimeClass,
  nodesActiveClass,
  bubbleColor,
  gasPriceFilter,
  blockTimeFilter,
  avgTimeFilter,
  hashFilter,
  blockPropagationFilter,
  transactionRateFilter,
  hashrateFilter,
  upTimeFilter,
  nodeVersionFilter,
  gasFilter,
  computeLatencyReadable,
  propagationHistoryColor,
  xssFilter,
  deepGet,
  sortNodes,
  geoTooltipContent,
} from '../utils/filters';
import type { Node, NodeStats } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeStats = (overrides: Partial<NodeStats> = {}): NodeStats => ({
  active: true,
  peers: 5,
  gasPrice: '1000000000',
  uptime: 99,
  pending: 0,
  latency: 50,
  block: {
    number: 100,
    arrived: Date.now() - 5000,
    propagation: 250,
    gasLimit: 21000000,
  },
  ...overrides,
});

const makeNode = (overrides: Partial<Node> = {}): Node => ({
  id: 'node-1',
  info: {
    name: 'TestNode',
    node: 'XDCChain/v1.8.0/linux/go1.16',
    net: '50',
    protocol: 'eth/63',
    port: 30303,
    api: 'No',
    client: '0.1.1',
    os: 'linux',
    os_v: 'amd64',
    contact: 'admin@xinfin.org',
  },
  stats: makeStats(),
  history: Array(40).fill(-1),
  geo: { ll: [1.3, 103.8], city: 'Singapore', country: 'SG' },
  pinned: false,
  ...overrides,
});

// ─── peerClass ───────────────────────────────────────────────────────────────

describe('peerClass', () => {
  it('returns text-muted when inactive', () => {
    expect(peerClass(10, false)).toBe('text-muted');
  });

  it('returns text-danger for 0 peers', () => {
    expect(peerClass(0, true)).toBe('text-danger');
  });

  it('returns text-danger for 1 peer', () => {
    expect(peerClass(1, true)).toBe('text-danger');
  });

  it('returns text-warning for 2 peers', () => {
    expect(peerClass(2, true)).toBe('text-warning');
  });

  it('returns text-warning for 3 peers', () => {
    expect(peerClass(3, true)).toBe('text-warning');
  });

  it('returns text-success for 4+ peers', () => {
    expect(peerClass(4, true)).toBe('text-success');
    expect(peerClass(25, true)).toBe('text-success');
  });
});

// ─── mainClass ───────────────────────────────────────────────────────────────

describe('mainClass', () => {
  it('returns text-muted when inactive', () => {
    expect(mainClass({ active: false, peers: 10 }, 100)).toBe('text-muted');
  });

  it('returns text-danger when 0 peers even if active', () => {
    expect(mainClass({ active: true, peers: 0 }, 100)).toBe('text-danger');
  });

  it('delegates to peerClass when active and peers > 0', () => {
    expect(mainClass({ active: true, peers: 5 }, 100)).toBe('text-success');
    expect(mainClass({ active: true, peers: 2 }, 100)).toBe('text-warning');
  });
});

// ─── blockClass ──────────────────────────────────────────────────────────────

describe('blockClass', () => {
  it('returns text-muted when inactive', () => {
    const stats = makeStats({ active: false });
    expect(blockClass(stats, 200)).toBe('text-muted');
  });

  it('returns text-success when on best block', () => {
    const stats = makeStats({ block: { ...makeStats().block, number: 100 } });
    expect(blockClass(stats, 100)).toBe('text-success');
  });

  it('returns text-warning when 1 behind', () => {
    const stats = makeStats({ block: { ...makeStats().block, number: 99 } });
    expect(blockClass(stats, 100)).toBe('text-warning');
  });

  it('returns text-orange when 2–3 behind', () => {
    const s2 = makeStats({ block: { ...makeStats().block, number: 98 } });
    const s3 = makeStats({ block: { ...makeStats().block, number: 97 } });
    expect(blockClass(s2, 100)).toBe('text-orange');
    expect(blockClass(s3, 100)).toBe('text-orange');
  });

  it('returns text-danger when 4+ behind', () => {
    const stats = makeStats({ block: { ...makeStats().block, number: 90 } });
    expect(blockClass(stats, 100)).toBe('text-danger');
  });
});

// ─── latencyClass ────────────────────────────────────────────────────────────

describe('latencyClass', () => {
  it('returns text-danger when inactive', () => {
    expect(latencyClass(makeStats({ active: false }))).toBe('text-danger');
  });

  it('returns text-success for latency ≤ 100 ms', () => {
    expect(latencyClass(makeStats({ latency: 50 }))).toBe('text-success');
    expect(latencyClass(makeStats({ latency: 100 }))).toBe('text-success');
  });

  it('returns text-warning for latency 101–1000 ms', () => {
    expect(latencyClass(makeStats({ latency: 101 }))).toBe('text-warning');
    expect(latencyClass(makeStats({ latency: 1000 }))).toBe('text-warning');
  });

  it('returns text-danger for latency > 1000 ms', () => {
    expect(latencyClass(makeStats({ latency: 1001 }))).toBe('text-danger');
  });
});

// ─── upTimeClass ─────────────────────────────────────────────────────────────

describe('upTimeClass', () => {
  it('returns text-muted when inactive', () => {
    expect(upTimeClass(99, false)).toBe('text-muted');
  });

  it('returns text-success for uptime ≥ 90%', () => {
    expect(upTimeClass(90, true)).toBe('text-success');
    expect(upTimeClass(100, true)).toBe('text-success');
  });

  it('returns text-warning for uptime 75–89%', () => {
    expect(upTimeClass(75, true)).toBe('text-warning');
    expect(upTimeClass(89, true)).toBe('text-warning');
  });

  it('returns text-danger for uptime < 75%', () => {
    expect(upTimeClass(74, true)).toBe('text-danger');
    expect(upTimeClass(0, true)).toBe('text-danger');
  });
});

// ─── propagationTimeClass ────────────────────────────────────────────────────

describe('propagationTimeClass', () => {
  it('returns text-muted when inactive', () => {
    const s = makeStats({ active: false });
    expect(propagationTimeClass(s, 100)).toBe('text-muted');
  });

  it('returns text-muted when block is behind best', () => {
    const s = makeStats({ block: { ...makeStats().block, number: 80 } });
    expect(propagationTimeClass(s, 100)).toBe('text-muted');
  });

  it('returns text-info when propagation is 0', () => {
    const s = makeStats({ block: { ...makeStats().block, number: 100, propagation: 0 } });
    expect(propagationTimeClass(s, 100)).toBe('text-info');
  });

  it('returns text-success for propagation < 1000 ms', () => {
    const s = makeStats({ block: { ...makeStats().block, number: 100, propagation: 500 } });
    expect(propagationTimeClass(s, 100)).toBe('text-success');
  });

  it('returns text-warning for 1000–2999 ms', () => {
    const s = makeStats({ block: { ...makeStats().block, number: 100, propagation: 2000 } });
    expect(propagationTimeClass(s, 100)).toBe('text-warning');
  });

  it('returns text-orange for 3000–6999 ms', () => {
    const s = makeStats({ block: { ...makeStats().block, number: 100, propagation: 5000 } });
    expect(propagationTimeClass(s, 100)).toBe('text-orange');
  });

  it('returns text-danger for ≥ 7000 ms', () => {
    const s = makeStats({ block: { ...makeStats().block, number: 100, propagation: 9000 } });
    expect(propagationTimeClass(s, 100)).toBe('text-danger');
  });
});

// ─── nodesActiveClass ────────────────────────────────────────────────────────

describe('nodesActiveClass', () => {
  it('returns text-danger when no nodes', () => {
    expect(nodesActiveClass(0, 0)).toBe('text-danger');
  });

  it('returns text-success for ratio ≥ 0.9', () => {
    expect(nodesActiveClass(9, 10)).toBe('text-success');
    expect(nodesActiveClass(10, 10)).toBe('text-success');
  });

  it('returns text-info for ratio 0.75–0.89', () => {
    expect(nodesActiveClass(8, 10)).toBe('text-info');
    expect(nodesActiveClass(75, 100)).toBe('text-info');
  });

  it('returns text-warning for ratio 0.5–0.74', () => {
    expect(nodesActiveClass(5, 10)).toBe('text-warning');
    expect(nodesActiveClass(60, 100)).toBe('text-warning');
  });

  it('returns text-danger for ratio < 0.5', () => {
    expect(nodesActiveClass(4, 10)).toBe('text-danger');
    expect(nodesActiveClass(1, 10)).toBe('text-danger');
  });
});

// ─── gasPriceFilter ──────────────────────────────────────────────────────────

describe('gasPriceFilter', () => {
  it('returns "0 wei" for undefined', () => {
    expect(gasPriceFilter(undefined)).toBe('0 wei');
  });

  it('formats short values as wei', () => {
    expect(gasPriceFilter('500')).toBe('500 wei');
    expect(gasPriceFilter('1')).toBe('1 wei');
  });

  it('formats 4–6 chars as kwei', () => {
    expect(gasPriceFilter('5000')).toContain('kwei');
  });

  it('formats 10–12 chars as gwei', () => {
    expect(gasPriceFilter('1000000000')).toContain('gwei');
  });

  it('formats 19+ chars as ether', () => {
    // 1 ether = 1000000000000000000 (19 chars)
    expect(gasPriceFilter('1000000000000000000')).toContain('ether');
  });
});

// ─── blockTimeFilter ─────────────────────────────────────────────────────────

describe('blockTimeFilter', () => {
  it('returns ∞ for timestamp 0', () => {
    expect(blockTimeFilter(0)).toBe('∞');
  });

  it('formats recent timestamps as "X s ago"', () => {
    const ts = Date.now() - 10_000; // 10 seconds ago
    expect(blockTimeFilter(ts)).toMatch(/^\d+ s ago$/);
  });

  it('formats older timestamps with human-readable duration', () => {
    const ts = Date.now() - 90_000; // 90 seconds ago
    const result = blockTimeFilter(ts);
    expect(result).toContain('ago');
    expect(result).not.toMatch(/^\d+ s ago$/);
  });
});

// ─── avgTimeFilter ───────────────────────────────────────────────────────────

describe('avgTimeFilter', () => {
  it('formats seconds as "X.XX s"', () => {
    expect(avgTimeFilter(4.25)).toBe('4.25 s');
    expect(avgTimeFilter(0)).toBe('0.00 s');
  });

  it('formats >= 60 s in human-readable form', () => {
    expect(avgTimeFilter(60)).toMatch(/min/);
  });

  it('formats hours', () => {
    expect(avgTimeFilter(3600)).toMatch(/h/);
  });
});

// ─── hashFilter ──────────────────────────────────────────────────────────────

describe('hashFilter', () => {
  it('returns "?" for undefined', () => {
    expect(hashFilter(undefined)).toBe('?');
  });

  it('strips 0x prefix and shortens', () => {
    const hash = '0x' + 'a'.repeat(64);
    const result = hashFilter(hash);
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(64);
  });

  it('shortens without 0x prefix', () => {
    const hash = 'b'.repeat(64);
    const result = hashFilter(hash);
    expect(result).toContain('...');
  });
});

// ─── blockPropagationFilter ──────────────────────────────────────────────────

describe('blockPropagationFilter', () => {
  it('returns "0 ms" for 0 ms (no prefix for zero)', () => {
    // prefix is omitted when ms === 0, but the value "0 ms" is still shown
    expect(blockPropagationFilter(0)).toBe('0 ms');
  });

  it('formats ms with "+" prefix', () => {
    expect(blockPropagationFilter(250)).toBe('+250 ms');
  });

  it('formats with custom prefix', () => {
    expect(blockPropagationFilter(250, '')).toBe('250 ms');
    expect(blockPropagationFilter(250, 'avg:')).toBe('avg:250 ms');
  });

  it('formats seconds', () => {
    expect(blockPropagationFilter(1500)).toBe('+1.5 s');
  });

  it('formats minutes', () => {
    expect(blockPropagationFilter(90_000)).toBe('+2 min');
  });

  it('formats hours', () => {
    expect(blockPropagationFilter(3_600_000)).toBe('+1 h');
  });

  it('formats days', () => {
    expect(blockPropagationFilter(172_800_000)).toBe('+2 days');
  });
});

// ─── transactionRateFilter ───────────────────────────────────────────────────

describe('transactionRateFilter', () => {
  it('formats null as "0 tx/s"', () => {
    expect(transactionRateFilter(null)).toBe('0 tx/s');
  });

  it('formats small rates', () => {
    expect(transactionRateFilter(42)).toBe('42 tx/s');
  });

  it('formats thousands as K', () => {
    expect(transactionRateFilter(15_000)).toContain('K tx/s');
  });

  it('formats millions as M', () => {
    expect(transactionRateFilter(2_000_000)).toContain('M tx/s');
  });
});

// ─── hashrateFilter ──────────────────────────────────────────────────────────

describe('hashrateFilter', () => {
  it('returns "-" when not mining', () => {
    expect(hashrateFilter(1_000_000, false)).toBe('-');
  });

  it('formats raw hashes', () => {
    expect(hashrateFilter(500, true)).toContain('H/s');
  });

  it('formats KH/s', () => {
    expect(hashrateFilter(1500, true)).toContain('K');
  });

  it('formats MH/s', () => {
    expect(hashrateFilter(1_500_000, true)).toContain('M');
  });
});

// ─── upTimeFilter ────────────────────────────────────────────────────────────

describe('upTimeFilter', () => {
  it('rounds and appends %', () => {
    expect(upTimeFilter(95.7)).toBe('96%');
    expect(upTimeFilter(100)).toBe('100%');
    expect(upTimeFilter(0)).toBe('0%');
  });
});

// ─── nodeVersionFilter ───────────────────────────────────────────────────────

describe('nodeVersionFilter', () => {
  it('returns empty string for empty input', () => {
    expect(nodeVersionFilter('')).toBe('');
  });

  it('handles standard XDCChain version string', () => {
    const result = nodeVersionFilter('XDCChain/v1.8.0/linux/go1.16');
    expect(result).toContain('XDCChain');
    expect(result).toContain('v1.8.0');
  });

  it('replaces Ethereum(++) with Eth', () => {
    const result = nodeVersionFilter('Ethereum(++)/v1.0/linux/go1.10');
    expect(result).toContain('Eth');
    expect(result).not.toContain('Ethereum(++)');
  });

  it('replaces pyethapp with pyeth', () => {
    expect(nodeVersionFilter('pyethapp/v1.0')).toContain('pyeth');
  });

  it('normalises Linux platform', () => {
    const result = nodeVersionFilter('XDC/v1.0/Linux-amd64/go1.16');
    expect(result).toContain('linux');
  });

  it('normalises Darwin platform', () => {
    const result = nodeVersionFilter('XDC/v1.0/Darwin-arm64/go1.21');
    expect(result).toContain('darwin');
  });
});

// ─── gasFilter ───────────────────────────────────────────────────────────────

describe('gasFilter', () => {
  it('returns "?" for undefined', () => {
    expect(gasFilter(undefined)).toBe('?');
  });

  it('returns string representation of number', () => {
    expect(gasFilter(21_000_000)).toBe('21000000');
  });
});

// ─── computeLatencyReadable ──────────────────────────────────────────────────

describe('computeLatencyReadable', () => {
  it('returns offline for inactive node', () => {
    const node = makeNode({ stats: makeStats({ active: false }) });
    const r = computeLatencyReadable(node);
    expect(r.latency).toBe('offline');
    expect(r.latencyClass).toBe('text-danger');
  });

  it('returns success class for low latency', () => {
    const node = makeNode({ stats: makeStats({ active: true, latency: 30 }) });
    const r = computeLatencyReadable(node);
    expect(r.latencyClass).toBe('text-success');
    expect(r.latency).toBe('30 ms');
  });

  it('returns warning class for medium latency (101–1000 ms)', () => {
    const node = makeNode({ stats: makeStats({ active: true, latency: 500 }) });
    expect(computeLatencyReadable(node).latencyClass).toBe('text-warning');
  });

  it('returns danger class for high latency (> 1000 ms)', () => {
    const node = makeNode({ stats: makeStats({ active: true, latency: 2000 }) });
    expect(computeLatencyReadable(node).latencyClass).toBe('text-danger');
  });
});

// ─── propagationHistoryColor ─────────────────────────────────────────────────

describe('propagationHistoryColor', () => {
  it('returns gray for -1 (no data)', () => {
    expect(propagationHistoryColor(-1)).toBe('#a1a7cc');
  });

  it('returns gray for 0', () => {
    expect(propagationHistoryColor(0)).toBe('#a1a7cc');
  });

  it('returns green for 1–1000 ms', () => {
    expect(propagationHistoryColor(1)).toBe('#29b348');
    expect(propagationHistoryColor(1000)).toBe('#29b348');
  });

  it('returns yellow for 1001–3000 ms', () => {
    expect(propagationHistoryColor(1001)).toBe('#f5b225');
    expect(propagationHistoryColor(3000)).toBe('#f5b225');
  });

  it('returns orange for 3001–7000 ms', () => {
    expect(propagationHistoryColor(3001)).toBe('#ffb86c');
    expect(propagationHistoryColor(7000)).toBe('#ffb86c');
  });

  it('returns red for > 7000 ms', () => {
    expect(propagationHistoryColor(7001)).toBe('#ec536c');
    expect(propagationHistoryColor(99999)).toBe('#ec536c');
  });
});

// ─── xssFilter ───────────────────────────────────────────────────────────────

describe('xssFilter', () => {
  it('strips <script> tags from strings', () => {
    expect(xssFilter('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('strips </script> variant', () => {
    expect(xssFilter('text</script>end')).toBe('textend');
  });

  it('strips case-insensitive script tags', () => {
    expect(xssFilter('<SCRIPT>bad</SCRIPT>')).toBe('bad');
  });

  it('removes the word "javascript"', () => {
    expect(xssFilter('javascript:alert(1)')).toBe(':alert(1)');
  });

  it('filters recursively in objects', () => {
    const input = { name: '<script>xss</script>', nested: { val: 'javascript:void(0)' } };
    const result = xssFilter(input) as typeof input;
    expect(result.name).toBe('xss');
    expect(result.nested.val).toBe(':void(0)');
  });

  it('filters recursively in arrays', () => {
    const result = xssFilter(['<script>a</script>', 'safe']) as string[];
    expect(result[0]).toBe('a');
    expect(result[1]).toBe('safe');
  });

  it('passes through numbers and booleans unchanged', () => {
    expect(xssFilter(42)).toBe(42);
    expect(xssFilter(true)).toBe(true);
    expect(xssFilter(null)).toBe(null);
  });
});

// ─── deepGet ─────────────────────────────────────────────────────────────────

describe('deepGet', () => {
  const obj = { a: { b: { c: 42 } }, x: 'hello' };

  it('gets top-level property', () => {
    expect(deepGet(obj as Record<string, unknown>, 'x')).toBe('hello');
  });

  it('gets nested property via dot path', () => {
    expect(deepGet(obj as Record<string, unknown>, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing path', () => {
    expect(deepGet(obj as Record<string, unknown>, 'a.z')).toBeUndefined();
  });
});

// ─── sortNodes ───────────────────────────────────────────────────────────────

describe('sortNodes', () => {
  const makeSimpleNode = (id: string, blockNum: number, pinned: boolean, active: boolean): Node =>
    makeNode({
      id,
      stats: makeStats({ active, block: { ...makeStats().block, number: blockNum } }),
      pinned,
    });

  it('sorts pinned nodes first with -pinned predicate', () => {
    const nodes = [
      makeSimpleNode('a', 100, false, true),
      makeSimpleNode('b', 100, true, true),
    ];
    const sorted = sortNodes(nodes, ['-pinned']);
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('a');
  });

  it('sorts active nodes before inactive with -stats.active', () => {
    const nodes = [
      makeSimpleNode('a', 100, false, false),
      makeSimpleNode('b', 100, false, true),
    ];
    const sorted = sortNodes(nodes, ['-stats.active']);
    expect(sorted[0].id).toBe('b');
  });

  it('sorts by block number descending with -stats.block.number', () => {
    const nodes = [
      makeSimpleNode('a', 50, false, true),
      makeSimpleNode('b', 200, false, true),
      makeSimpleNode('c', 100, false, true),
    ];
    const sorted = sortNodes(nodes, ['-stats.block.number']);
    expect(sorted.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('applies multiple predicates in priority order', () => {
    const nodes = [
      makeSimpleNode('inactive-high', 999, false, false),
      makeSimpleNode('active-low', 1, false, true),
      makeSimpleNode('pinned-inactive', 1, true, false),
    ];
    const sorted = sortNodes(nodes, ['-pinned', '-stats.active', '-stats.block.number']);
    expect(sorted[0].id).toBe('pinned-inactive');
    expect(sorted[1].id).toBe('active-low');
    expect(sorted[2].id).toBe('inactive-high');
  });

  it('returns same order for empty predicate list', () => {
    const nodes = [makeSimpleNode('a', 100, false, true), makeSimpleNode('b', 50, false, true)];
    const result = sortNodes(nodes, []);
    expect(result.map((n) => n.id)).toEqual(['a', 'b']);
  });
});

// ─── geoTooltipContent ───────────────────────────────────────────────────────

describe('geoTooltipContent', () => {
  it('includes node version', () => {
    const html = geoTooltipContent(makeNode());
    expect(html).toContain('XDCChain');
  });

  it('includes location when geo is present', () => {
    const html = geoTooltipContent(makeNode());
    expect(html).toContain('Singapore');
    expect(html).toContain('SG');
  });

  it('skips location when geo is null', () => {
    const html = geoTooltipContent(makeNode({ geo: null }));
    expect(html).not.toContain('Location');
  });

  it('includes network info', () => {
    const html = geoTooltipContent(makeNode());
    expect(html).toContain('Network');
    expect(html).toContain('50');
  });
});

// ─── bubbleColor ─────────────────────────────────────────────────────────────

describe('bubbleColor', () => {
  it('returns gray for offline node', () => {
    const node = makeNode({ stats: makeStats({ active: false }) });
    expect(bubbleColor(node, 100)).toBe('#a1a7cc');
  });

  it('returns green for active node with many peers', () => {
    const node = makeNode({ stats: makeStats({ active: true, peers: 10 }) });
    expect(bubbleColor(node, 100)).toBe('#29b348');
  });

  it('returns red for active node with 0 peers', () => {
    const node = makeNode({ stats: makeStats({ active: true, peers: 0 }) });
    expect(bubbleColor(node, 100)).toBe('#ec536c');
  });
});
