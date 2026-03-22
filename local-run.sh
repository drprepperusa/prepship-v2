#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SQLITE_DB_PATH:-$ROOT_DIR/prepship.db}"
SECRETS_PATH="${PREPSHIP_SECRETS_PATH:-$ROOT_DIR/secrets.json}"
API_PORT="${API_PORT:-4010}"
WEB_PORT="${WEB_PORT:-4011}"
REACT_PORT="${REACT_PORT:-4014}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${API_PORT}}"
VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-$API_BASE_URL}"

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
export API_BASE_URL
export VITE_API_PROXY_TARGET

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

npm run dev --workspace apps/react -- --host 127.0.0.1 --port "$REACT_PORT" &
REACT_PID=$!

echo "API: ${API_BASE_URL}"
echo "Web: http://127.0.0.1:${WEB_PORT}"
echo "React: http://127.0.0.1:${REACT_PORT}"
echo "DB: ${SQLITE_DB_PATH}"
echo "Secrets: ${PREPSHIP_SECRETS_PATH}"

wait "$API_PID" "$WEB_PID" "$REACT_PID"
