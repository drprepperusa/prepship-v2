# Frontend Validation Hardening

## Purpose

`apps/web` is still the legacy-derived V2 frontend. It is not React yet, and it still uses direct DOM mutation plus many raw `fetch(...).json()` call sites.

The goal of this hardening pass is:

- catch API/DTO drift at the browser boundary
- remove deprecated legacy-era field assumptions from the UI
- reduce silent frontend breakage caused by loose response assumptions

## Why This Was Added

A concrete failure mode already occurred in the copied frontend: label UI code was reading a field that was not present on the current V2 DTO.

That class of bug is easy to create in the current frontend because:

- many modules consume JSON responses directly
- `packages/contracts` provides TypeScript interfaces, but the browser runtime does not enforce them
- the V2 web UI still carries legacy assumptions in some flows

React would not solve this by itself. The immediate fix is a validated API boundary.

## Current Pattern

New browser-side validation helpers live in:

- [apps/web/public/js/api-client.js](/home/tito/dev/prepshipv2/apps/web/public/js/api-client.js)
- [apps/web/public/js/api-contracts.js](/home/tito/dev/prepshipv2/apps/web/public/js/api-contracts.js)

The pattern is:

1. fetch JSON through `fetchValidatedJson(...)`
2. parse the successful response with a runtime validator
3. fail loudly if the response shape no longer matches the expected contract
4. parse failed responses through shared helpers instead of assuming JSON error bodies inline

This keeps DTO mismatch bugs close to the API boundary instead of letting them surface later as broken UI behavior, and it gives the frontend a single place to reject deprecated field assumptions as modules are migrated to current V2 DTO names.

## Hardened Flows

The current pass validates the highest-risk flows that were already showing drift or are central to operator workflows:

- labels
  - `POST /api/labels/create`
  - `POST /api/labels/:shipmentId/void`
  - `POST /api/labels/:shipmentId/return`
  - `GET /api/labels/:orderId/retrieve`
- orders list
  - `GET /api/orders`
  - `GET /api/orders/:id/full`
  - `GET /api/orders/ids`
  - `GET /api/orders/picklist`
  - `GET /api/orders/daily-stats`
  - polling refreshes that re-read the order list
- product defaults
  - `GET /api/products/bulk`
  - `GET /api/products/by-sku/:sku`
  - `POST /api/products/save-defaults`
- package lookup
  - `GET /api/packages/:id`
- billing
  - `GET /api/billing/config`
  - `PUT /api/billing/config/:clientId`
  - `POST /api/billing/generate`
  - `GET /api/billing/summary`
  - `GET /api/billing/details`
  - `GET /api/billing/package-prices`
  - `PUT /api/billing/package-prices`
  - `POST /api/billing/fetch-ref-rates`
  - `GET /api/billing/fetch-ref-rates/status`
  - `POST /api/billing/backfill-ref-rates`
  - `GET /api/packages` when billing lazily loads package data
- inventory
  - `POST /api/inventory/populate`
  - `POST /api/inventory/import-dims`
  - `GET /api/clients`
  - `GET /api/inventory`
  - `GET /api/inventory/alerts`
  - `POST /api/inventory/bulk-update-dims`
  - `POST /api/inventory/adjust`
  - `PUT /api/inventory/:id`
  - `GET /api/inventory/ledger`
  - `GET /api/inventory/:id/ledger`
  - `POST /api/inventory/receive`
  - `GET /api/parent-skus`
  - `POST /api/parent-skus`
  - `PUT /api/inventory/:id/set-parent`
  - `POST /api/clients/sync-stores`
  - `POST /api/clients`
  - `PUT /api/clients/:id`
  - `DELETE /api/clients/:id`
  - `GET /api/inventory/:id/sku-orders`
- app bootstrap/init
  - `GET /api/init-data`
  - `GET /api/stores`
  - `GET /api/carrier-accounts`
  - `GET /api/counts`
  - fallback `GET /api/clients` when init bootstrap fails
  - `POST /api/cache/clear-and-refetch`
- rate browser
  - `GET /api/carriers-for-store`
  - `GET /api/rates/cached`
  - `POST /api/rates/cached/bulk`
  - `POST /api/rates`
  - `POST /api/rates/browse`
