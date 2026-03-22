# Parity Checklist

## Goal

Validate that V2 matches legacy behavior closely enough to support cutover planning without changing process ownership prematurely.

## Recommended Test Mode

- the legacy stack remains the behavioral source of truth
- V2 runs against the current legacy SQLite database
- V2 worker stays disabled
- compare the legacy stack and V2 side by side for the same known records and workflows

## Baseline Setup

1. Start the legacy stack in its normal server environment.
2. Start V2 API with `DB_PROVIDER=sqlite`.
3. Start V2 web.
4. Start V3 React only if you are validating the React frontend.
5. Keep `WORKER_SYNC_ENABLED=false`.
6. Confirm both the legacy stack and V2 can read the same order/client/shipment data set.

## Quick Verification

Run these first:

- `GET /health` on V2 API
- `GET /health` on V2 web
- open the V2 web app and verify it loads the legacy-derived shell
- verify counts/init data load without obvious console errors

## Priority Flows To Compare

### Orders

- order list
- order detail/full view
- daily stats
- React orders shipping panel versus V2 web for requested service, ship account, service, weight/dims, and selected package display
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

1. pick a known record or date range in the legacy stack
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
- legacy result
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
- changing the underlying legacy DB path during the test window
- switching secrets/config format mid-test
- comparing against stale DB snapshots unless clearly labeled

## Good Exit Criteria

You are ready for the next phase when:

- the V2 web frontend runs end-to-end against V2 without obvious missing actions
- migrated endpoints match legacy behavior for your known operator-critical workflows
- any remaining mismatches are small, documented, and reproducible
- the remaining work is mostly cutover/process-hardening, not missing API surface
