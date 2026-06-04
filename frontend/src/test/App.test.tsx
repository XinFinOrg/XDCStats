// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import App from '../App';
import type { Node, ChartsData } from '../types';

// ─── Mock usePolling ──────────────────────────────────────────────────────────

type OnSnapshotFn = (nodes: Node[], charts: ChartsData) => void;

let capturedOnSnapshot: OnSnapshotFn | null = null;

vi.mock('../hooks/usePolling', () => ({
  usePolling: ({ onSnapshot }: { onSnapshot: OnSnapshotFn }) => {
    capturedOnSnapshot = onSnapshot;
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const emptyCharts: ChartsData = {
  avgBlocktime: 0,
  avgTransactionRate: 0,
  avgHashrate: 0,
  gasLimit: [],
  blocktime: [],
  difficulty: [],
  propagation: { histogram: [], avg: 0 },
  uncleCount: [],
  transactions: [],
  gasSpending: [],
  miners: [],
};

const makeNodeData = (id: string, blockNumber = 100, overrides: Partial<Node['stats']> = {}): Node => ({
  id,
  info: {
    name: `Node-${id}`,
    node: 'XDCChain/v1.8.0/linux/go1.16',
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
  stats: {
    active: true,
    mining: false,
    hashrate: 0,
    peers: 5,
    gasPrice: '1000000000',
    uptime: 95,
    pending: 0,
    latency: 50,
    propagationAvg: 200,
    block: {
      number: blockNumber,
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
  },
  history: Array(40).fill(-1),
  geo: null,
  pinned: false,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBestBlockText(): string {
  const spans = document.querySelectorAll('.big-details');
  return (spans[0] as HTMLElement)?.textContent ?? '';
}

function getHeaderNodeCount(): string {
  const header = document.querySelector('header');
  return header?.textContent ?? '';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App', () => {
  beforeEach(() => {
    capturedOnSnapshot = null;
    try { localStorage.clear(); } catch { /* not available in all environments */ }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Network Monitor')).toBeInTheDocument();
  });

  it('shows "Waiting for nodes" before any data', () => {
    render(<App />);
    expect(screen.getByText(/waiting for nodes/i)).toBeInTheDocument();
  });

  it('displays #0 as best block before data arrives', () => {
    render(<App />);
    expect(getBestBlockText()).toBe('#0');
  });

  it('updates node count display after snapshot', async () => {
    render(<App />);
    const nodes = [makeNodeData('1'), makeNodeData('2'), makeNodeData('3')];
    act(() => { capturedOnSnapshot?.(nodes, emptyCharts); });

    await waitFor(() => {
      expect(getHeaderNodeCount()).toContain('3');
    });
  });

  it('updates best block after snapshot', async () => {
    render(<App />);
    act(() => { capturedOnSnapshot?.([makeNodeData('1', 500), makeNodeData('2', 450)], emptyCharts); });

    await waitFor(() => {
      expect(getBestBlockText()).toBe('#500');
    });
  });

  it('renders node names in the table after snapshot', async () => {
    render(<App />);
    act(() => { capturedOnSnapshot?.([makeNodeData('alpha')], emptyCharts); });

    await waitFor(() => {
      expect(screen.getByText('Node-alpha')).toBeInTheDocument();
    });
  });

  it('marks node as offline when snapshot shows inactive', async () => {
    render(<App />);
    const inactiveNode = makeNodeData('1', 100, { active: false });
    act(() => { capturedOnSnapshot?.([inactiveNode], emptyCharts); });

    await waitFor(() => {
      expect(getHeaderNodeCount()).toContain('0');
    });
  });

  it('displays updated latency from snapshot', async () => {
    render(<App />);
    act(() => { capturedOnSnapshot?.([makeNodeData('1', 100, { latency: 999 })], emptyCharts); });

    await waitFor(() => {
      expect(screen.getByText('999 ms')).toBeInTheDocument();
    });
  });

  it('displays pending count from snapshot', async () => {
    render(<App />);
    act(() => { capturedOnSnapshot?.([makeNodeData('1', 100, { pending: 42 })], emptyCharts); });

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('renders block propagation section without crashing', () => {
    render(<App />);
    const charts: ChartsData = {
      ...emptyCharts,
      propagation: {
        histogram: [
          { x: 0, dx: 500, y: 0.3, frequency: 30, cumpercent: 0.3 },
          { x: 500, dx: 500, y: 0.5, frequency: 50, cumpercent: 0.8 },
        ],
        avg: 400,
      },
    };
    expect(() => {
      act(() => { capturedOnSnapshot?.([], charts); });
    }).not.toThrow();
    expect(screen.getByText(/block propagation/i)).toBeInTheDocument();
  });

  it('updates avg block time from charts in snapshot', async () => {
    render(<App />);
    const charts: ChartsData = {
      avgBlocktime: 4.5,
      avgTransactionRate: 10,
      avgHashrate: 0,
      gasLimit: Array(40).fill(21_000_000),
      blocktime: Array(40).fill(4.5),
      difficulty: Array(40).fill(100000),
      propagation: { histogram: [], avg: 300 },
      uncleCount: Array(40).fill(0),
      transactions: Array(40).fill(10),
      gasSpending: Array(40).fill(1000),
      miners: [],
    };
    act(() => { capturedOnSnapshot?.([], charts); });

    await waitFor(() => {
      // Appears in the stat card AND the sparkline latest-value label
      expect(screen.getAllByText('4.50 s').length).toBeGreaterThan(0);
    });
  });

  it('strips XSS payloads from incoming node data', async () => {
    render(<App />);
    const xssNode: Node = {
      ...makeNodeData('1'),
      info: { ...makeNodeData('1').info, name: '<script>alert(1)</script>SafeName' },
    };
    act(() => { capturedOnSnapshot?.([xssNode], emptyCharts); });

    await waitFor(() => {
      // xssFilter strips <script> and </script> tags, leaving the rest of the string
      expect(screen.queryByText(/<script>/)).not.toBeInTheDocument();
      expect(screen.getByText(/SafeName/)).toBeInTheDocument();
    });
  });

  it('shows additional node when second snapshot has more nodes', async () => {
    render(<App />);
    act(() => { capturedOnSnapshot?.([makeNodeData('1')], emptyCharts); });
    act(() => { capturedOnSnapshot?.([makeNodeData('1'), makeNodeData('2')], emptyCharts); });

    await waitFor(() => {
      expect(getHeaderNodeCount()).toMatch(/2/);
    });
  });

  it('updates best block when second snapshot has higher block number', async () => {
    render(<App />);
    act(() => { capturedOnSnapshot?.([makeNodeData('1', 100)], emptyCharts); });
    act(() => { capturedOnSnapshot?.([makeNodeData('1', 200)], emptyCharts); });

    await waitFor(() => {
      expect(getBestBlockText()).toBe('#200');
    });
  });
});
