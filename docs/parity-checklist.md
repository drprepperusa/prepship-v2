# Parity Checklist

## Goal

Validate that V2 matches V1 behavior closely enough to support cutover planning without changing process ownership prematurely.

## Recommended Test Mode

- V1 remains the behavioral source of truth
- V2 runs against the current V1 SQLite database
- V2 worker stays disabled
- compare V1 and V2 side by side for the same known records and workflows

## Baseline Setup

1. Start V1 in its normal server environment.
2. Start V2 API with `DB_PROVIDER=sqlite`.
3. Start V2 web.
4. Keep `WORKER_SYNC_ENABLED=false`.
5. Confirm both V1 and V2 can read the same order/client/shipment data set.

## Quick Verification

Run these first:

- `GET /health` on V2 API
- `GET /health` on V2 web
- open the V2 web app and verify it loads the copied V1 shell
- verify counts/init data load without obvious console errors

## Priority Flows To Compare

### Orders

- order list
  Compare the orders filter bar, date presets/custom range behavior, server-backed column prefs (`colPrefs`), marked-up rate display (`rbMarkups`), and table columns such as `Best Rate`, `Ship Margin`, `Tracking #`, `Label Created`, `Age`, plus any enabled diagnostic columns like `Carrier Code`, `Provider ID`, `Client ID`, and `Acct Nickname`.
- order detail/full view
- daily stats
- selected package / best-rate / residential / selected-pid overrides

### Rates

- cached rates
- live rate fetch
- rate browse
- clear-and-refetch control flow

### Labels and Shipments

- create label
- void label
- return label
- retrieve label
- shipment sync
- shipment status
- `/api/sync/status`
- `/api/sync/trigger`

### Billing

- billing config
- billing summary
- billing details
- package prices
- generate billing
- billing invoice HTML export
- reference-rate fetch/status/backfill

### Inventory and Products

- inventory list
- receive / adjust
- ledger views
- populate/import/bulk dimension helpers
- parent-SKU endpoints
- product defaults save/load

## Suggested Comparison Method

For each flow:

1. pick a known record or date range in V1
2. load the same flow in V2
3. compare:
   - response shape
   - critical totals
   - status transitions
   - stored side effects in SQLite
   - visible frontend behavior

## What To Record

If you find a mismatch, record:

- endpoint or UI flow
- exact input used
- V1 result
- V2 result
- whether the issue looks like:
  - fixture/schema assumption
  - missing behavior
  - process ownership issue
  - data-specific production edge case

Add schema/data assumptions to:

- `docs/live-db-verification.md`

## Do Not Mix In Yet

Avoid these changes during the first parity pass:

- enabling V2 worker ownership
- changing the underlying V1 DB path during the test window
- switching secrets/config format mid-test
- comparing against stale DB snapshots unless clearly labeled

## Good Exit Criteria

You are ready for the next phase when:

- the copied V1 frontend runs end-to-end against V2 without obvious missing actions
- migrated endpoints match V1 for your known operator-critical workflows
- any remaining mismatches are small, documented, and reproducible
- the remaining work is mostly cutover/process-hardening, not missing API surface
