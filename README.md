# XDCStats

Monorepo for XDC Network Statistics — a backend data collection service and a React dashboard for visualising live node activity on the XDC network.

## Repository Structure

```
XDCStats/
├── backend/    # Go/Gin REST API, WebSocket server, optional forensics
└── frontend/   # React + TypeScript + Vite dashboard
```

## Quick Start

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