- package helpers used by copied order workflows
  - `GET /api/packages/find-by-dims`
  - `POST /api/packages/auto-create`
  - `GET /api/packages?source=custom`

Relevant frontend modules:

- [apps/web/public/js/labels.js](/home/tito/dev/prepshipv2/apps/web/public/js/labels.js)
- [apps/web/public/js/orders.js](/home/tito/dev/prepshipv2/apps/web/public/js/orders.js)
- [apps/web/public/js/panel.js](/home/tito/dev/prepshipv2/apps/web/public/js/panel.js)
- [apps/web/public/js/polling.js](/home/tito/dev/prepshipv2/apps/web/public/js/polling.js)
- [apps/web/public/js/batch.js](/home/tito/dev/prepshipv2/apps/web/public/js/batch.js)
- [apps/web/public/js/order-detail.js](/home/tito/dev/prepshipv2/apps/web/public/js/order-detail.js)
- [apps/web/public/js/billing-ui.js](/home/tito/dev/prepshipv2/apps/web/public/js/billing-ui.js)
- [apps/web/public/js/inventory-ui.js](/home/tito/dev/prepshipv2/apps/web/public/js/inventory-ui.js)
- [apps/web/public/js/app.js](/home/tito/dev/prepshipv2/apps/web/public/js/app.js)
- [apps/web/public/js/stores.js](/home/tito/dev/prepshipv2/apps/web/public/js/stores.js)
- [apps/web/public/js/sidebar.js](/home/tito/dev/prepshipv2/apps/web/public/js/sidebar.js)
- [apps/web/public/js/daily-strip.js](/home/tito/dev/prepshipv2/apps/web/public/js/daily-strip.js)
- [apps/web/public/js/rate-browser.js](/home/tito/dev/prepshipv2/apps/web/public/js/rate-browser.js)
- [apps/web/public/js/locations-ui.js](/home/tito/dev/prepshipv2/apps/web/public/js/locations-ui.js)
- [apps/web/public/js/packages-ui.js](/home/tito/dev/prepshipv2/apps/web/public/js/packages-ui.js)
- [apps/web/public/js/table.js](/home/tito/dev/prepshipv2/apps/web/public/js/table.js)
- [apps/web/public/js/sync-poller.js](/home/tito/dev/prepshipv2/apps/web/public/js/sync-poller.js)
- [apps/web/public/js/analysis-ui.js](/home/tito/dev/prepshipv2/apps/web/public/js/analysis-ui.js)
- [apps/web/public/js/markups.js](/home/tito/dev/prepshipv2/apps/web/public/js/markups.js)

## Current Direction

The frontend should use current V2 DTO names and shapes, not deprecated legacy-era field names.

That means:

- if a legacy field was renamed in V2, update the UI to the V2 name
- if a legacy-shaped payload assumption no longer matches V2, update the consumer to the V2 shape
- do not preserve deprecated legacy field names in the browser just because the copied frontend once used them

Validation and drift cleanup are therefore linked:

- validators should describe the current V2 contract
- feature modules should read the V2 fields the validators expose
- remaining legacy field usage in `apps/web` should be treated as cleanup work, not compatibility to preserve

## Concrete Behavior Change

One specific cleanup completed in this pass:

- the frontend no longer assumes label creation returns legacy `labelData`
- label-opening code now follows the V2 label contract and uses `labelUrl`

That change was applied in both:

- [apps/web/public/js/labels.js](/home/tito/dev/prepshipv2/apps/web/public/js/labels.js)
- [apps/web/public/js/batch.js](/home/tito/dev/prepshipv2/apps/web/public/js/batch.js)

Another cleanup completed in the current pass:

- `parseListOrdersResponse(...)` now returns the stable V2 order DTO shape instead of leaking extra top-level order fields through to feature modules
- copied order UI modules now read raw ShipStation-origin order details from `order.raw` via shared accessors instead of reading deprecated hoisted aliases like `requestedShippingService`, `_bestRateJson`, `_rateDims*`, or `_selectedPackageId`
- `order-detail.js` now consumes `/api/orders/:id/full` as `{ raw, shipments, local }` directly instead of synthesizing `_shipments` and `_local` fields back onto the order object
- `rate-browser.js` no longer injects fake helper fields like `_pid` and `_carrierName` into rate objects

