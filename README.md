# PrepshipV2

PrepShip V2 is a clean-room TypeScript monorepo built alongside V1. The target is full V1 functional parity inside V2, with explicit module boundaries, shared DTO contracts, dependency-injected persistence, and a worker entry point for process ownership that should not stay hidden inside API bootstrap.

V2 is a refactor, not a product redesign. The web app is expected to preserve V1's visual design, information architecture, and operator workflows by default while moving data access behind V2 API/contracts. Any intentional UI deviation from V1 should be treated as an explicit exception, not the baseline.

V2 is intended to be datastore-agnostic. During migration and parity validation, it can point at V1's existing SQLite database through a transitional adapter. That SQLite path is for behavioral verification, not the long-term storage plan. After V2 reaches parity, the intended cutover is a full migration with historical backfill into a new primary datastore provider.

## Current Scope

- `orders` is the first fully active migration slice
- `clients`, `locations`, `settings`, and `packages` have also been migrated
- `clients` sync-stores control flow has also been migrated
- `packages` carrier sync control flow has also been migrated
- `init` bootstrap metadata endpoints have also been migrated
- `inventory` core read/write endpoints have also been migrated
- `analysis` read-only reporting endpoints have also been migrated
- `rates` cache-backed reads, live fetch, browse, and carrier lookup have also been migrated
- `rates` cache clear-and-refetch control flow has also been migrated
- `manifests` CSV generation/export has also been migrated
- `labels` create/void/retrieve/return flows have also been migrated
- `shipments` sync/status/proxy ownership flows have also been migrated
- `sync` frontend compatibility status/trigger aliases now route through the migrated V2 shipment sync service
- `billing` config, reporting, and generation/package-pricing workflows have also been migrated
- `billing` invoice export has also been migrated
- `products` defaults/bulk lookup endpoints have also been migrated
- inventory helper and parent-SKU endpoints used by the V1 UI have also been migrated
- V2 now has provider-selected datastore wiring with both `sqlite` and `memory` adapters
- the current `sqlite` adapter exists primarily so V2 can validate behavior against V1's live SQLite database during migration
- the long-term plan is to cut V2 over to a new primary datastore provider after parity is proven and historical backfill is complete
- the SQLite adapter path is injected through config when `DB_PROVIDER=sqlite`
- `secrets.json` is still a transitional adapter, not the long-term config model
- V2 now prefers `./secrets.json` by default when present
- the worker entry point exists, but some longer-running sync ownership is still handled in-process for parity

## Workspace Layout

- `apps/api` HTTP API and composition root
- `apps/web` V1-parity web app that should preserve the current V1 UI/UX while swapping in V2 API client usage
- `apps/react` parity-first React migration app; use V1 and `apps/web` as the visual/behavioral source of truth, not as a redesign opportunity
- `apps/worker` background job host, currently disabled by default
- `packages/contracts` request/response DTOs
- `packages/shared` config, DI, and SQLite utilities
- `docs` architecture and migration planning

## Frontend Validation Hardening

The copied V1 frontend in `apps/web` is still DOM-driven and not fully typed at runtime. To reduce DTO drift bugs without forcing the copied frontend to be rewritten before parity, V2 now includes a browser-side validation boundary for high-risk API responses.

V2 now also has stricter API ingress validation for migrated routes. Malformed JSON request bodies and invalid numeric/boolean request input are rejected with `400` responses instead of being silently coerced into defaults or bubbling out as `500`s.

Current entry points:

- `apps/web/public/js/api-client.js`
- `apps/web/public/js/api-contracts.js`
- `apps/web/test/api-contracts.test.ts`
- `packages/contracts/src/common/input-validation.ts`
- `apps/api/src/app/create-app.ts`

Current notes and next targets:

- `docs/frontend-validation-hardening.md`
- `docs/frontend-api-audit.md`

## React Migration

`apps/react` is an incremental migration target, not the canonical frontend and not a redesign track.

Current rules:

- preserve V1 visual design, view structure, and operator workflow unless a task explicitly asks for UI change
- treat `apps/web` plus V1 `public/index.html` and `public/js/*` as the parity reference while React work is in progress
- route data through V2 APIs/contracts rather than copying legacy backend coupling into React
- migrate feature-by-feature; the current React slice with the strongest parity focus is the Orders flow, especially the Orders View table/filter shell and the Order Panel

Operationally:

- run the copied parity frontend with `npm run dev:web`
- run the React migration app with `npm run dev:react`
- prefer documenting parity gaps explicitly rather than silently inventing replacement UI behavior
- React Orders View parity has improved recently: the filter bar now follows the V1 structure more closely, and the core V1 table columns including `Ship Margin`, `Label Created`, and `Age` are now present with populated data

## Configuration

```bash
export DB_PROVIDER=sqlite
export SQLITE_DB_PATH=/absolute/path/to/prepship.db
export PREPSHIP_SECRETS_PATH=./secrets.json
export PREPSHIP_V1_ROOT=../prepship
export API_PORT=4010
```

For an in-memory boot path:

