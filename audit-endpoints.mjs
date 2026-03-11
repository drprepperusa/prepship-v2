#!/usr/bin/env node

// V1 endpoints (from grep)
const v1 = [
  // Analysis
  "get /analysis/daily-sales",
  "get /analysis/skus",
  
  // Billing
  "get /billing/config",
  "get /billing/details",
  "get /billing/fetch-ref-rates/status",
  "get /billing/invoice",
  "get /billing/package-prices",
  "get /billing/summary",
  "post /billing/backfill-ref-rates",
  "post /billing/fetch-ref-rates",
  "post /billing/generate",
  "post /billing/package-prices/set-default",
  "put /billing/config/:id",
  "put /billing/package-prices",
  
  // Cache
  "post /cache/clear-and-refetch",
  "post /cache/refresh-carriers",
  
  // Carriers
  "get /carrier-accounts",
  "get /carriers",
  "get /carriers-for-store",
  
  // Clients
  "delete /clients/:id",
  "get /clients",
  "post /clients",
  "post /clients/sync-stores",
  "put /clients/:id",
  
  // Core
  "get /counts",
  "get /health",
  "get /init-data",
  "post /sync/trigger",
  
  // Inventory
  "delete /inventory/:id",
  "get /inventory",
  "get /inventory/:id/ledger",
  "get /inventory/:id/sku-orders",
  "get /inventory/alerts",
  "get /inventory/ledger",
  "post /inventory/adjust",
  "post /inventory/bulk-update-all",
  "post /inventory/bulk-update-dims",
  "post /inventory/import-dims",
  "post /inventory/populate",
  "post /inventory/receive",
  "put /inventory/:id",
  "put /inventory/:id/set-parent",
  
  // Labels
  "get /labels/:orderId/retrieve",
  "get /labels/:shipmentId",
  "post /labels/create",
  "post /labels/create-batch",
  "post /labels/:shipmentId/return",
  "post /labels/:shipmentId/void",
  
  // Locations
  "delete /locations/:id",
  "get /locations",
  "post /locations",
  "post /locations/:id/setDefault",
  "put /locations/:id",
  
  // Manifests
  "get /manifests/generate",
  "post /manifests/generate",
  
  // Orders
  "get /orders",
  "get /orders/:id",
  "get /orders/:id/full",
  "get /orders/daily-stats",
  "get /orders/export",
  "get /orders/ids",
  "get /orders/picklist",
  "post /orders/:id/best-rate",
  "post /orders/:id/residential",
  "post /orders/:id/selected-pid",
  "post /orders/:id/shipped-external",
  
  // Packages
  "delete /packages/:id",
  "get /packages",
  "get /packages/:id",
  "get /packages/:id/ledger",
  "get /packages/find-by-dims",
  "get /packages/low-stock",
  "patch /packages/:id/reorder-level",
  "post /packages",
  "post /packages/:id/adjust",
  "post /packages/:id/receive",
  "post /packages/auto-create",
  "post /packages/sync",
  "put /packages/:id",
  
  // Parent SKUs
  "delete /parent-skus/:id",
  "get /parent-skus",
  "post /parent-skus",
  
  // Portal (auth + UI)
  "get /portal/admin/activity",
  "get /portal/clients",
  "get /portal/export/orders",
  "get /portal/inventory",
  "get /portal/me",
  "get /portal/notifications",
  "get /portal/orders",
  "get /portal/orders/:orderId",
  "get /portal/overview",
  "get /portal/shipping-analytics",
  "get /portal/sku-analytics",
  "get /portal/users",
  "post /portal/login",
  "post /portal/logout",
  "post /portal/notifications/:id/read",
  "post /portal/notifications/read-all",
  "post /portal/seed-users",
  "post /portal/users",
  "post /portal/users/:id/reset-password",
  "put /portal/clients/:clientId/brand",
  
  // Products
  "get /products",
  "get /products/bulk",
  "get /products/by-sku/:sku",
  "get /products/stats",
  "patch /products/:id",
  "post /products/save-defaults",
  "post /products/sync",
  
  // Rates
  "get /rates/cached",
  "get /settings/:key",
  "post /rates",
  "post /rates/browse",
  "post /rates/cached/bulk",
  "post /rates/prefetch",
  
  // Settings
  "get /settings/:key",
  "put /settings/:key",
  
  // Shipments & Sync
  "get /shipments",
  "get /shipments/status",
  "get /sync/status",
  "post /shipments/sync",
  "post /sync/backfill-store-shipments",
  "post /sync/trigger",
  
  // Other
  "get /status",
  "get /stores",
  "post /disable",
  "post /enable",
  "post /toggle",
];

