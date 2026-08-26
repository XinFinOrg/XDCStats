#!/usr/bin/env bash
# Interactive startup wizard for XDCStats.
# Usage: ./start-wizard.sh [devnet|testnet|mainnet]

set -o pipefail

# ── colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# ── per-environment defaults ──────────────────────────────────────────────────
DEVNET_API_URL="https://stats.devnet.xinfin.org/api"
TESTNET_API_URL="https://stats.apothem.network/api"
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
        ENV_API_URL="$DEVNET_API_URL"
        ;;
    testnet|2)
        ENV_NAME="testnet"
        ENV_API_URL="$TESTNET_API_URL"
        ;;
    mainnet|3)
        ENV_NAME="mainnet"
        ENV_API_URL="$MAINNET_API_URL"
        ;;
    *)
        printf "\n  ${RED}Error:${NC} unknown environment '%s'. Use devnet, testnet, or mainnet.\n\n" "$ENV_NAME" >&2
        usage
        ;;
esac

# ── .env variables (mirrors docker-compose.yml) ───────────────────────────────
VARS=(
    FRONTEND_PORT
    VITE_API_URL
    BACKEND_PORT
    WS_SECRET
    # ADMIN_SECRET    # not prompted — leave unset (admin routes disabled)
    # ENABLE_FORENSICS # not prompted — defaults to false
    # MONGODBURL      # not prompted — only relevant when ENABLE_FORENSICS=true
    # MASTERNODE_URL  # not prompted — only relevant when ENABLE_FORENSICS=true
    LOG_LEVEL
    ENABLE_BOOTNODE_HEALTH
    BOOTNODE_NETWORK
    BOOTNODE_CHECK_INTERVAL
    BOOTNODE_CHECK_TIMEOUT
    BOOTNODE_CHECK_PARALLEL
)

# Temp file stores collected key=value pairs; cleaned up on exit
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

# ── helpers ───────────────────────────────────────────────────────────────────

# Read a single key's value from a file
read_key() {
    grep -m1 "^${1}=" "$2" 2>/dev/null | cut -d'=' -f2- || true
}

# Built-in default for a variable. VITE_API_URL / BOOTNODE_NETWORK always
# follow the environment picked above, everything else has a fixed default.
default_of() {
    case "$1" in
        FRONTEND_PORT)           printf '32001' ;;
        VITE_API_URL)            printf '%s' "$ENV_API_URL" ;;
        BACKEND_PORT)            printf '2000' ;;
        WS_SECRET)               printf 'xinfin_xdpos_hybrid_network_stats' ;;
        ADMIN_SECRET)            printf '' ;;
        ENABLE_FORENSICS)        printf 'false' ;;
        MONGODBURL)              printf 'localhost:27017' ;;
        MASTERNODE_URL)          printf 'https://master.xinfin.network/api' ;;
        LOG_LEVEL)               printf 'warn' ;;
        ENABLE_BOOTNODE_HEALTH)  printf 'true' ;;
        BOOTNODE_NETWORK)        printf '%s' "$ENV_NAME" ;;
        BOOTNODE_CHECK_INTERVAL) printf '60' ;;
        BOOTNODE_CHECK_TIMEOUT)  printf '5' ;;
        BOOTNODE_CHECK_PARALLEL) printf '8' ;;
        *)                       printf '' ;;
    esac
}

# Effective current value: prefer a previously saved .env, fall back to the
# built-in default (which for VITE_API_URL / BOOTNODE_NETWORK derives from the
# environment chosen this run).
current_val() {
    if [ -f "$ENV_FILE" ]; then
        local v
        v=$(read_key "$1" "$ENV_FILE")
        if [ -n "$v" ]; then
            printf '%s' "$v"
            return
        fi
    fi
    default_of "$1"
}

# Retrieve a collected value from the temp file
collected_val() {
    read_key "$1" "$TMPFILE"
}

