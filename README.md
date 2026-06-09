# XDCStats

Monorepo for XDC Network Statistics — a backend data collection service and a React dashboard for visualising live node activity on the XDC network.

## Repository Structure

```
XDCStats/
├── backend/    # Go/Gin REST API, WebSocket server, optional forensics
└── frontend/   # React + TypeScript + Vite dashboard
```

## Quick Start

### Docker (recommended)

The easiest way to run the full stack is with the start wizard:

```bash
./start-wizard.sh [devnet|testnet|mainnet]
```

If no environment is given the wizard prompts you to choose:

```
  Select an environment:
    1) devnet   — http://154.38.175.218:32011
    2) testnet  — https://testnet-stats.xinfin.network
    3) mainnet  — https://stats.xinfin.network

  Environment [devnet/testnet/mainnet]:
```

It then shows every env var and its default value before asking for confirmation, and starts both containers via `docker compose up -d`.

```bash
# Stop
docker compose down

# Follow logs
docker compose logs -f
```

Override any backend variable by exporting it before running:

```bash
WS_SECRET=mysecret ./start-wizard.sh mainnet
```

**Prerequisites:** Docker with Compose v2 (`docker compose`).

---

### Backend

```bash
cd backend
cp .env_sample .env   # fill in the required environment variables
go mod download
go run .
```

Runs on **http://localhost:2000**. See [backend/README.md](backend/README.md) for full environment variable reference and MongoDB/Forensics setup.

### Frontend

```bash
cd frontend
cp .env.example .env  # set VITE_API_URL to your backend address
npm install
npm run dev
```

Runs on **http://localhost:32001**.

## Backend

Go / Gin server that connects to XDC network nodes via WebSocket, aggregates statistics, and exposes a REST + WebSocket API.

| Command | Description |
|---------|-------------|
| `go run .` | Run backend locally |
| `go build -o xdcstats-backend .` | Build binary |
| `make dev-backend` | Run via Makefile shorthand |
| `make docker-up` | Start backend + MongoDB via Docker Compose |

**Prerequisites:** Go 1.23+, MongoDB (only required when `ENABLE_FORENSICS=true`).

### Docker

```bash
make docker-up
```

The `backend/docker-compose.yml` spins up both the app and a MongoDB instance.

### Forensics

Set `ENABLE_FORENSICS=true` in `backend/.env` and point `MONGODBURL` at a running MongoDB instance before starting.

## Frontend

React 18 + TypeScript dashboard built with Vite, styled with Tailwind CSS, and visualised with D3 and Recharts.

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run test` | Run Vitest test suite |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint |

**Environment variable:**

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend base URL | `https://stats1.xinfin.network` |

## License

LGPL-3.0 — see [LICENSE](LICENSE).