// V2 endpoints (from grep)
const v2 = [
  // Analysis
  "get /analysis/daily-sales",
  "get /analysis/skus",
  
  // Billing
  "get /billing/config",
  "get /billing/details",
  "get /billing/fetch-ref-rates/status",
  "get /billing/invoice",
  "get /billing/package-prices",
  "get /billing/summary",
  "post /billing/backfill-ref-rates",
  "post /billing/fetch-ref-rates",
  "post /billing/generate",
  "post /billing/package-prices/set-default",
  "put /billing/config/:id",
  "put /billing/package-prices",
  
  // Cache
  "post /cache/clear-and-refetch",
  "post /cache/refresh-carriers",
  
  // Carriers
  "get /carrier-accounts",
  "get /carriers",
  "get /carriers-for-store",
  
  // Clients
  "get /clients",
  "post /clients",
  "post /clients/sync-stores",
  "put /clients/:id",
  // missing: delete /clients/:id
  
  // Core
  "get /counts",
  "get /init-data",
  "post /sync/trigger",
  // missing: get /health, get /status
  
  // Inventory
  "get /inventory",
  "get /inventory/:id/ledger",
  "get /inventory/alerts",
  "get /inventory/ledger",
  "post /inventory/adjust",
  "post /inventory/bulk-update-dims",
  "post /inventory/import-dims",
  "post /inventory/populate",
  "post /inventory/receive",
  "put /inventory/:id",
  "put /inventory/:id/set-parent",
  // missing: delete /inventory/:id, get /inventory/:id/sku-orders, post /inventory/bulk-update-all
  
  // Labels
  "get /labels/:orderId/retrieve",
  "get /labels/:shipmentId",
  "post /labels/create",
  "post /labels/create-batch",
  "post /labels/:shipmentId/return",
  "post /labels/:shipmentId/void",
  
  // Locations
  "get /locations",
  "post /locations",
  "post /locations/:id/setDefault",
  "put /locations/:id",
  // missing: delete /locations/:id
  
  // Manifests
  "get /manifests/generate",
  "post /manifests/generate",
  
  // Orders
  "get /orders",
  "get /orders/:id",
  "get /orders/:id/full",
  "get /orders/daily-stats",
  "get /orders/export",
  "get /orders/ids",
  "get /orders/picklist",
  "post /orders/:id/best-rate",
  "post /orders/:id/residential",
  "post /orders/:id/selected-pid",
  "post /orders/:id/shipped-external",
  
  // Packages
  "get /packages",
  "get /packages/:id",
  "get /packages/:id/ledger",
  "get /packages/find-by-dims",
  "get /packages/low-stock",
  "patch /packages/:id/reorder-level",
  "post /packages",
  "post /packages/:id/adjust",
  "post /packages/:id/receive",
  "post /packages/auto-create",
  "post /packages/sync",
  "put /packages/:id",
  // missing: delete /packages/:id
  
  // Parent SKUs
  "get /parent-skus",
  "post /parent-skus",
  // missing: delete /parent-skus/:id
  
  // Products
  "get /products/bulk",
  "post /products/save-defaults",
  "post /products/sync",
  // missing: get /products, get /products/by-sku/:sku, get /products/stats, patch /products/:id
  
  // Rates
  "get /rates/cached",
  "post /rates",
  "post /rates/browse",
  "post /rates/cached/bulk",
  "post /rates/prefetch",
  
  // Settings
  "get /settings/:key",
  "put /settings/:key",
  
  // Shipments & Sync
  "get /shipments",
  "get /shipments/status",
  "get /sync/status",
  "post /shipments/sync",
  "post /sync/backfill-store-shipments",
  "post /sync/trigger",
  
  // Other
  "get /stores",
  // missing: post /disable, post /enable, post /toggle
];

const v1Set = new Set(v1);
const v2Set = new Set(v2);

const missing = v1.filter(e => !v2Set.has(e));
const extra = v2.filter(e => !v1Set.has(e));

console.log("=== ENDPOINT AUDIT ===\n");
console.log(`V1 Total: ${v1.length}`);
console.log(`V2 Total: ${v2.length}`);
console.log(`Coverage: ${((v2.length / v1.length) * 100).toFixed(1)}%\n`);

console.log(`\n=== MISSING IN V2 (${missing.length}) ===\n`);

// Categorize missing endpoints
const categories = {
  portal: [],
  productManagement: [],
  inventory: [],
  clients: [],
  locations: [],
  packages: [],
  admin: [],
  core: [],
};

missing.forEach(endpoint => {
  if (endpoint.includes("/portal")) categories.portal.push(endpoint);
  else if (endpoint.includes("/products") && !endpoint.includes("bulk")) categories.productManagement.push(endpoint);
  else if (endpoint.includes("/inventory")) categories.inventory.push(endpoint);
  else if (endpoint.includes("/clients")) categories.clients.push(endpoint);
  else if (endpoint.includes("/locations")) categories.locations.push(endpoint);
  else if (endpoint.includes("/packages")) categories.packages.push(endpoint);
  else if (["post /disable", "post /enable", "post /toggle", "get /health", "get /status"].includes(endpoint)) categories.admin.push(endpoint);
  else categories.core.push(endpoint);
});

Object.entries(categories).forEach(([cat, endpoints]) => {
  if (endpoints.length > 0) {
    console.log(`${cat.toUpperCase()} (${endpoints.length}):`);
    endpoints.forEach(e => console.log(`  - ${e}`));
    console.log();
  }
});

if (extra.length > 0) {
  console.log(`\n=== EXTRA IN V2 (${extra.length}) ===\n`);
  extra.forEach(e => console.log(`  + ${e}`));
}
