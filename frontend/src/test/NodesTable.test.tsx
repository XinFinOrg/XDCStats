import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodesTable from '../components/NodesTable';
import type { Node, NodeStats } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeStats = (overrides: Partial<NodeStats> = {}): NodeStats => ({
  active: true,
  mining: false,
  hashrate: 0,
  peers: 5,
  gasPrice: '1000000000',
  uptime: 99,
  pending: 3,
  latency: 50,
  propagationAvg: 200,
  block: {
    number: 100,
    hash: '0x' + 'a'.repeat(64),
    arrived: Date.now() - 5000,
    received: Date.now() - 5000,
    propagation: 250,
    gasLimit: 21_000_000,
    transactions: 0,
    uncles: 0,
    miner: '0x0',
    difficulty: '100000',
  },
  ...overrides,
});

const makeNode = (id: string, overrides: Partial<Node> = {}): Node => ({
  id,
  info: {
    name: `Node-${id}`,
    node: `XDCChain/v1.8.0/linux/go1.16`,
    coinbase: '0x0',
    net: '50',
    protocol: 'eth/63',
    port: 30303,
    api: 'No',
    client: '0.1.1',
    os: 'linux',
    os_v: 'amd64',
    contact: '',
  },
  stats: makeStats(),
  history: Array(40).fill(-1),
  geo: null,
  pinned: false,
  readable: { latencyClass: 'text-success', latency: '50 ms' },
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NodesTable', () => {
  it('renders empty state when no nodes provided', () => {
    render(<NodesTable nodes={[]} bestBlock={0} onPin={vi.fn()} />);
    expect(screen.getByText(/waiting for nodes/i)).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<NodesTable nodes={[]} bestBlock={0} onPin={vi.fn()} />);
    expect(screen.getByText('Node Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('Peers')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Last Block')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
  });

  it('renders node names', () => {
    const nodes = [makeNode('1'), makeNode('2')];
    render(<NodesTable nodes={nodes} bestBlock={100} onPin={vi.fn()} />);
    expect(screen.getByText('Node-1')).toBeInTheDocument();
    expect(screen.getByText('Node-2')).toBeInTheDocument();
  });

  it('renders latency for active node', () => {
    const node = makeNode('1', {
      stats: makeStats({ active: true, latency: 50 }),
      readable: { latencyClass: 'text-success', latency: '50 ms' },
    });
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    expect(screen.getByText('50 ms')).toBeInTheDocument();
  });

  it('renders "offline" for inactive node (latency cell)', () => {
    const node = makeNode('1', {
      stats: makeStats({ active: false }),
      readable: { latencyClass: 'text-danger', latency: 'offline' },
    });
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    // Inactive nodes show "offline" in the latency column AND in the last-block time column.
    const offlineEls = screen.getAllByText('offline');
    expect(offlineEls.length).toBeGreaterThanOrEqual(1);
    // The latency cell should be one of them with the danger class
    const latencyCell = offlineEls.find((el) => el.closest('td')?.classList.contains('text-danger'));
    expect(latencyCell).toBeInTheDocument();
  });

  it('renders block number with # prefix', () => {
    const node = makeNode('1', {
      stats: makeStats({ block: { ...makeStats().block, number: 42000 } }),
    });
    render(<NodesTable nodes={[node]} bestBlock={42000} onPin={vi.fn()} />);
    expect(screen.getByText('#42000')).toBeInTheDocument();
  });

  it('renders peer count', () => {
    const node = makeNode('1', { stats: makeStats({ peers: 7 }) });
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders pending transaction count', () => {
    const node = makeNode('1', { stats: makeStats({ pending: 12 }) });
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders uptime percentage', () => {
    const node = makeNode('1', { stats: makeStats({ uptime: 95.6 }) });
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    expect(screen.getByText('96%')).toBeInTheDocument();
  });

  it('calls onPin with correct id when pin button clicked', async () => {
    const onPin = vi.fn();
    const node = makeNode('abc');
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={onPin} />);
    const pinButton = screen.getByTitle('Pin node');
    await userEvent.click(pinButton);
    expect(onPin).toHaveBeenCalledWith('abc');
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it('shows pinned icon for pinned node', () => {
    const node = makeNode('1', { pinned: true });
    const unpinnedNode = makeNode('2', { pinned: false });
    render(<NodesTable nodes={[node, unpinnedNode]} bestBlock={100} onPin={vi.fn()} />);
    // Pinned node shows 📌, unpinned shows 📍
    expect(screen.getByTitle('Unpin node')).toHaveTextContent('📌');
    expect(screen.getByTitle('Pin node')).toHaveTextContent('📍');
  });

  it('sorts by block number when header clicked', async () => {
    const nodes = [
      makeNode('low', { stats: makeStats({ block: { ...makeStats().block, number: 10 } }) }),
      makeNode('high', { stats: makeStats({ block: { ...makeStats().block, number: 99 } }) }),
    ];
    render(<NodesTable nodes={nodes} bestBlock={99} onPin={vi.fn()} />);
    const lastBlockHeader = screen.getByText('Last Block');
    await userEvent.click(lastBlockHeader);
    const rows = screen.getAllByRole('row');
    // Skip header row; first data row should be high-block node after sort
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText('#99')).toBeInTheDocument();
  });

  it('renders node version string', () => {
    const node = makeNode('1');
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    // nodeVersionFilter should produce XDCChain/v1.8.0/linux
    expect(screen.getByText(/XDCChain/)).toBeInTheDocument();
  });

  it('renders geo city when available', () => {
    const node = makeNode('1', {
      geo: { ll: [1.3, 103.8], city: 'Singapore', country: 'SG' },
    });
    render(<NodesTable nodes={[node]} bestBlock={100} onPin={vi.fn()} />);
    expect(screen.getByText(/Singapore/)).toBeInTheDocument();
  });
});
