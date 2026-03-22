# Frontend API Audit

Audit source:

- `apps/web/public/index.html`
- `apps/web/public/js/*`

Status meanings:

- `satisfied`: implemented in V2 and exercised by tests
- `blocked`: intentionally unavailable in V2 and still pending migration; currently unused in this audit
- `missing`: frontend still calls it, but V2 does not implement it yet

## Satisfied

- `GET /api/init-data`
- `GET /api/counts`
- `GET /api/stores`
- `GET /api/carrier-accounts`
- `GET /api/carriers-for-store`
- `GET /api/settings/colPrefs`
- `PUT /api/settings/colPrefs`
- `GET /api/settings/rbMarkups`
- `PUT /api/settings/rbMarkups`
- `POST /api/cache/clear-and-refetch`
- `GET /api/orders`
- `GET /api/orders/ids`
- `GET /api/orders/picklist`
- `GET /api/orders/daily-stats`
- `GET /api/orders/:id/full`
- `POST /api/orders/:id/shipped-external`
- `POST /api/orders/:id/residential`
- `POST /api/orders/:id/selected-pid`
- `POST /api/orders/:id/selected-package-id`
- `POST /api/orders/:id/best-rate`
- `GET /api/packages`
- `GET /api/packages/:id`
- `GET /api/packages/low-stock`
- `GET /api/packages/find-by-dims`
- `POST /api/packages/auto-create`
- `POST /api/packages/sync`
- `POST /api/packages/:id/receive`
- `POST /api/packages/:id/adjust`
- `PATCH /api/packages/:id/reorder-level`
- `GET /api/packages/:id/ledger`
- `GET /api/locations`
- `POST /api/locations`
- `PUT /api/locations/:id`
- `DELETE /api/locations/:id`
- `POST /api/locations/:id/setDefault`
- `GET /api/clients`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `POST /api/clients/sync-stores`
- `GET /api/analysis/skus`
- `GET /api/analysis/daily-sales`
- `GET /api/rates/cached`
- `POST /api/rates/cached/bulk`
- `POST /api/rates`
- `POST /api/rates/browse`
- `POST /api/labels/create`
- `POST /api/labels/:shipmentId/void`
- `POST /api/labels/:shipmentId/return`
- `GET /api/labels/:orderId/retrieve`
- `POST /api/manifests/generate`
- `GET /api/billing/config`
- `PUT /api/billing/config/:clientId`
- `POST /api/billing/generate`
- `GET /api/billing/summary`
- `GET /api/billing/details`
- `GET /api/billing/package-prices`
- `PUT /api/billing/package-prices`
- `POST /api/billing/package-prices/set-default`
- `GET /api/billing/invoice`
- `GET /api/inventory`
- `POST /api/inventory/populate`
- `POST /api/inventory/import-dims`
- `POST /api/inventory/bulk-update-dims`
- `GET /api/inventory/alerts`
- `POST /api/inventory/adjust`
- `POST /api/inventory/receive`
- `PUT /api/inventory/:id`
- `GET /api/inventory/ledger`
- `GET /api/inventory/:id/ledger`
- `GET /api/inventory/:id/sku-orders`
- `PUT /api/inventory/:id/set-parent`
- `GET /api/parent-skus`
- `POST /api/parent-skus`
- `DELETE /api/parent-skus/:id`
- `GET /api/products/bulk`
- `GET /api/products/by-sku/:sku`
- `POST /api/products/save-defaults`
- `POST /api/products/:sku/defaults`
- `POST /api/shipments/sync`
- `GET /api/shipments/status`
- `GET /api/shipments`
- `GET /api/sync/status`
- `POST /api/sync/trigger`

## Blocked

- none

## Missing

- none in the currently audited frontend bundle

## Notes

- The V2 web frontend label workflow now runs against migrated V2 label and shipment ownership endpoints while preserving the existing UI flow.
- Frontend runtime contract validation now covers labels, orders list/polling, product defaults, package/locations/settings views, billing, inventory, app bootstrap/init, sync status, analysis, and rate-browser responses; see [frontend-validation-hardening.md](/home/tito/dev/prepshipv2/docs/frontend-validation-hardening.md).
- API ingress validation now also rejects malformed JSON and invalid numeric/boolean request input with `400` responses instead of silently coercing bad values; see [frontend-validation-hardening.md](/home/tito/dev/prepshipv2/docs/frontend-validation-hardening.md) for the current hardening summary and linked tests.
- Current frontend cleanup direction is strict V2 DTO adoption: if the copied UI still reads a deprecated legacy-era field name or shape, update the consumer to the V2 contract rather than preserving the old name in the browser.
- The main copied order-flow modules now follow that rule more strictly: `orders.js`, `panel.js`, `order-detail.js`, `rate-browser.js`, and `stores.js` were moved off deprecated top-level order aliases and now read V2 DTO fields plus `order.raw`/`local` data explicitly.
- The V3 React orders shipping panel now follows the same precedence rules for parity-sensitive fields: awaiting-shipment account/service selection prefers persisted `bestRate`, then raw `advancedOptions.billToMyOtherAccount`, and package selection only treats persisted IDs as selected packages instead of echoing unresolved raw `packageCode` strings like `package`.
- The previous repo-wide list of unvalidated success-path JSON consumers is now stale. The only intentional transport exceptions left in the audited frontend are `manifests.js` handling a CSV blob response directly and `rate-browser.js` keeping one fire-and-forget non-JSON write.
- The concrete frontend/API drift caused by deprecated legacy-style order field reads has been addressed in the copied order flows; future cleanup should focus on newly introduced API slices or DTO changes rather than old field-name compatibility.
- Rate cache clear/refetch now runs against V2 rates services and asynchronously repopulates awaiting-shipment caches.
- Carrier package sync now runs against V2 package services and upserts ShipStation carrier package types into the shared package catalog.
- `billing/invoice` is now migrated as a local reporting flow because it depends on V2 billing data only.
- The V2 web sync pill now uses V2 `/api/sync/*` compatibility aliases backed by the migrated shipment sync service, preserving the existing frontend polling and trigger flow.