# One-line description for each known variable
desc_of() {
    case "$1" in
        FRONTEND_PORT)           printf 'Host port the frontend container listens on' ;;
        VITE_API_URL)            printf 'Backend API URL the frontend dashboard calls' ;;
        BACKEND_PORT)            printf 'Host port the backend container listens on' ;;
        WS_SECRET)               printf 'Shared secret nodes send on socket handshake. Pipe-separate multiple: a|b' ;;
        ADMIN_SECRET)            printf 'x-api-secret header for admin routes (empty disables them)' ;;
        ENABLE_FORENSICS)        printf 'Enable MongoDB forensics collection  [true|false]' ;;
        MONGODBURL)              printf 'MongoDB host:port — required when ENABLE_FORENSICS=true' ;;
        MASTERNODE_URL)          printf 'Masternode API base URL' ;;
        LOG_LEVEL)               printf 'Log verbosity  [debug|info|warn|error]' ;;
        ENABLE_BOOTNODE_HEALTH)  printf 'Enable bootnode UDP/TCP health probes  [true|false]' ;;
        BOOTNODE_NETWORK)        printf 'Network for bootnode probes  [devnet|testnet|mainnet]' ;;
        BOOTNODE_CHECK_INTERVAL) printf 'Seconds between automatic bootnode health checks' ;;
        BOOTNODE_CHECK_TIMEOUT)  printf 'Per-check timeout in seconds' ;;
        BOOTNODE_CHECK_PARALLEL) printf 'Parallel workers for bootnode probes' ;;
        *)                       printf '' ;;
    esac
}

# Validate a candidate value for a key. Prints an error message and returns 1
# on failure; prints nothing and returns 0 on success.
validate() {
    local key="$1" val="$2"
    case "$key" in
        FRONTEND_PORT|BACKEND_PORT)
            if ! [[ "$val" =~ ^[0-9]+$ ]] || [ "$val" -lt 1 ] || [ "$val" -gt 65535 ]; then
                printf "must be a number between 1 and 65535"
                return 1
            fi
            local other_key other_val
            if [ "$key" = "FRONTEND_PORT" ]; then other_key="BACKEND_PORT"; else other_key="FRONTEND_PORT"; fi
            other_val="$(collected_val "$other_key")"
            if [ -n "$other_val" ] && [ "$val" = "$other_val" ]; then
                printf "must differ from %s (%s)" "$other_key" "$other_val"
                return 1
            fi
            ;;
        ENABLE_FORENSICS|ENABLE_BOOTNODE_HEALTH)
            if [ "$val" != "true" ] && [ "$val" != "false" ]; then
                printf "must be 'true' or 'false'"
                return 1
            fi
            ;;
        BOOTNODE_CHECK_INTERVAL|BOOTNODE_CHECK_TIMEOUT|BOOTNODE_CHECK_PARALLEL)
            if ! [[ "$val" =~ ^[0-9]+$ ]] || [ "$val" -lt 1 ]; then
                printf "must be a positive integer"
                return 1
            fi
            ;;
    esac
    return 0
}

# Prompt for a single variable; writes KEY=value to TMPFILE once valid
ask() {
    local key="$1" current desc
    current="$(current_val "$key")"
    desc="$(desc_of "$key")"

    while true; do
        printf "\n"
        printf "  ${BOLD}${CYAN}%-24s${NC}" "$key"
        [ -n "$desc" ] && printf "  ${DIM}%s${NC}" "$desc"
        printf "\n"
        printf "  Keep [${GREEN}%s${NC}] or enter new value: " "${current:-<empty>}"

        local input chosen err
        read -r input </dev/tty || input=""
        chosen="${input:-$current}"

        if err="$(validate "$key" "$chosen")"; then
            printf '%s=%s\n' "$key" "$chosen" >> "$TMPFILE"
            break
        fi
        printf "  ${RED}Invalid:${NC} %s\n" "$err"
    done
}

# ── review / edit ─────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    printf "\n  ${GREEN}Found existing${NC} %s — values pre-loaded.\n" "$ENV_FILE"
else
    printf "\n  ${YELLOW}No .env found${NC} — built-in defaults will be used.\n"
fi

printf "\n"
read -rp "  Review and confirm each configuration value? [Y/n]: " do_review </dev/tty || do_review="Y"
do_review="${do_review:-Y}"

if [ "$do_review" != "Y" ] && [ "$do_review" != "y" ]; then
    printf "  ${YELLOW}Skipping review — using current/default values.${NC}\n"
    for key in "${VARS[@]}"; do
        printf '%s=%s\n' "$key" "$(current_val "$key")" >> "$TMPFILE"
    done
