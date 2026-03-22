# AGENTS.md

## Purpose

This repo is the clean V2 refactor of PrepShip. The legacy repo in `../prepship` is the behavioral source of truth during migration. Do not patch the legacy repo here. Re-implement behavior in V2 behind explicit module boundaries.

Important migration context: V2 is meant to be datastore-agnostic long term. During parity work, it may read from the legacy SQLite database through a transitional adapter so behavior can be compared safely. That does not make SQLite the target end-state for V2. The intended cutover is a later migration with historical backfill into a new primary datastore provider.

Frontend migration context: `apps/web` is the V2 refactor of the existing PrepShip UI, not a redesign. Preserve the legacy visual design, view structure, and operator workflows by default. `apps/react` is the V3 React frontend. When implementing `apps/web`, use `../prepship/prepship/public/index.html` and `../prepship/prepship/public/js/*` as the canonical UI reference, while routing all data access through V2 API/contracts.

## Current Migration State

Implemented modules:

- `orders`
- `clients`
- `locations`
- `settings`
- `packages`
- `init`
- `inventory`
- `analysis`
- `rates`
- `manifests`
- `labels`
- `shipments`
- `billing`
- `products`

Implemented API entrypoints are described in [README.md](./README.md).

## Hard Constraints

- Preserve provider-selected composition and keep business logic independent from concrete datastore adapters.
- Do not hide background/process work inside API bootstrap; move long-running ownership into explicit worker/process code when migrating it.
- Treat `secrets.json` as a transitional adapter only.
- Keep business logic dependent on interfaces, not any concrete datastore directly.
- Treat the SQLite adapter as transitional migration infrastructure, not the long-term architectural destination.
- Legacy code is the source of truth unless explicitly contradicted.
- If a behavior cannot be verified locally, encode the assumption in tests/docs and continue.

## Architecture Rules

- Put HTTP concerns in `apps/api/src/modules/<module>/api`.
- Put use cases and orchestration in `application`.
- Put provider-specific query/mapping code in `data`.
- Put shared DTOs in `packages/contracts`.
- Keep `apps/web` coupled to legacy UI behavior, not to new invented layouts.
- Preserve the legacy information architecture and interaction model unless the user explicitly asks for a UI change.
- Do not wire `apps/web` directly to backend internals or provider-specific details while chasing legacy parity.
- Do not move raw SQL into handlers.
- Do not instantiate repositories inside handlers.
- Do not instantiate concrete datastore adapters in `bootstrap.ts`; use the provider bundle under `apps/api/src/app/providers`.
- Keep worker/process logic in `apps/worker` or another explicit process boundary rather than burying it in request handlers.

## Testing Rules

- Add or update tests for every migrated endpoint or use case.
- Keep the test split explicit:
  - service tests should be datastore-independent where possible
  - provider boot/integration tests may use `memory`
  - SQLite adapter tests may use fixture-backed SQLite databases
- Do not block on the real production DB file.
- If bootstrapping starts depending on new tables, update all test fixtures to include those tables.

## Live DB Verification

Assumptions that should be checked later against the real SQLite file belong in:

- [live-db-verification.md](./docs/live-db-verification.md)

Do not stop work just because the real DB is unavailable unless the task truly cannot proceed without it.

## Practical Guidance

- Prefer extending already-migrated modules over inventing new framework layers.
- For web work, port legacy UI slices into V2 incrementally rather than designing replacement screens.
- Reuse the patterns already present in:
  - `apps/api/src/modules/billing`
  - `apps/api/src/modules/orders`
  - `apps/api/src/modules/clients`
  - `apps/api/src/modules/locations`
  - `apps/api/src/modules/settings`
  - `apps/api/src/modules/packages`
  - `apps/api/src/modules/init`
  - `apps/api/src/modules/inventory`
  - `apps/api/src/modules/analysis`
  - `apps/api/src/modules/rates`
- When porting from the legacy repo, read the legacy route file and then split the behavior across contracts, application services, and repositories.
- When porting frontend behavior, read the legacy `public/index.html` section and the matching `public/js/*` module before changing `apps/web`.
- If a legacy endpoint is not yet migrated, either finish it properly in V2 or document the exact blocker. Do not leave vague placeholder behavior.

## Next Good Targets

- worker-owned sync/process orchestration
- `portal` or other client-facing read slices if needed after billing

## Remaining Parity Focus

There are no explicit copied-frontend API gaps currently listed here. Before starting a new parity slice:

- verify the current frontend/API matrix in `docs/frontend-api-audit.md`
- check `docs/live-db-verification.md` for assumptions that still need production validation
- prefer process-ownership, live-data verification, and fixture-hardening work over inventing new compatibility placeholders

Keep migrating remaining behavior behind explicit V2 modules and process boundaries instead of re-centering architecture around the legacy stack or around SQLite.

## Notes For Future Agents

- Node is being run with `--experimental-strip-types`, so avoid unsupported TS syntax such as parameter properties.
- Tests use Node's built-in `node:sqlite`, which emits an experimental warning. That warning is expected in the current setup.
- `DatabaseSync` is not `better-sqlite3`: it does not provide `.transaction()`. Use explicit `BEGIN` / `COMMIT` / `ROLLBACK` if you need transaction control.
- Tests currently run with `npm test`.
- The local sandbox may block opening real listening sockets during tests; prefer calling the app handler directly with `Request` objects.
- `packages/shared/src/config/secrets-adapter.ts` now prefers repo-local `./secrets.json` when present, then falls back to `PREPSHIP_V1_ROOT/secrets.json` or `../prepship/secrets.json`.
- `packages/shared/src/config/repo-paths.ts` centralizes sibling-repo and web-public path resolution; prefer env/config helpers over hardcoded local paths.
- `bootstrapApi()` now selects a datastore provider bundle from `DB_PROVIDER`; keep provider-specific wiring out of the app composition path.
- Because `bootstrapApi()` wires all migrated modules, new SQLite fixture-backed tests must include the minimum shared tables those modules touch, especially `clients` and `locations`.
