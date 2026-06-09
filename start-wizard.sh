#!/usr/bin/env bash
# Interactive startup wizard for XDCStats.
# Usage: ./start-wizard.sh [devnet|testnet|mainnet]

set -o pipefail

# ── colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── per-environment defaults ──────────────────────────────────────────────────
DEVNET_API_URL="http://154.38.175.218:32011"
TESTNET_API_URL="https://testnet-stats.xinfin.network"
MAINNET_API_URL="https://stats.xinfin.network"

# ── usage ─────────────────────────────────────────────────────────────────────
usage() {
    printf "\n${BOLD}Usage:${NC} %s [devnet|testnet|mainnet]\n\n" "$0"
    exit 1
}

# ── banner ────────────────────────────────────────────────────────────────────
clear
printf "\n"
printf "  ${BOLD}${BLUE}XDCStats — Startup Wizard${NC}\n"
printf "  %s\n" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── git update check ──────────────────────────────────────────────────────────
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree &>/dev/null; then
    printf "\n  Checking for remote updates…\n"
    if git -C "$REPO_ROOT" fetch --quiet 2>/dev/null; then
        BEHIND=$(git -C "$REPO_ROOT" rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
        if [ "$BEHIND" -gt 0 ] 2>/dev/null; then
            printf "  ${YELLOW}${BOLD}%s new commit(s) available from remote.${NC}\n" "$BEHIND"
            read -rp "  Pull latest changes? [Y/n]: " do_pull </dev/tty || do_pull="Y"
            do_pull="${do_pull:-Y}"
            if [ "$do_pull" != "N" ] && [ "$do_pull" != "n" ]; then
                printf "  Pulling latest changes…\n"
                if git -C "$REPO_ROOT" pull; then
                    printf "  ${GREEN}${BOLD}Updated successfully.${NC}\n"
                else
                    printf "  ${RED}git pull failed. Continuing without update.${NC}\n"
                fi
            else
                printf "  ${YELLOW}Skipping update.${NC}\n"
            fi
        else
            printf "  ${GREEN}Already up to date.${NC}\n"
        fi
    else
        printf "  ${DIM}Could not reach remote — skipping update check.${NC}\n"
    fi
fi

# ── environment selection ─────────────────────────────────────────────────────
ENV_NAME="${1:-}"

if [ -z "$ENV_NAME" ]; then
    printf "\n"
    printf "  Select an environment:\n"
    printf "    ${CYAN}1)${NC} devnet   — %s\n" "$DEVNET_API_URL"
    printf "    ${CYAN}2)${NC} testnet  — %s\n" "$TESTNET_API_URL"
    printf "    ${CYAN}3)${NC} mainnet  — %s\n" "$MAINNET_API_URL"
    printf "\n"
    read -rp "  Environment [devnet/testnet/mainnet]: " ENV_NAME </dev/tty || ENV_NAME=""
fi

ENV_NAME=$(printf '%s' "$ENV_NAME" | tr '[:upper:]' '[:lower:]')

case "$ENV_NAME" in
    devnet|1)
        ENV_NAME="devnet"
        VITE_API_URL="$DEVNET_API_URL"
        ;;
    testnet|2)
        ENV_NAME="testnet"
        VITE_API_URL="$TESTNET_API_URL"
        ;;
    mainnet|3)
        ENV_NAME="mainnet"
        VITE_API_URL="$MAINNET_API_URL"
        ;;
    *)
        printf "\n  ${RED}Error:${NC} unknown environment '%s'. Use devnet, testnet, or mainnet.\n\n" "$ENV_NAME" >&2
        usage
        ;;
esac

export VITE_API_URL

# ── preview ───────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}${BLUE}Configuration — %s${NC}\n" "$ENV_NAME"
printf "  %s\n" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

printf "\n  ${DIM}Frontend${NC}\n"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "VITE_API_URL"     "$VITE_API_URL"

printf "\n  ${DIM}Backend${NC}\n"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "PORT"             "${PORT:-2000}"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "WS_SECRET"        "${WS_SECRET:-xinfin_xdpos_hybrid_network_stats}"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "ADMIN_SECRET"     "${ADMIN_SECRET:-(empty — admin routes disabled)}"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "ENABLE_FORENSICS" "${ENABLE_FORENSICS:-false}"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "MONGODBURL"       "${MONGODBURL:-localhost:27017}"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "MASTERNODE_URL"   "${MASTERNODE_URL:-https://master.xinfin.network/api}"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "LOG_LEVEL"        "${LOG_LEVEL:-info}"

printf "\n  ${DIM}Override any value by exporting it before running this script.${NC}\n"
printf "\n"

read -rp "  Start XDCStats? [Y/n]: " confirm </dev/tty || confirm="Y"
confirm="${confirm:-Y}"

if [ "$confirm" != "Y" ] && [ "$confirm" != "y" ]; then
    printf "\n  ${YELLOW}Aborted.${NC}\n\n"
    exit 0
fi

# ── start ─────────────────────────────────────────────────────────────────────
printf "\n  Starting XDCStats (%s)…\n\n" "$ENV_NAME"

if docker compose -f "$REPO_ROOT/docker-compose.yml" up -d; then
    printf "\n"
    printf "  ${GREEN}${BOLD}Started!${NC}\n"
    printf "  ${CYAN}Frontend${NC} → http://localhost:32001\n"
    printf "  ${CYAN}Backend${NC}  → http://localhost:2000\n"
    printf "\n"
    printf "  ${DIM}Logs:  docker compose logs -f${NC}\n"
    printf "  ${DIM}Stop:  docker compose down${NC}\n"
    printf "\n"
else
    printf "\n  ${RED}Error:${NC} docker compose failed — see output above.\n\n" >&2
    exit 1
fi