## Test Coverage

Browser-side validation coverage lives in:

- [apps/web/test/api-contracts.test.ts](/home/tito/dev/prepshipv2/apps/web/test/api-contracts.test.ts)

Those tests currently cover:

- valid label response parsing
- malformed product response rejection
- product-save package resolution parsing
- orders list response parsing with current top-level `page/pages/total`
- rejection of the older `meta`-shaped orders payload
- valid billing config/detail parsing
- malformed billing summary/status rejection
- valid client/inventory list parsing
- malformed inventory receive parsing
- valid inventory SKU-drawer parsing
- valid init bootstrap parsing
- valid wrapped full-order parsing
- valid order helper payload parsing
- malformed cache-clear result rejection
- valid carrier lookup and cached-rate parsing
- valid cached-bulk/package helper parsing
- valid location/package/settings/sync/analysis parsing
- malformed daily-stats rejection
- malformed browse-rate rejection
- endpoint-context propagation for validation failures

API-side regression coverage for malformed request input now also exists in:

- [apps/api/test/orders.test.ts](/home/tito/dev/prepshipv2/apps/api/test/orders.test.ts)
- [apps/api/test/billing.test.ts](/home/tito/dev/prepshipv2/apps/api/test/billing.test.ts)
- [apps/api/test/packages.test.ts](/home/tito/dev/prepshipv2/apps/api/test/packages.test.ts)
- [apps/api/test/inventory.test.ts](/home/tito/dev/prepshipv2/apps/api/test/inventory.test.ts)
- [apps/api/test/rates.test.ts](/home/tito/dev/prepshipv2/apps/api/test/rates.test.ts)

Those tests cover malformed JSON request bodies plus invalid numeric/boolean query and body inputs that previously could be coerced into valid-looking V2 requests.

## How To Extend This

When hardening another frontend API flow:

1. add or extend a parser in [apps/web/public/js/api-contracts.js](/home/tito/dev/prepshipv2/apps/web/public/js/api-contracts.js)
2. route the call through [apps/web/public/js/api-client.js](/home/tito/dev/prepshipv2/apps/web/public/js/api-client.js)
3. update the calling module to use the validated result
4. add a focused test in [apps/web/test/api-contracts.test.ts](/home/tito/dev/prepshipv2/apps/web/test/api-contracts.test.ts)

Do not add runtime validation by embedding ad hoc shape checks inside feature modules. Keep the validation boundary centralized, and use that boundary to enforce current V2 field names rather than carrying deprecated legacy names forward.

## Repo-Wide Audit Status

The repo-wide success-path validation boundary is now in place across the V2 web frontend.

Current transport-level exceptions are intentional rather than unvalidated drift:

- [apps/web/public/js/manifests.js](/home/tito/dev/prepshipv2/apps/web/public/js/manifests.js) still uses direct `fetch(...)` because the success path is a CSV blob download rather than JSON
- one plain `fetch(...)` remains in [apps/web/public/js/rate-browser.js](/home/tito/dev/prepshipv2/apps/web/public/js/rate-browser.js), but it is a fire-and-forget write to `/api/orders/:id/selected-pid` and does not consume JSON

On the API side, the request boundary now also rejects malformed JSON and invalid numeric/boolean input with `400` responses instead of coercing them into defaults or surfacing them as `500`s. Shared strict parsing now lives in:

- [packages/contracts/src/common/input-validation.ts](/home/tito/dev/prepshipv2/packages/contracts/src/common/input-validation.ts)
- [apps/api/src/app/create-app.ts](/home/tito/dev/prepshipv2/apps/api/src/app/create-app.ts)

## Known Drift Risks

The previously identified concrete drift items for `orders.js`, `panel.js`, `order-detail.js`, `rate-browser.js`, and `stores.js` have been addressed in the current pass, and future cleanup should continue replacing deprecated frontend field reads with the current V2 names rather than preserving legacy aliases.

Any next pass should focus on newly introduced DTO fields or future API slices rather than reopening already-aligned transport and order-flow paths.
