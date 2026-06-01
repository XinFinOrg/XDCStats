# XDCStats

Monorepo for XDC Network Statistics — a backend data collection service and a React dashboard for visualising live node activity on the XDC network.

## Repository Structure

```
XDCStats/
├── backend/    # Express/Node.js API, WebSocket server, forensics
└── frontend/   # React + TypeScript + Vite dashboard
```

## Quick Start

### Backend

```bash
cd backend
cp .env_sample .env   # fill in the required environment variables
npm install
npm run dev
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

Node.js / Express server that connects to XDC network nodes via WebSocket, aggregates statistics, and exposes a REST + WebSocket API.

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon + local MongoDB |
| `npm start` | Production server |
| `npm run start:docker` | Start via Docker Compose |
| `npm run start:pm2` | Start with PM2 |
| `npm run alert` | Start alert service with PM2 |

**Prerequisites:** Node 16, MongoDB (only required for Forensics).

### Docker

```bash
cd backend
npm run start:docker
```

The `docker-compose.yml` spins up both the app and a MongoDB instance.

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
