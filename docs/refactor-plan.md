# PrepShip V2 Current Refactor Plan

## Executive Summary

PrepShip V2 is no longer at the “initial orders slice” stage. The V2 web frontend API surface is now migrated into the V2 monorepo, including billing reference-rate workflows and `/api/sync/*` compatibility aliases. The remaining refactor work is now about hardening, process ownership, live-data verification, and reducing transitional assumptions rather than filling obvious frontend API holes.

## What Exists Now

- TypeScript monorepo with `apps/api`, `apps/web`, `apps/worker`, `packages/contracts`, and `packages/shared`
- `apps/react` V3 React frontend
- provider-selected datastore wiring with `sqlite` and `memory`
- migrated module boundaries across orders, clients, locations, settings, packages, init, inventory, analysis, rates, manifests, labels, shipments, billing, and products
- legacy-derived V2 frontend served from V2 static assets while routing data access through V2 APIs
- fixture-backed API coverage and a passing `npm test` suite

## Transitional Constraints

- the legacy stack remains the behavioral source of truth until explicit cutover
- SQLite is a parity-validation adapter, not the long-term storage target
- some longer-running sync behavior still runs in-process for parity even though `apps/worker` exists
- `secrets.json` remains a transitional adapter pending a typed runtime config model

## Current Priorities

### 1. Process Ownership

- move sync/process behavior that should not live in request handlers into `apps/worker`
- keep only one sync owner per environment during any cutover phase
- preserve V2 web frontend behavior while decoupling request/response paths from long-running work

### 2. Live DB Verification

- validate inferred schema assumptions against the real legacy SQLite file
- expand fixtures when production-only columns/indexes are discovered
- document verified assumptions in `docs/live-db-verification.md`

### 3. Test and Fixture Hardening

- add more repository-level tests around edge-case SQL and aggregation behavior
- reduce duplicated SQLite fixture setup across API tests
- add more provider-contract tests beyond the current memory-provider boot path

### 4. Config Cleanup

- keep repo and sibling-repo paths configurable through env/config helpers
- replace transitional secrets loading with typed runtime configuration
- document deploy-time expectations for API, web, and worker processes

## Recommended Next Sequence

1. move sync ownership and scheduling semantics into worker-oriented boundaries
2. verify migrated behavior against the live SQLite file and update fixtures/docs
3. tighten repository/service coverage for migrated modules with the most SQL complexity
4. replace transitional config/secrets assumptions before any broader cutover

## Out of Date Assumptions To Avoid

- do not plan as if only `orders` is migrated
- do not assume the legacy stack still owns billing reference-rate workflows
- do not assume `/api/sync/status` and `/api/sync/trigger` are still blocked
- do not re-center new work around direct SQLite coupling just because the transitional adapter exists

## Success Criteria For The Next Phase

- long-running sync ownership is explicit and no longer hidden inside API request flows
- fixture assumptions are validated against the real DB or explicitly documented as unverified
- the V2 web frontend continues to run against V2 APIs without reintroducing backend-internal coupling
- config and deployment expectations are documented well enough to move the repo to a hosted git remote cleanly
