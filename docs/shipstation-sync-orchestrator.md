# ShipStation Sync Orchestrator — Implementation Notes

**Date:** 2026-03-26  
**Status:** ✅ Complete — All 4 phases implemented and verified

## Summary

Unified 5 independent ShipStation service classes into a single shared client with centralized rate limiting, circuit breaker, and request deduplication. Eliminated race conditions between label creation and sync worker.

## What Was Built

### Phase 1: Shared ShipStationClient
**File:** `apps/api/src/common/shipstation/client.ts`

Features:
- **Token bucket rate limiter** — honors `X-Rate-Limit-Reset` headers from SS 429 responses
- **Circuit breaker** — opens after 5 failures, auto-recovers after 30s in half-open state
- **In-flight deduplication** — concurrent identical GET requests share one `fetch()` call
- **V1 + V2 support** — `v1()`, `v2()`, `v1Pages()` methods with consistent error handling
- **Retry logic** — configurable retries on 429/5xx with exponential backoff
- **Singleton** — `getShipStationClient()` / `setShipStationClient()` for testing

### Phase 2: Unified Sync Orchestrator
**File:** `apps/api/src/modules/sync/order-status-sync.ts`

- Replaced all raw `fetch()` calls with shared `ShipStationClient`
- Circuit breaker guard at start of each cycle (skips if breaker is open)
- All 5 gateways now share the same rate limit token bucket and circuit state:
  - `ShipstationShippingGateway` (label creation, void, return)
  - `ShipstationRateShopper` (rate discovery, carrier discovery)
  - `ShipstationPackageSyncGateway` (carrier package sync)
  - `ShipstationInitMetadataProvider` (stores, carriers metadata — cached with dedup)
  - `OrderStatusSyncWorker` (bulk order/shipment sync)

### Phase 3: Event-Driven Label Race Condition Fix
**File:** `apps/api/src/modules/sync/order-status-sync.ts`

Race condition eliminated:
- When PrepShip creates a label via SS V2 API, it saves with `source='prepship_v2'`
- The bulk sync worker previously could also save the same shipment from SS V1 with a different `shipmentId`, creating duplicate records
- **Fix:** Both the main status sync and backfill loop now check `WHERE source IN ('prepship_v2', 'prepship', 'test_offline')` before saving SS sync records
- PrepShip-owned labels: enriched by `runV1EnrichmentBackground` in `label-services.ts`
- SS-sync-owned labels: externally shipped or marketplace orders

### Phase 4: Tests
**File:** `apps/api/test/shipstation-client.test.ts`

9 new tests covering:
1. V1 GET request success
2. V2 POST request success
3. 429 retry + success on retry
4. Circuit breaker opens after threshold failures
5. Concurrent GET deduplication
6. Paginated v1Pages fetches all pages
7. Non-retryable 4xx error
8. Singleton behavior
9. Test client replacement

**Pre-existing failures fixed:**
- `orders.test.ts`, `labels-shipments.test.ts`, `new-endpoints.test.ts` — all had shipments fixture seed missing `provider_account_nickname` column

## Test Results

```
ℹ tests 208
ℹ pass 208
ℹ fail 0
```

(Previously 199/199 with 4 failures, now 208/208 all passing)

## Live Verification (2026-03-26)

- **Health**: `http://localhost:4010/health` → `{"ok":true}`
- **Order count**: 33,172 orders in production DB
- **Order #112-4730133-9686624**: orderId=272840682, clientId=10 (KF Goods), status=shipped, weight=64oz, shipTo=rochelle gordon (OH)
- **Sync**: Active, running every 3 minutes — last cycle processed real orders
- **Circuit state**: closed (healthy)

## Commits

1. `c3870d6` — feat: add shared ShipStationClient with rate limiting + circuit breaker + dedup
2. `2303ef9` — fix: prevent duplicate shipment records when PrepShip label + SS sync race