else
    printf "\n  Press ${BOLD}Enter${NC} to keep the shown value, or type a replacement.\n"

    printf "\n  ${DIM}Frontend${NC}\n"
    ask "FRONTEND_PORT"
    ask "VITE_API_URL"

    printf "\n  ${DIM}Backend${NC}\n"
    ask "BACKEND_PORT"
    ask "WS_SECRET"
    # ask "ADMIN_SECRET"     # not prompted — leave unset (admin routes disabled)
    # ask "ENABLE_FORENSICS" # not prompted — defaults to false
    # ask "MONGODBURL"       # not prompted — only relevant when ENABLE_FORENSICS=true
    # ask "MASTERNODE_URL"   # not prompted — only relevant when ENABLE_FORENSICS=true
    ask "LOG_LEVEL"
    ask "ENABLE_BOOTNODE_HEALTH"
    ask "BOOTNODE_NETWORK"
    ask "BOOTNODE_CHECK_INTERVAL"
    ask "BOOTNODE_CHECK_TIMEOUT"
    ask "BOOTNODE_CHECK_PARALLEL"
fi

# ── preview ───────────────────────────────────────────────────────────────────
printf "\n\n"
printf "  ${BOLD}${BLUE}Configuration — %s${NC}\n" "$ENV_NAME"
printf "  %s\n" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

printf "\n  ${DIM}Frontend${NC}\n"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "FRONTEND_PORT" "$(collected_val "FRONTEND_PORT")"
printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "VITE_API_URL"  "$(collected_val "VITE_API_URL")"

printf "\n  ${DIM}Backend${NC}\n"
# ADMIN_SECRET, ENABLE_FORENSICS, MONGODBURL, MASTERNODE_URL are not prompted — omitted from preview
for key in BACKEND_PORT WS_SECRET LOG_LEVEL \
           ENABLE_BOOTNODE_HEALTH BOOTNODE_NETWORK BOOTNODE_CHECK_INTERVAL BOOTNODE_CHECK_TIMEOUT BOOTNODE_CHECK_PARALLEL; do
    val="$(collected_val "$key")"
    printf "  ${CYAN}%-24s${NC}  ${GREEN}%s${NC}\n" "$key" "$val"
done

printf "\n"
read -rp "  Save to $ENV_FILE? [Y/n]: " save_confirm </dev/tty || save_confirm="Y"
save_confirm="${save_confirm:-Y}"

if [ "$save_confirm" != "Y" ] && [ "$save_confirm" != "y" ]; then
    printf "\n  ${YELLOW}Aborted.${NC} No changes written.\n\n"
    exit 0
fi

# ── write .env ────────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    printf "\n  Backed up existing .env → ${DIM}%s.bak${NC}\n" "$ENV_FILE"
fi

{
    printf 'ENV=%s\n' "$ENV_NAME"
    for key in "${VARS[@]}"; do
        printf '%s=%s\n' "$key" "$(collected_val "$key")"
    done
} > "$ENV_FILE"

printf "  ${GREEN}${BOLD}Saved!${NC} %s written — future runs (and plain 'docker compose up') will remember these values.\n" "$ENV_FILE"

# Export into this run's shell environment too, so docker compose picks them
# up immediately regardless of --project-directory resolution.
export ENV="$ENV_NAME"
for key in "${VARS[@]}"; do
    export "$key=$(collected_val "$key")"
done

# ── start ─────────────────────────────────────────────────────────────────────
printf "\n"
read -rp "  Start XDCStats? [Y/n]: " confirm </dev/tty || confirm="Y"
confirm="${confirm:-Y}"

if [ "$confirm" != "Y" ] && [ "$confirm" != "y" ]; then
    printf "\n  ${YELLOW}Aborted.${NC}\n\n"
    exit 0
fi

printf "\n  Pulling latest images…\n"
docker compose -f "$REPO_ROOT/docker-compose.yml" pull

printf "\n  Starting XDCStats (%s)…\n\n" "$ENV_NAME"

if docker compose -f "$REPO_ROOT/docker-compose.yml" up -d; then
    printf "\n"
    printf "  ${GREEN}${BOLD}Started!${NC}\n"
    printf "  ${CYAN}Frontend${NC} → http://localhost:%s\n" "$(collected_val "FRONTEND_PORT")"
    printf "  ${CYAN}Backend${NC}  → http://localhost:%s\n" "$(collected_val "BACKEND_PORT")"
    printf "\n"
    printf "  ${DIM}Logs:  docker compose logs -f${NC}\n"
    printf "  ${DIM}Stop:  docker compose down${NC}\n"
    printf "\n"
else
    printf "\n  ${RED}Error:${NC} docker compose failed — see output above.\n\n" >&2
    exit 1
fi
