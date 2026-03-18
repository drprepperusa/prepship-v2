import type { DatabaseSync } from "node:sqlite";
import type {
  SyncLogRepository,
  SyncLogEntry,
  Discrepancy,
} from "../application/sync-log-repository.ts";

export class SqliteSyncLogRepository implements SyncLogRepository {
  constructor(private readonly db: DatabaseSync) {}

  async recordSync(
    entry: Omit<SyncLogEntry, "id" | "timestamp" | "created_at" | "updated_at">,
  ): Promise<number> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO order_sync_log (
        orderId,
        operation,
        v2_status,
        v2_error_message,
        v3_status,
        v3_error_message,
        discrepancy_type,
        resolved,
        resolution_note,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      entry.orderId,
      entry.operation,
      entry.v2_status ?? null,
      entry.v2_error_message ?? null,
      entry.v3_status ?? null,
      entry.v3_error_message ?? null,
      entry.discrepancy_type ?? null,
      entry.resolved ? 1 : 0,
      entry.resolution_note ?? null,
      now,
      now,
    );

    return result.lastInsertRowid as number;
  }

  async recordDiscrepancy(
    orderId: number,
    discrepancy_type: "status_mismatch" | "missing_in_v3" | "timestamp_drift",
    v2_status?: string,
    v3_status?: string,
  ): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO order_sync_log (
        orderId,
        operation,
        v2_status,
        v3_status,
        discrepancy_type,
        resolved,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      orderId,
      "update", // discrepancies are typically caught during update checks
      v2_status ?? null,
      v3_status ?? null,
      discrepancy_type,
      0, // not resolved
      now,
      now,
    );
  }

  async getUnresolvedDiscrepancies(limit: number = 100): Promise<Discrepancy[]> {
    const stmt = this.db.prepare(`
      SELECT
        orderId,
        discrepancy_type,
        v2_status,
        v3_status,
        MAX(updated_at) as last_sync_time
      FROM order_sync_log
      WHERE resolved = 0 AND discrepancy_type IS NOT NULL
      GROUP BY orderId, discrepancy_type
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      orderId: number;
      discrepancy_type: "status_mismatch" | "missing_in_v3" | "timestamp_drift";
      v2_status?: string;
      v3_status?: string;
      last_sync_time: number;
    }>;

    return rows.map((row) => ({
      orderId: row.orderId,
      discrepancy_type: row.discrepancy_type,
      v2_status: row.v2_status,
      v3_status: row.v3_status,
      last_sync_time: row.last_sync_time,
    }));
  }

  async countUnresolvedDiscrepancies(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT orderId) as count
      FROM order_sync_log
      WHERE resolved = 0 AND discrepancy_type IS NOT NULL
    `);

    const result = stmt.get() as { count: number };
    return result.count;
  }

  async markResolved(id: number, note?: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE order_sync_log
      SET resolved = 1, resolution_note = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(note ?? null, now, now, id);
  }

  async getOrderSyncHistory(orderId: number, limit: number = 50): Promise<SyncLogEntry[]> {
    const stmt = this.db.prepare(`
      SELECT
        id,
        timestamp,
        orderId,
        operation,
        v2_status,
        v2_error_message,
        v3_status,
        v3_error_message,
        discrepancy_type,
        resolved,
        resolution_note,
        resolved_at,
        created_at,
        updated_at
      FROM order_sync_log
      WHERE orderId = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(orderId, limit) as Array<{
      id: number;
      timestamp: number;
      orderId: number;
      operation: "create" | "update" | "cancel";
      v2_status?: string;
      v2_error_message?: string;
      v3_status?: string;
      v3_error_message?: string;
      discrepancy_type?: "status_mismatch" | "missing_in_v3" | "timestamp_drift";
      resolved: number;
      resolution_note?: string;
      resolved_at?: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((row) => ({
      ...row,
      resolved: row.resolved === 1,
    }));
  }

  async getAutoResolvableDiscrepancies(): Promise<Discrepancy[]> {
    const now = Date.now();
    const thirtySecondsAgo = now - 30 * 1000;

    const stmt = this.db.prepare(`
      SELECT
        orderId,
        discrepancy_type,
        v2_status,
        v3_status,
        MAX(updated_at) as last_sync_time
      FROM order_sync_log
      WHERE
        resolved = 0
        AND discrepancy_type = 'timestamp_drift'
        AND updated_at > ?
      GROUP BY orderId, discrepancy_type
      ORDER BY updated_at DESC
    `);

    const rows = stmt.all(thirtySecondsAgo) as Array<{
      orderId: number;
      discrepancy_type: "timestamp_drift";
      v2_status?: string;
      v3_status?: string;
      last_sync_time: number;
    }>;

    return rows.map((row) => ({
      orderId: row.orderId,
      discrepancy_type: row.discrepancy_type,
      v2_status: row.v2_status,
      v3_status: row.v3_status,
      last_sync_time: row.last_sync_time,
    }));
  }

  async markAutoResolved(id: number, note: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE order_sync_log
      SET resolved = 1, resolution_note = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(note, now, now, id);
  }
}
