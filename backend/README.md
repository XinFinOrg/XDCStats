# XDCStats Backend

Go / Gin service that collects real-time statistics from XDC network nodes via WebSocket and exposes a REST API and live push channels to dashboard clients.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Running](#running)
- [REST API](#rest-api)
- [WebSocket Channels](#websocket-channels)
- [Forensics](#forensics)

---

## Prerequisites

- Go 1.23+
- MongoDB (only required when `ENABLE_FORENSICS=true`)

---

## Environment Variables

Copy `.env_sample` to `.env` and fill in the values.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `2000` | HTTP server port |
| `WS_SECRET` | `xinfin_xdpos_hybrid_network_stats` | Shared secret nodes must send on the `/api` socket handshake. Pipe-separate multiple values: `secret1\|secret2` |
| `ADMIN_SECRET` | _(empty — disables admin routes)_ | Secret for `x-api-secret` header on admin endpoints |
| `ENABLE_FORENSICS` | `false` | Set to `true` to enable MongoDB forensics collection |
| `MONGODBURL` | `localhost:27017` | MongoDB host:port |
| `MASTERNODE_URL` | `https://master.xinfin.network/api` | Masternode API base URL |
| `VERBOSITY` | `1` | Log verbosity level |

---

## Running

### Local development

```bash
go mod download
cp .env_sample .env   # edit as needed
go run .
```

Server listens on http://localhost:2000.

### Docker Compose (includes MongoDB)

```bash
# from repo root
make docker-up
```

### Build binary

```bash
go build -o xdcstats-backend .
./xdcstats-backend
```

### Docker image

```bash
# from repo root
make docker-build-backend
docker run -d -p 2000:2000 --env-file backend/.env xinfinorg/xdcstats-backend:<tag>
```

---

## REST API

Base URL: `http://localhost:2000`  
All endpoints are prefixed with `/v2`.

### Quick reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v2/health` | — | Liveness check |
| GET | `/v2/snapshot` | — | Node list + chart data snapshot |
| GET | `/v2/nodes_info` | `x-api-secret` | Basic info for all connected nodes |
| GET | `/v2/nodes_info_verbose` | `x-api-secret` | Full node objects for all connected nodes |
| GET | `/v2/coinbase_info` | `x-api-secret` | Coinbase addresses for all connected nodes |
| GET | `/v2/forensics/masternode` | — | Masternode details by address |
| GET | `/v2/forensics/batch/load` | — | Forensics event summaries (date range) |
| GET | `/v2/forensics/load/detail` | — | Single forensics report detail |
| GET | `/v2/forensics/load/latest` | — | Latest forensics reports since a given ID |

> **Admin auth:** pass `x-api-secret: <ADMIN_SECRET>` header. If `ADMIN_SECRET` is empty the route returns 401 for all requests.

---

### GET /v2/health

Liveness probe — returns `200 OK` with body `OK`.

---

### GET /v2/snapshot

Public endpoint. Returns a point-in-time snapshot of all known nodes and chart data.

**Response `200`**

```json
{
  "nodes":  [ /* Node objects — see Node schema below */ ],
  "charts": { /* ChartsData object */ }
}
```

---

### GET /v2/nodes_info

Requires `x-api-secret` header. Returns condensed info for every connected node.

**Response `200`**

```json
{
  "count": 42,
  "nodes": [
    {
      "info": {
        "name":     "node-1",
        "node":     "Geth/v1.x.x",
        "coinbase": "0xabc...",
        "ip":       "1.2.3.4"
      },
      "stats": {
        "active":  true,
        "mining":  true,
        "peers":   12,
        "pending": 0
      }
    }
  ]
}
```

**Errors**

| Status | Reason |
|--------|--------|
| 401 | Missing or invalid `x-api-secret` |
| 500 | Internal error |

---

### GET /v2/nodes_info_verbose

Requires `x-api-secret` header. Returns complete raw node objects.

**Response `200`**

```json
{
  "success": true,
  "count":   42,
  "nodes":   [ /* full Node objects */ ]
}
```

---

### GET /v2/coinbase_info

Requires `x-api-secret` header. Returns only node names and coinbase addresses.

**Response `200`**

```json
{
  "count": 42,
  "nodes": [
    { "name": "node-1", "coinbase": "0xabc..." }
  ]
}
```

---

### GET /v2/forensics/masternode

Requires `ENABLE_FORENSICS=true`.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Masternode wallet address |

**Response `200`** — masternode detail object from the masternode API.

---

### GET /v2/forensics/batch/load

Requires `ENABLE_FORENSICS=true`. Returns summarised forensics events.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `range` | string | No | `"all"` for all-time, or a number of days (default: `7`) |

**Response `200`** — array of forensics event summary objects.

---

### GET /v2/forensics/load/detail

Requires `ENABLE_FORENSICS=true`.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | MongoDB ObjectId of the forensics report |

**Response `200`** — full forensics report object.

---

### GET /v2/forensics/load/latest

Requires `ENABLE_FORENSICS=true`. Returns new forensics reports since a cursor ID.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No | Last known report ObjectId; omit to get all |

**Response `200`**

```json
{
  "forensics": [ /* new report summaries, empty array if none */ ],
  "latestBlockInfo": {
    "blockNumber": "12345678",
    "blockHash":   "0xabc..."
  },
  "highestCommittedBlockInfo": {
    "blockNumber": "12345677",
    "blockHash":   "0xdef..."
  }
}
```

---

## WebSocket Channels

The server exposes three WebSocket endpoints (using [gorilla/websocket](https://github.com/gorilla/websocket)).

### /api — Node reporting socket

XDC nodes connect here to report their stats. Requires a `WS_SECRET` handshake.

#### Events the server receives

| Event | Required fields | Description |
|-------|----------------|-------------|
| `hello` | `id`, `info`, `secret` | Initial handshake. Connection is closed if `secret` is not in `WS_SECRET`. |
| `update` | `id`, `stats` | Node pushed a stats update. |
| `block` | `id`, `block`, `latestCommittedBlockInfo?` | New block mined/received. |
| `pending` | `id`, `stats.pending` | Pending transaction count changed. |
| `stats` | `id`, `stats` | General stats update. |
| `history` | `id`, `history` | Historical data batch. |
| `node-ping` | `id`, `clientTime?` | Latency probe from node. |
| `latency` | `id`, `latency` | Latency measurement submission. |
| `end` | — | Node is disconnecting. |
| `forensics` | `forensicsProof` | Forensics report submission (`ENABLE_FORENSICS=true` only). |

#### Events the server emits to nodes

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | — | Sent after successful `hello` handshake. |
| `node-pong` | `{ clientTime, serverTime }` | Response to `node-ping`. |
| `history` | `{ min, max }` | Server requests a history range from the node. |

---

### /primus — Dashboard client socket

Frontend clients connect here to receive live updates. No authentication required.

#### Events the server emits to clients

| Action | Description |
|--------|-------------|
| `init` | Full node list (sent on connection and every hour). |
| `add` | A new node connected. |
| `update` | Node stats changed. |
| `block` | New block received. |
| `pending` | Pending tx count changed. |
| `stats` | General stats changed. |
| `charts` | Chart data updated. |
| `inactive` | A node went offline. |
| `client-ping` | Latency probe (every 5 s), payload: `{ serverTime }`. |

#### Events the server receives from clients

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | — | Client requests initial state; server replies with `init`. |
| `client-pong` | `{ serverTime }` | Response to `client-ping`; server emits `client-latency`. |

#### Events the server emits back to the sending client

| Event | Payload | Description |
|-------|---------|-------------|
| `client-latency` | `{ latency }` | Calculated round-trip latency in ms. |

---

### /external — External integrations socket

Same broadcast surface as `/primus`. Intended for third-party consumers of live node data.

---

## Forensics

Forensics mode records double-signing and consensus fault evidence to MongoDB.

1. Set `ENABLE_FORENSICS=true` in `.env`.
2. Set `MONGODBURL` to a running MongoDB instance (default: `localhost:27017`).
3. Start the server — it will connect to the `forensics` database automatically.

The `/v2/forensics/*` REST endpoints and the `forensics` WebSocket event on `/api` are only active when forensics is enabled.