```bash
export DB_PROVIDER=memory
export PREPSHIP_SECRETS_PATH=./secrets.json
export API_PORT=4010
```

Defaults:

- `DB_PROVIDER=sqlite`
- `API_PORT=4010`
- `PREPSHIP_SECRETS_PATH` falls back to local `./secrets.json` when present, otherwise the sibling V1 repo: `../prepship/secrets.json`
- `PREPSHIP_V1_ROOT` defaults to `../prepship` and controls the sibling-repo fallback path used for transitional references like `secrets.json`
- `PREPSHIP_WEB_PUBLIC_DIR` defaults to `apps/web/public`
- `WORKER_SYNC_ENABLED=false`

Because the production SQLite file is not present on this machine, API boot will fail fast if `SQLITE_DB_PATH` is missing when `DB_PROVIDER=sqlite`. SQLite-backed tests use temporary local fixtures and do not depend on the production DB. The suite also includes a `memory` provider path.

Migration intent:

- use V1's SQLite database as the transitional parity-validation store for V2
- keep V2's application and repository boundaries provider-agnostic during that phase
- replace the transitional SQLite adapter with a new primary datastore provider after parity validation and historical backfill

## Progress

### API Modules Implemented

`orders`

- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/:id/full`
- `GET /api/orders/ids`
- `GET /api/orders/picklist`
- `POST /api/orders/:id/shipped-external`
- `POST /api/orders/:id/residential`
- `POST /api/orders/:id/selected-pid`
- `POST /api/orders/:id/best-rate`

`clients`

- `GET /api/clients`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `POST /api/clients/sync-stores`

`locations`

- `GET /api/locations`
- `POST /api/locations`
- `PUT /api/locations/:id`
- `DELETE /api/locations/:id`
- `POST /api/locations/:id/setDefault`

`settings`

- `GET /api/settings/:key`
- `PUT /api/settings/:key`

`packages`

- `GET /api/packages`
- `POST /api/packages`
- `GET /api/packages/low-stock`
- `GET /api/packages/find-by-dims`
- `POST /api/packages/auto-create`
- `POST /api/packages/sync`
- `GET /api/packages/:id`
- `PUT /api/packages/:id`
- `DELETE /api/packages/:id`
- `POST /api/packages/:id/receive`
- `POST /api/packages/:id/adjust`
- `PATCH /api/packages/:id/reorder-level`
- `GET /api/packages/:id/ledger`

`init`

- `GET /api/init-data`
- `GET /api/counts`
- `GET /api/stores`
- `GET /api/carriers`
- `GET /api/carrier-accounts`
- `POST /api/cache/refresh-carriers`

`inventory`

- `GET /api/inventory`
- `POST /api/inventory/receive`
- `POST /api/inventory/adjust`
- `PUT /api/inventory/:id`
- `GET /api/inventory/ledger`
- `GET /api/inventory/:id/ledger`
- `GET /api/inventory/alerts`

`analysis`

- `GET /api/analysis/skus`
- `GET /api/analysis/daily-sales`

`rates`

- `GET /api/rates/cached`
- `POST /api/rates/cached/bulk`
- `GET /api/carriers-for-store`
- `POST /api/rates/prefetch` stays disabled and returns the V1-style no-op response
- `POST /api/rates`
- `POST /api/rates/browse`
- `POST /api/cache/clear-and-refetch`

`manifests`

- `POST /api/manifests/generate`

`labels`

- `POST /api/labels/create`
- `POST /api/labels/:shipmentId/void`
- `POST /api/labels/:shipmentId/return`
- `GET /api/labels/:orderId/retrieve`

`shipments`

- `POST /api/shipments/sync`
- `GET /api/shipments/status`
- `GET /api/shipments`
- `GET /api/sync/status` compatibility alias for the copied V1 frontend
- `POST /api/sync/trigger` compatibility alias for the copied V1 frontend

`billing`

- `GET /api/billing/config`
- `GET /api/billing/summary`
- `GET /api/billing/details`
- `GET /api/billing/package-prices`
- `PUT /api/billing/config/:clientId`
- `POST /api/billing/generate`
- `PUT /api/billing/package-prices`
- `POST /api/billing/package-prices/set-default`
- `GET /api/billing/invoice`

`products`

- `GET /api/products/bulk`
- `GET /api/products/by-sku/:sku`
- `POST /api/products/save-defaults`
- `POST /api/products/:sku/defaults`

`inventory` helper coverage

- `POST /api/inventory/populate`
- `POST /api/inventory/import-dims`
- `POST /api/inventory/bulk-update-dims`
- `GET /api/inventory/:id/sku-orders`
- `PUT /api/inventory/:id/set-parent`
- `GET /api/parent-skus`
- `POST /api/parent-skus`
- `DELETE /api/parent-skus/:id`

`orders`

- `GET /api/orders/daily-stats`
- `POST /api/orders/:id/selected-package-id` compatibility alias for the copied V1 frontend

### Architecture Established

- module-oriented API code under `apps/api/src/modules/*`
- application services depending on repository interfaces
- provider-specific adapters isolated under `data/` and `apps/api/src/app/providers`
- shared DTO contracts under `packages/contracts`
- explicit bootstrapping/composition in `apps/api/src/app/bootstrap.ts`
- provider selection through `DB_PROVIDER` instead of direct adapter construction in bootstrap
- transitional SQLite support exists for migration parity, not as the architectural end state
- explicit worker entrypoint that stays disabled unless intentionally enabled
- web integration should reuse V1's existing layout, markup structure, and interaction model wherever practical, with V2 contracts replacing direct backend coupling underneath

### Testing Status

- fixture-backed API tests pass for `orders`, `clients`, `locations`, `settings`, and `packages`
- fixture-backed API tests pass for `billing`, `analysis`, `init`, `inventory`, `orders`, `clients`, `locations`, `settings`, `packages`, `rates`, `manifests`, `labels`, and `shipments`
- fixture-backed API tests pass for `products`, inventory helper flows, and order daily-stats compatibility routes
- tests now include malformed-request regression coverage for strict request parsing on `orders`, `billing`, `packages`, `inventory`, and `rates`
- tests now include SQLite adapter integration coverage, a memory-provider boot test, and storage-independent service tests
- current command:

```bash
npm test
```

### Remaining Parity Work

The copied V1 frontend API surface is now covered in V2. Remaining parity work is concentrated in:

- worker-owned process/sync orchestration that is still running in-process for parity
- live-DB verification against the real V1 SQLite file
- any non-frontend V1 behaviors that have not yet been explicitly audited or migrated

Track the current frontend/API matrix in:

- `docs/frontend-api-audit.md`

### Deferred Verification

V1 is the source of truth for now. Any assumptions that should be checked later against the live SQLite file are tracked in:

- `docs/live-db-verification.md`

## Commands

```bash
npm test
npm run dev:api
npm run dev:web
npm run dev:worker
```

## Deployment And Parity Docs

- `docs/server-setup.md` for remote server setup and runtime config
- `docs/production-mac-mini.md` for a Mac mini production model based on how V1 currently runs
- `docs/parity-checklist.md` for side-by-side V1/V2 validation steps
- `.env.example` for the current supported env vars

## Status

This repo is no longer just a skeleton. It currently provides:

- real migrated `orders` endpoints with V1-derived behavior
- migrated `clients` CRUD
- migrated `locations` CRUD with default ship-from state
- migrated `settings` key/value handling
- migrated `packages` CRUD, stock operations, dimension lookup, and auto-create flows
- migrated `init` metadata/count endpoints with ShipStation metadata behind an explicit provider
- migrated `inventory` listing, stock adjustments, receive flow, ledger reads, and low-stock alerts
- migrated `analysis` SKU rollups and daily sales reporting
- migrated `rates` cache reads, live rate shopping, browse flows, and deterministic store-scoped carrier lookup
- migrated `labels` create/void/retrieve/return workflows with hybrid ShipStation enrichment/sync
- migrated `shipments` sync/status/proxy ownership flows used by the copied V1 frontend
- migrated `/api/sync/status` and `/api/sync/trigger` compatibility aliases used by the copied V1 sync pill
- migrated manifest CSV export for the copied V1 UI
- migrated `billing` config, summary, details, package price management, and billing generation flows
- migrated billing reference-rate fetch/status/backfill workflows used by the copied V1 UI
- migrated billing invoice HTML export for the copied V1 UI
- migrated `products` defaults persistence and lookup flows used by the V1 panel and batch UI
- migrated inventory helper flows for populate/import-dims/bulk-update-dims, parent-SKU linking, and SKU order history
- a shared-contract pattern for additional modules
- fixture-backed regression tests

This repo does not yet have full V1 parity. The largest remaining work is now around process ownership, live-DB verification, and any still-unmigrated non-frontend slices rather than the already-migrated billing/shipping/frontend API surface.

## TODOs

Near-term backlog:

- repository-level coverage for edge-case SQL and aggregation behavior in migrated modules
- add provider-contract coverage beyond the current memory-provider boot proof
- document and tighten the current `/api/sync/*` compatibility alias behavior versus the eventual worker-owned sync boundary

Structural backlog:

- keep the copied V1-parity web frontend aligned with migrated V2 endpoints as behavior is hardened
- move shared test fixture/schema helpers out of duplicated test setup
- add more repository-level tests around edge-case SQL behavior
- add a build step instead of relying on `node --experimental-strip-types`
- document deployment/process-manager examples for API, web, and worker
- expand `docs/live-db-verification.md` as new inferred schema assumptions appear

Cutover backlog:

- design V2 worker checkpoint storage and scheduling contracts
- migrate any future long-running sync/process ownership that should live outside the API into `apps/worker`
- replace the transitional `secrets.json` adapter with typed runtime config

## Next Likely Modules

Good next targets that fit the current architecture:

- worker-owned sync/process orchestration that should move out of request handlers and into explicit process boundaries
- live-DB verification and fixture-hardening for inferred V1 schema behavior

These should follow the same pattern already established by `orders`, `clients`, `locations`, `settings`, `packages`, `init`, `inventory`, `analysis`, `rates`, and `billing`.
