import type { DatabaseSync } from "node:sqlite";

/**
 * Initialize the order_sync_log table for tracking order sync operations
 * and detecting discrepancies between V2 and V3 status
 */
export function initOrderSyncLogTable(db: DatabaseSync): void {
  // Create the main sync log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') * 1000 AS INTEGER)),
      orderId INTEGER NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'cancel')),
      v2_status TEXT,
      v2_error_message TEXT,
      v3_status TEXT,
      v3_error_message TEXT,
      discrepancy_type TEXT CHECK(discrepancy_type IN ('status_mismatch', 'missing_in_v3', 'timestamp_drift', NULL)),
      resolved INTEGER DEFAULT 0,
      resolution_note TEXT,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') * 1000 AS INTEGER)),
      updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') * 1000 AS INTEGER)),
      FOREIGN KEY (orderId) REFERENCES orders(orderId)
    );
  `);

  // Create index for efficient queries on unresolved discrepancies
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_sync_log_unresolved
    ON order_sync_log(resolved, discrepancy_type, updated_at)
    WHERE resolved = 0 AND discrepancy_type IS NOT NULL;
  `);

  // Create index for recent orders query
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_sync_log_orderId_timestamp
    ON order_sync_log(orderId, timestamp DESC);
  `);

  // Create index for updated_at queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_sync_log_updated_at
    ON order_sync_log(updated_at DESC);
  `);
}
