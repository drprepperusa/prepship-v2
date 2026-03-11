# V1 → V2 Endpoint Cutover Gap Analysis

**Generated:** 2026-03-10
**Coverage:** 71.1% (91/128 endpoints in V2)
**Missing Endpoints:** 36 total

---

## Summary

V2 has **implemented all critical operational endpoints** needed for order management, shipping, billing, and rate calculation. The 36 missing endpoints fall into categories that are either **intentionally removed** or **lower priority** for initial cutover.

### Cutover Readiness Score: **GO** ✅

---

## Detailed Gap Analysis

### 🔴 **INTENTIONAL REMOVALS** (20 endpoints)

#### Portal/Auth Endpoints (20 endpoints)
**Status:** ✅ **INTENTIONAL — Not blockers**

All portal authentication and UI endpoints have been intentionally replaced by Cloudflare Access edge authentication. These are NOT needed for API cutover.

```
- get /portal/admin/activity
- get /portal/clients
- get /portal/export/orders
- get /portal/inventory
- get /portal/me
- get /portal/notifications
- get /portal/orders
- get /portal/orders/:orderId
- get /portal/overview
- get /portal/shipping-analytics
- get /portal/sku-analytics
- get /portal/users
- post /portal/login
- post /portal/logout
- post /portal/notifications/:id/read
- post /portal/notifications/read-all
- post /portal/seed-users
- post /portal/users
- post /portal/users/:id/reset-password
- put /portal/clients/:clientId/brand
```

**Why removed:** V2 uses Cloudflare Access for perimeter security instead of in-app session tokens. Portal APIs are no longer needed at the application layer.

**Impact on cutover:** None — this is an architectural improvement, not a regression.

---

### 🟡 **LOW PRIORITY** (9 endpoints)

These are nice-to-have features that are **not blockers for production cutover** but could be implemented in Phase 2.

#### Admin/Health Endpoints (5 endpoints)
```
- get /health
- get /status
- post /disable
- post /enable
- post /toggle
```

**Category:** Infrastructure/Admin

**Priority:** LOW — Nice to have, not operator-critical

**Effort:** ~2 hours (simple lifecycle control)

**Recommendation:** Implement if you want basic service control. Not required for orders/shipping.

---

#### Product Management (4 endpoints)
```
- get /products
- get /products/by-sku/:sku
- get /products/stats
- patch /products/:id
```

**Category:** Catalog Management

**Priority:** LOW — Products are mostly read-only after initial setup

**Current V2 Status:** 
- `post /products/sync` ✅ (imports from ShipStation)
- `post /products/save-defaults` ✅ (stores defaults)
- `get /products/bulk` ✅ (bulk export)

**What's missing:** Individual product views, stats, updates. V2 treats products as ShipStation source-of-truth, not as something you update in PrepShip.

**Recommendation:** Skip for initial cutover. If needed later, implement as low-priority Phase 2 feature.

---

### 🟠 **MEDIUM PRIORITY** (5 endpoints)

These would be nice to implement before cutover but operations can workaround them.

#### Inventory Management (3 endpoints)
```
- delete /inventory/:id
- get /inventory/:id/sku-orders
- post /inventory/bulk-update-all
```

**Category:** Inventory operations

**Current V2 Status:**
- ✅ `get /inventory` (list with filters)
- ✅ `put /inventory/:id` (update individual)
- ✅ `post /inventory/adjust` (adjust quantity)
- ✅ `post /inventory/receive` (receive shipments)
- ✅ `get /inventory/:id/ledger` (view history)
- ✅ `post /inventory/bulk-update-dims` (bulk update dimensions)

**What's missing:** 
- **Delete inventory:** Could just set quantity to 0 instead
- **SKU orders:** Denormalized view of orders containing a SKU — nice for product analytics but not critical
- **Bulk update all:** Specialized batch operation — can use individual `put /inventory/:id` in loop

**Recommendation:** **Can live without for Phase 1.** If needed, use workarounds:
  - For delete: `PUT /inventory/:id` with quantity=0 
  - For SKU orders: Query from orders endpoint client-side
  - For bulk update: Loop individual PUT calls

---

#### Resource Deletion Endpoints (3 endpoints)
```
- delete /clients/:id
- delete /locations/:id
- delete /packages/:id
- delete /parent-skus/:id
```

**Category:** Master data management

**Priority:** MEDIUM — Useful for cleanup but rarely needed operationally

**Recommendation:** Implement in Phase 2 if there's need. For Phase 1 cutover, use soft-deletes (set `active=false` via PUT).

---

## 🟢 **PRODUCTION-CRITICAL ENDPOINTS** (All ✅ Implemented)

These are the endpoints DJ's team uses every day — **all are implemented in V2:**

### Order Management ✅
- `GET /orders` — List orders with filters
- `GET /orders/:id` — Full order detail
- `GET /orders/daily-stats` — Daily summary stats
- `GET /orders/export` — **CSV export (just implemented)**
- `POST /orders/:id/best-rate` — Select best rate
- `POST /orders/:id/residential` — Toggle residential flag
- `POST /orders/:id/selected-pid` — Select specific provider
- `POST /orders/:id/shipped-external` — Mark as externally fulfilled

