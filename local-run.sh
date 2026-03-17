#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SQLITE_DB_PATH:-$ROOT_DIR/prepship.db}"
SECRETS_PATH="${PREPSHIP_SECRETS_PATH:-$ROOT_DIR/secrets.json}"
API_PORT="${API_PORT:-4010}"
WEB_PORT="${WEB_PORT:-4011}"
REACT_PORT="${REACT_PORT:-4012}"
REACT_ENABLED="${REACT_ENABLED:-true}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${API_PORT}}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Missing SQLite database: $DB_PATH" >&2
  exit 1
fi

if [[ ! -f "$SECRETS_PATH" ]]; then
  echo "Missing secrets file: $SECRETS_PATH" >&2
  exit 1
fi

export DB_PROVIDER="${DB_PROVIDER:-sqlite}"
export SQLITE_DB_PATH="$DB_PATH"
export PREPSHIP_SECRETS_PATH="$SECRETS_PATH"
export PREPSHIP_V1_ROOT="${PREPSHIP_V1_ROOT:-$ROOT_DIR/../prepship}"
export PREPSHIP_WEB_PUBLIC_DIR="${PREPSHIP_WEB_PUBLIC_DIR:-$ROOT_DIR/apps/web/public}"
export WORKER_SYNC_ENABLED="${WORKER_SYNC_ENABLED:-false}"
export API_PORT
export WEB_PORT
export REACT_PORT
export REACT_ENABLED
export API_BASE_URL

cleanup() {
  if [[ -n "${REACT_PID:-}" ]]; then
    kill "$REACT_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

node --experimental-strip-types apps/api/src/main.ts &
API_PID=$!

node --experimental-strip-types apps/web/src/main.ts &
WEB_PID=$!

if [[ "$REACT_ENABLED" == "true" ]]; then
  if [[ -x "$ROOT_DIR/node_modules/.bin/vite" || -x "$ROOT_DIR/apps/react/node_modules/.bin/vite" ]]; then
    npm --prefix "$ROOT_DIR/apps/react" run dev -- --host 127.0.0.1 --port "$REACT_PORT" &
    REACT_PID=$!
  else
    echo "React: skipped (install frontend dependencies to enable apps/react)" >&2
  fi
fi

echo "API: ${API_BASE_URL}"
echo "Web: http://127.0.0.1:${WEB_PORT}"
if [[ -n "${REACT_PID:-}" ]]; then
  echo "React: http://127.0.0.1:${REACT_PORT}"
fi
echo "DB: ${SQLITE_DB_PATH}"
echo "Secrets: ${PREPSHIP_SECRETS_PATH}"

PIDS=("$API_PID" "$WEB_PID")
if [[ -n "${REACT_PID:-}" ]]; then
  PIDS+=("$REACT_PID")
fi

wait "${PIDS[@]}"
