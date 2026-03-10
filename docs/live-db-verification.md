# Live DB Verification Later

V1 is the source of truth for the refactor. These are not blockers; they are the specific assumptions inferred from V1 code that should be confirmed once the real SQLite file is available.

## Orders Module

- `orders.items` is expected to be JSON compatible with `json_each(...)` queries used by V1 SKU selection logic.
- `order_local.selected_rate_json` and `shipments.selected_rate_json` may both exist; V2 currently prefers shipment data first for read paths.
- `shipments.providerAccountId` is assumed to be nullable and backfilled over time, matching V1 sync behavior.
- `order_local.external_shipped` is treated as the canonical local override for excluding awaiting-shipment work.
- `externallyFulfilled` is assumed to remain present in `orders.raw` for external-fulfillment shipped semantics.

## Schema Assumptions Taken Directly From V1

Referenced from [db.js](../../prepship/prepship/lib/db.js):

- `order_local` additive columns such as `residential`, `selected_pid`, `best_rate_json`, `best_rate_at`, and `best_rate_dims`
- `shipments` additive columns such as `providerAccountId`, `selected_rate_json`, `source`, and dimensional fields
- `clients.storeIds` JSON array used to map stores to clients in multiple V1 queries

## Verification Tasks

- Run V2 `GET /api/orders`, `GET /api/orders/:id`, and `GET /api/orders/ids` against the real DB and compare with V1 for known cases.
- Check whether any production-only indexes or columns exist beyond those visible in V1 source.
- Validate that `json_extract` behavior matches fixture assumptions for boolean-like values in `raw`.
- Confirm shipment fallback behavior for rows where `selected_rate_json` is absent but shipment metadata exists.
## Rates

- Verify `rate_cache.cache_key` in the live SQLite file still uses the inferred `v9|weight|zip|dims|R/C|CLclientId` format.
- Verify `rate_cache.weight_version` is always populated and still invalidates cache reads via `sync_meta.key = 'weight_version'`.
- Verify `clients.storeIds` remains JSON-array encoded in the live DB so store-to-client rate scoping continues to work.
