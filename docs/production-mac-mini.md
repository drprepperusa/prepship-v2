# Production On Mac Mini

## Recommended Model

Mirror the current V1 production pattern:

- run V2 on the Mac mini
- bind services to localhost
- use `launchd` for auto-start and restart
- put Cloudflare Tunnel in front of the web process
- keep the API internal unless you explicitly want it exposed

This matches how V1 is currently described in its production README: `launchd` on macOS, localhost services, and Cloudflare Tunnel for remote access.

## Recommended Processes

For the first real V2 production-style deployment after parity testing:

- `api` on `127.0.0.1:4010`
- `web` on `127.0.0.1:4011`
- `worker` off by default

The V2 web app already proxies `/api/*` to the configured API base URL, so the cleanest public shape is:

- Cloudflare Tunnel or reverse proxy -> `web`
- `web` -> `api` over localhost

## Keep This Off Initially

Do not enable the worker by default yet:

```bash
WORKER_SYNC_ENABLED=false
```

The current worker is not yet a long-running production scheduler. Keep process ownership conservative until parity and operational behavior are fully proven.

## Environment

Use the same env set from `.env.example`, especially:

```bash
DB_PROVIDER=sqlite
SQLITE_DB_PATH=/absolute/path/to/the/current/v1/prepship.db
PREPSHIP_SECRETS_PATH=/absolute/path/to/server-local/secrets.json
PREPSHIP_V1_ROOT=/absolute/path/to/prepship
PREPSHIP_WEB_PUBLIC_DIR=/absolute/path/to/prepshipv2/apps/web/public
API_PORT=4010
WEB_PORT=4011
API_BASE_URL=http://127.0.0.1:4010
WORKER_SYNC_ENABLED=false
```

## launchd

Use one LaunchAgent per long-running V2 process.

Templates:

- `deploy/launchd/com.prepshipv2.api.plist.example`
- `deploy/launchd/com.prepshipv2.web.plist.example`

Recommended install location:

```text
~/Library/LaunchAgents/
```

Load them with:

```bash
launchctl load ~/Library/LaunchAgents/com.prepshipv2.api.plist
launchctl load ~/Library/LaunchAgents/com.prepshipv2.web.plist
```

Restart them with:

```bash
launchctl unload ~/Library/LaunchAgents/com.prepshipv2.api.plist
launchctl unload ~/Library/LaunchAgents/com.prepshipv2.web.plist
launchctl load ~/Library/LaunchAgents/com.prepshipv2.api.plist
launchctl load ~/Library/LaunchAgents/com.prepshipv2.web.plist
```

## Cloudflare Tunnel

Recommended pattern:

- keep API private on localhost
- publish only the V2 web process through the tunnel
- let V2 web proxy `/api/*` internally to `http://127.0.0.1:4010`

That keeps the external shape similar to V1 while reducing accidental direct API exposure.

## Logging

Route stdout/stderr for each launchd service to local log files, for example:

```text
/srv/prepshipv2/logs/api.out.log
/srv/prepshipv2/logs/api.err.log
/srv/prepshipv2/logs/web.out.log
/srv/prepshipv2/logs/web.err.log
```

## Health Checks

Verify locally on the Mac mini:

```bash
curl http://127.0.0.1:4010/health
curl http://127.0.0.1:4011/health
```

## Suggested Rollout Order

1. run V2 on the Mac mini against the current V1 SQLite DB
2. validate parity using `docs/parity-checklist.md`
3. install `launchd` services for `api` and `web`
4. point a non-primary or private tunnel hostname at V2 web first
5. validate parity again in the real hosted environment
6. only then consider changing any process ownership or public traffic routing

## What Not To Change During Initial Production-Like Testing

- do not move the SQLite DB unless necessary
- do not turn the worker on by default
- do not expose the API publicly before you need to
- do not let V1 and V2 both own the same long-running sync boundary without an explicit plan
