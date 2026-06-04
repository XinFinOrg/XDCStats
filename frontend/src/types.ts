export interface NodeInfo {
  name: string;
  node: string; // client type string e.g. "XDCChain/v1.0/linux/go1.16"
  coinbase: string;
  net: string;
  protocol: string;
  port: number;
  api: string;
  client: string;
  os: string;
  os_v: string;
  contact: string;
}

export interface NodeBlock {
  number: number;
  hash: string;
  arrived: number; // timestamp ms
  received: number;
  propagation: number;
  gasLimit: number;
  transactions: number;
  uncles: number;
  miner: string;
  difficulty: string;
}

export interface NodeStats {
  active: boolean;
  mining: boolean;
  hashrate: number;
  peers: number;
  gasPrice: string; // big number string
  uptime: number;
  pending: number;
  latency: number;
  propagationAvg: number;
  block: NodeBlock;
}

export interface NodeGeo {
  ll: [number, number]; // [lat, lng]
  city: string;
  country: string;
}

export interface NodeReadable {
  latencyClass: string;
  latency: string;
}

export interface Node {
  id: string;
  info: NodeInfo;
  stats: NodeStats;
  history: number[]; // propagation times, -1 for missing
  geo: NodeGeo | null;
  pinned: boolean;
  readable?: NodeReadable;
}

export interface PropagationBin {
  x: number;
  dx: number;
  y: number;
  frequency: number;
  cumpercent: number;
}

export interface ChartsData {
  avgBlocktime: number;
  avgTransactionRate: number;
  avgHashrate: number;
  gasLimit: number[];
  blocktime: number[];
  difficulty: number[];
  propagation: {
    histogram: PropagationBin[];
    avg: number;
  };
  uncleCount: number[];
  transactions: number[];
  gasSpending: number[];
  miners: MinerEntry[];
}

export interface MinerEntry {
  miner: string;
  name: string | false;
  blocks: number;
}

export interface MapNode {
  radius: number;
  latitude: number;
  longitude: number;
  nodeName?: string;
  fillKey?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}
