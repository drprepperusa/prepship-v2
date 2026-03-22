# Server Setup

## Goal

Run PrepShip V2 on a remote server against the current legacy SQLite database so you can test parity safely before any cutover.

## Recommended Layout

Keep the legacy repo and V2 side by side so V2 can reference the existing legacy SQLite DB and any sibling-repo fallbacks cleanly.

Example:

```text
/srv/
  prepship/          # legacy repo
  prepshipv2/        # this repo
  prepshipv2/config/
    secrets.json
```

## Prerequisites

- Node.js version new enough to support `node --experimental-strip-types`
- npm
- access to the existing legacy SQLite database file
- access to the same ShipStation-related `secrets.json` values the legacy stack uses

## Config

Create a local env file or export these vars in the process manager environment.

```bash
DB_PROVIDER=sqlite
SQLITE_DB_PATH=/srv/prepship/prepship.db
PREPSHIP_SECRETS_PATH=/srv/prepshipv2/config/secrets.json
PREPSHIP_V1_ROOT=/srv/prepship
PREPSHIP_WEB_PUBLIC_DIR=/srv/prepshipv2/apps/web/public
API_PORT=4010
WEB_PORT=4011
REACT_PORT=4014
API_BASE_URL=http://127.0.0.1:4010
VITE_API_PROXY_TARGET=http://127.0.0.1:4010
WORKER_SYNC_ENABLED=false
```

### What Each Setting Does

- `DB_PROVIDER=sqlite`
  Required for parity testing against the live legacy database.
- `REACT_PORT`
  Port for the V3 React frontend when you run it locally on the same host.
- `SQLITE_DB_PATH`
  Must point to the current legacy SQLite DB file you want V2 to validate against.
- `PREPSHIP_SECRETS_PATH`
  Should point to the secrets file V2 should load. Do not commit this file.
- `PREPSHIP_V1_ROOT`
  Points to the sibling legacy repo and is used for transitional fallback paths.
- `PREPSHIP_WEB_PUBLIC_DIR`
  Normally leave this at the V2 default unless your deploy layout changes.
- `VITE_API_PROXY_TARGET`
  Normally leave this pointed at the V2 API when running the V3 React app.
- `WORKER_SYNC_ENABLED=false`
  Keep this off during parity testing unless you are intentionally moving sync ownership into V2 worker.

## Install

From the V2 repo:

```bash
npm install
```

## Start Commands

### API

```bash
npm run dev:api
```

### Web

```bash
npm run dev:web
```

### React (V3)

```bash
npm run dev:react
```

### Worker

Do not start the worker for initial parity testing unless you explicitly want V2 to own worker behavior.

```bash
npm run dev:worker
```

## Health Checks

### API health

```bash
curl http://127.0.0.1:4010/health
```

### Web health

```bash
curl http://127.0.0.1:4011/health
```

## Recommended Process Ownership During Parity

For the first remote parity pass:

- run V2 API
- run V2 web
- run V3 React only if you are validating the React frontend
- keep `WORKER_SYNC_ENABLED=false`
- avoid introducing any new background ownership in V2 until parity is proven

This keeps the parity exercise focused on the migrated API surface rather than mixing in a process-ownership cutover at the same time.

## What To Point At In The Legacy Stack

The critical reference is the current legacy SQLite DB path used by production or staging.

Set:

```bash
SQLITE_DB_PATH=/absolute/path/to/the/current/legacy/prepship.db
```

If the legacy stack keeps its DB elsewhere, point V2 directly at that file. Do not copy the DB to a second location unless you intentionally want to test against a snapshot instead of the current live file.

## Secrets File

If you still use the transitional secrets adapter, place a server-local `secrets.json` somewhere outside the repo or in a non-tracked config dir such as:

```text
/srv/prepshipv2/config/secrets.json
```

Then set:

```bash
PREPSHIP_SECRETS_PATH=/srv/prepshipv2/config/secrets.json
```

## Reverse Proxy / Public Access

If you expose this remotely, proxy:

- web: `127.0.0.1:4011`
- api: `127.0.0.1:4010`

Or expose only the web process publicly and let it proxy `/api/*` to the API process internally.

If you also run the V3 React frontend, keep it internal for parity work unless you are explicitly testing the React deployment path.

## Before You Trust The Result

- confirm both health endpoints respond
- confirm V2 boots with the intended SQLite DB path
- confirm `secrets.json` is not committed and not world-readable
- confirm worker remains disabled unless intentionally enabled
- confirm only one environment owns any long-running sync boundary at a time
