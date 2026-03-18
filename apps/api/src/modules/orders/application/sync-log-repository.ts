export interface SyncLogEntry {
  id: number;
  timestamp: number;
  orderId: number;
  operation: "create" | "update" | "cancel";
  v2_status?: string;
  v2_error_message?: string;
  v3_status?: string;
  v3_error_message?: string;
  discrepancy_type?: "status_mismatch" | "missing_in_v3" | "timestamp_drift";
  resolved: boolean;
  resolution_note?: string;
  resolved_at?: number;
  created_at: number;
  updated_at: number;
}

export interface Discrepancy {
  orderId: number;
  discrepancy_type: "status_mismatch" | "missing_in_v3" | "timestamp_drift";
  v2_status?: string;
  v3_status?: string;
  timestamp_diff_ms?: number;
  last_sync_time: number;
}

export interface SyncLogRepository {
  /**
   * Record a sync operation
   */
  recordSync(entry: Omit<SyncLogEntry, "id" | "timestamp" | "created_at" | "updated_at">): Promise<number>;

  /**
   * Record a discrepancy
   */
  recordDiscrepancy(
    orderId: number,
    discrepancy_type: "status_mismatch" | "missing_in_v3" | "timestamp_drift",
    v2_status?: string,
    v3_status?: string,
  ): Promise<void>;

  /**
   * Get unresolved discrepancies
   */
  getUnresolvedDiscrepancies(limit?: number): Promise<Discrepancy[]>;

  /**
   * Count unresolved discrepancies
   */
  countUnresolvedDiscrepancies(): Promise<number>;

  /**
   * Mark a discrepancy as resolved
   */
  markResolved(id: number, note?: string): Promise<void>;

  /**
   * Get recent sync logs for an order
   */
  getOrderSyncHistory(orderId: number, limit?: number): Promise<SyncLogEntry[]>;

  /**
   * Find auto-resolvable discrepancies (timestamp drift < 30 sec)
   */
  getAutoResolvableDiscrepancies(): Promise<Discrepancy[]>;

  /**
   * Mark auto-resolved timestamp drift
   */
  markAutoResolved(id: number, note: string): Promise<void>;
}
