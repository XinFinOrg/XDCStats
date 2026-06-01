FRONTEND_DIR       := frontend
BACKEND_DIR        := backend
FRONTEND_CONTAINER := xdcstats-frontend-dev
BACKEND_PORT       := 2000
FRONTEND_PORT      := 32001

BACKEND_IMAGE   := xinfinorg/xdcstats-backend
FRONTEND_IMAGE  := xinfinorg/xdcstats-frontend
TAG             ?= $(shell git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)
PLATFORM        ?=
_PLATFORM_FLAG   = $(if $(PLATFORM),--platform $(PLATFORM),)

.PHONY: install install-backend install-frontend \
        build build-frontend \
        dev-backend dev-frontend \
        frontend-run frontend-stop frontend-logs \
        start stop \
        docker-up docker-down \
        docker-build docker-build-backend docker-build-frontend \
        docker-build-amd64 \
        docker-push docker-push-backend docker-push-frontend \
        docker-release docker-release-amd64 \
        test lint clean help

## ── Dependencies ──────────────────────────────────────────────────────────────

install: install-backend install-frontend

install-backend:
	cd $(BACKEND_DIR) && go mod download

install-frontend:
	cd $(FRONTEND_DIR) && npm install

## ── Build ─────────────────────────────────────────────────────────────────────

build: build-backend build-frontend

build-backend:
	cd $(BACKEND_DIR) && CGO_ENABLED=0 go build -o xdcstats-backend .

build-frontend: install-frontend
	cd $(FRONTEND_DIR) && npm run build

## ── Development ───────────────────────────────────────────────────────────────

dev-backend:
	cd $(BACKEND_DIR) && go run .

dev-frontend:
	cd $(FRONTEND_DIR) && npm run dev

## ── Frontend dev container (npm run dev, reads .env) ─────────────────────────

frontend-run: docker-build-frontend frontend-stop
	docker run -d \
		--name $(FRONTEND_CONTAINER) \
		--restart unless-stopped \
		-p $(FRONTEND_PORT):32001 \
		-v $(PWD)/$(FRONTEND_DIR)/config:/app/config:ro \
		$(FRONTEND_IMAGE):$(TAG)
	@echo "Frontend → http://localhost:$(FRONTEND_PORT)"
	@echo "Backend  → http://localhost:$(BACKEND_PORT) (start separately with: make dev-backend)"

frontend-stop:
	@docker stop $(FRONTEND_CONTAINER) 2>/dev/null || true
	@docker rm   $(FRONTEND_CONTAINER) 2>/dev/null || true

frontend-logs:
	docker logs -f $(FRONTEND_CONTAINER)

## ── Full stack (frontend dev container + backend docker-compose with MongoDB) ──

start:
	$(MAKE) docker-up
	$(MAKE) frontend-run

stop: frontend-stop docker-down

## ── Backend via Docker Compose (includes MongoDB) ─────────────────────────────

docker-up:
	cd $(BACKEND_DIR) && docker-compose up -d

docker-down:
	cd $(BACKEND_DIR) && docker-compose down

## ── Docker build & publish ────────────────────────────────────────────────────

docker-build: docker-build-backend docker-build-frontend

docker-build-backend:
	docker build $(_PLATFORM_FLAG) -t $(BACKEND_IMAGE):$(TAG) $(BACKEND_DIR)/
	@echo "Built $(BACKEND_IMAGE):$(TAG)"

docker-build-frontend:
	docker build $(_PLATFORM_FLAG) \
		-t $(FRONTEND_IMAGE):$(TAG) \
		$(FRONTEND_DIR)/
	@echo "Built $(FRONTEND_IMAGE):$(TAG)"

# Convenience target — build both images for linux/amd64 on any host (including Apple Silicon)
docker-build-amd64:
	$(MAKE) docker-build PLATFORM=linux/amd64

docker-push: docker-push-backend docker-push-frontend

docker-push-backend:
	docker push $(BACKEND_IMAGE):$(TAG)

docker-push-frontend:
	docker push $(FRONTEND_IMAGE):$(TAG)

# Build and push in one step: make docker-release TAG=v1.2.0
docker-release: docker-build docker-push

# Build amd64 images and push: make docker-release-amd64 TAG=v1.2.0
docker-release-amd64:
	$(MAKE) docker-build-amd64 TAG=$(TAG)
	$(MAKE) docker-push        TAG=$(TAG)

## ── Quality ───────────────────────────────────────────────────────────────────

test:
	cd $(FRONTEND_DIR) && npm test

lint:
	cd $(FRONTEND_DIR) && npm run lint

## ── Clean ─────────────────────────────────────────────────────────────────────

clean: frontend-stop
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -f  $(BACKEND_DIR)/xdcstats-backend

## ── Help ──────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "XDCStats — monorepo build targets"
	@echo ""
	@echo "  Setup"
	@echo "    install            Download deps for both backend and frontend"
	@echo "    install-backend    go mod download for backend"
	@echo "    install-frontend   npm install for frontend"
	@echo ""
	@echo "  Development"
	@echo "    dev-backend        Run Go backend (port $(BACKEND_PORT))"
	@echo "    dev-frontend       Start Vite dev server   (port $(FRONTEND_PORT))"
	@echo ""
	@echo "  Frontend dev container (reads .env, npm run dev)"
	@echo "    frontend-run       Build image + run dev container on port $(FRONTEND_PORT)"
	@echo "    frontend-stop      Stop frontend dev container"
	@echo "    frontend-logs      Follow frontend container logs"
	@echo ""
	@echo "  Full stack"
	@echo "    start              docker-up (MongoDB) + frontend-run"
	@echo "    stop               frontend-stop + docker-down"
	@echo ""
	@echo "  Backend docker-compose (includes MongoDB)"
	@echo "    docker-up          Start backend + MongoDB"
	@echo "    docker-down        Stop backend docker-compose"
	@echo ""
	@echo "  Docker images  (TAG defaults to git tag or short commit)"
	@echo "    docker-build           Build both images (native arch)"
	@echo "    docker-build-amd64     Build both images for linux/amd64 (works on Apple Silicon)"
	@echo "    docker-build-backend   Build $(BACKEND_IMAGE):\$$TAG"
	@echo "    docker-build-frontend  Build $(FRONTEND_IMAGE):\$$TAG"
	@echo "    docker-push            Push both images"
	@echo "    docker-push-backend    Push backend image"
	@echo "    docker-push-frontend   Push frontend image"
	@echo "    docker-release         Build + push          (make docker-release TAG=v1.2.0)"
	@echo "    docker-release-amd64   Build amd64 + push    (make docker-release-amd64 TAG=v1.2.0)"
	@echo ""
	@echo "  Tip: pass PLATFORM= to any docker-build target, e.g."
	@echo "    make docker-build-backend PLATFORM=linux/amd64"
	@echo ""
	@echo "  Quality"
	@echo "    test               Run frontend Vitest suite"
	@echo "    lint               Run ESLint on frontend"
	@echo ""
	@echo "    clean              Remove dist, node_modules, stop frontend container"
	@echo ""