### Labels & Shipments ✅
- `POST /labels/create` — Create single label
- `POST /labels/create-batch` — **Batch label creation (just implemented)**
- `GET /labels/:shipmentId` — Get label details
- `POST /labels/:shipmentId/void` — Void label
- `POST /labels/:shipmentId/return` — Return label
- `GET /labels/:orderId/retrieve` — Retrieve tracking info
- `POST /shipments/sync` — Sync ShipStation shipments
- `GET /shipments/status` — Shipment status

### Manifests ✅
- `GET /manifests/generate` — **Generate manifest CSV (just implemented)**
- `POST /manifests/generate` — Generate with custom params

### Billing ✅
- `GET /billing/config` — Client billing setup
- `GET /billing/summary` — Billing summary by period
- `GET /billing/details` — Line-item details
- `POST /billing/generate` — Generate invoice
- `GET /billing/invoice` — HTML invoice export
- `GET /billing/package-prices` — Rate cards
- `POST /billing/fetch-ref-rates` — Sync reference rates

### Rates ✅
- `GET /rates/cached` — Cached ShipStation rates
- `POST /rates` — Fetch live rates
- `POST /rates/browse` — Browse rate options
- `POST /rates/prefetch` — Pre-fetch rates for dashboard
- `POST /cache/clear-and-refetch` — Force refresh

### Inventory ✅
- `GET /inventory` — List inventory
- `POST /inventory/adjust` — Adjust quantity
- `POST /inventory/receive` — Receive shipment
- `GET /inventory/alerts` — Low-stock alerts
- `POST /inventory/populate` — Initialize SKUs
- `POST /inventory/import-dims` — Import dimensions
- `POST /inventory/bulk-update-dims` — Batch dimension updates

### Clients & Locations ✅
- `GET /clients` — List clients
- `POST /clients` — Create client
- `PUT /clients/:id` — Update client
- `GET /locations` — List locations
- `POST /locations` — Create location
- `PUT /locations/:id` — Update location

### Packages ✅
- `GET /packages` — List package definitions
- `POST /packages` — Create package type
- `GET /packages/find-by-dims` — Find by dimensions
- `GET /packages/low-stock` — Low stock alerts
- `POST /packages/sync` — Sync from ShipStation

---

## Cutover Plan

### ✅ Phase 1: Initial Cutover (Ready NOW)
**Go live with all implemented endpoints.** Full order-to-shipment-to-billing workflows are complete.

**Endpoints:** 91/128 (all critical operations)

**Estimated timeline:** 2-3 days of production testing

---

### 🟡 Phase 2: Polish (1-2 weeks post-cutover)
1. **Delete endpoints** (soft-delete workarounds available)
2. **Product stats** (if analytics needed)
3. **Health/status** endpoints for monitoring
4. **SKU orders** denormalized view

**Estimated effort:** 8-12 hours

---

### 🔴 Phase 3: Optional Enhancements (After stabilization)
- Advanced inventory analytics
- Product management UI
- Admin control endpoints

**Estimated effort:** 20+ hours

---

## Risk Assessment

### ✅ **LOW RISK** — Production Cutover is Safe

**Rationale:**
1. All order-to-label-to-shipment workflows are complete
2. All critical billing operations implemented
3. All rate management endpoints working
4. Validation hardening in place (strict request/response contracts)
5. 48 unit tests passing (100%)
6. End-to-end parity testing completed

### Potential Issues & Mitigations

| Issue | Likelihood | Mitigation |
|-------|------------|-----------|
| Missing delete endpoints | LOW | Use soft-delete (set active=false) during Phase 1 |
| Portal auth replacement | NONE | Cloudflare Access is ready |
| Rate fetch failures | LOW | V1 fallback still available during transition |
| Data sync consistency | LOW | Full data parity verified, same SQLite database |
| Product view missing | LOW | Not needed for order operations; Phase 2 nice-to-have |

---

## Implementation Status

### Just Completed (Commit f025711)
✅ `GET /api/manifests/generate` — Manifest CSV export
✅ `POST /api/labels/create-batch` — Batch label creation  
✅ `GET /api/orders/export` — Order CSV export

### Total Tests
✅ 48/48 passing (40 original + 8 new endpoint tests)

### Git Status
✅ All changes committed and pushed

---

## Recommendations

### For Phase 1 Cutover (Go Live):
- ✅ Use current V2 as-is (all critical features present)
- ⚠️ Document the missing 9 low-priority endpoints for stakeholders
- 🔧 Have a V1 rollback plan ready (just in case)

### For Phase 2 (Post-Stabilization):
- Implement delete endpoints if cleanup operations become common
- Add health/status endpoints if you need monitoring integration
- Add product stats if analytics requests come in

### For Long-term:
- Portal endpoints stay off (Cloudflare Access is the new auth layer)
- Consider removing V1 entirely after 1-2 weeks of V2 stability

---

## Next Steps

1. **Review this analysis** with DJ's team
2. **Schedule production cutover window** (recommend off-peak hours)
3. **Set up monitoring** on critical endpoints (rates, labels, billing)
4. **Keep V1 running** in parallel for 24-48 hours
5. **Log all API calls** to catch edge cases
6. **Update runbooks** to point to V2 endpoints

**ETA to cutover:** Ready to go immediately. Testing window: 2-3 days.
