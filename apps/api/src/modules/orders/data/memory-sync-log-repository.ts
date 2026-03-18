import type { SyncLogRepository, SyncLogEntry, Discrepancy } from "../application/sync-log-repository.ts";

export class MemorySyncLogRepository implements SyncLogRepository {
  private entries: SyncLogEntry[] = [];
  private nextId = 1;

  async recordSync(
    entry: Omit<SyncLogEntry, "id" | "timestamp" | "created_at" | "updated_at">,
  ): Promise<number> {
    const now = Date.now();
    const newEntry: SyncLogEntry = {
      id: this.nextId++,
      timestamp: now,
      orderId: entry.orderId,
      operation: entry.operation,
      v2_status: entry.v2_status,
      v2_error_message: entry.v2_error_message,
      v3_status: entry.v3_status,
      v3_error_message: entry.v3_error_message,
      discrepancy_type: entry.discrepancy_type,
      resolved: entry.resolved || false,
      resolution_note: entry.resolution_note,
      created_at: now,
      updated_at: now,
    };
    this.entries.push(newEntry);
    return newEntry.id;
  }

  async recordDiscrepancy(
    orderId: number,
    discrepancy_type: "status_mismatch" | "missing_in_v3" | "timestamp_drift",
    v2_status?: string,
    v3_status?: string,
  ): Promise<void> {
    const now = Date.now();
    const entry: SyncLogEntry = {
      id: this.nextId++,
      timestamp: now,
      orderId,
      operation: "update",
      v2_status,
      v3_status,
      discrepancy_type,
      resolved: false,
      created_at: now,
      updated_at: now,
    };
    this.entries.push(entry);
  }

  async getUnresolvedDiscrepancies(limit: number = 100): Promise<Discrepancy[]> {
    const unresolved = this.entries
      .filter((e) => !e.resolved && e.discrepancy_type)
      .slice(-limit);

    const grouped = new Map<number, SyncLogEntry>();
    for (const entry of unresolved) {
      if (!grouped.has(entry.orderId) || entry.updated_at > (grouped.get(entry.orderId)?.updated_at ?? 0)) {
        grouped.set(entry.orderId, entry);
      }
    }

    return Array.from(grouped.values()).map((entry) => ({
      orderId: entry.orderId,
      discrepancy_type: entry.discrepancy_type as "status_mismatch" | "missing_in_v3" | "timestamp_drift",
      v2_status: entry.v2_status,
      v3_status: entry.v3_status,
      last_sync_time: entry.updated_at,
    }));
  }

  async countUnresolvedDiscrepancies(): Promise<number> {
    const unresolved = new Set(
      this.entries.filter((e) => !e.resolved && e.discrepancy_type).map((e) => e.orderId),
    );
    return unresolved.size;
  }

  async markResolved(id: number, note?: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.resolved = true;
      entry.resolution_note = note;
      entry.resolved_at = Date.now();
      entry.updated_at = Date.now();
    }
  }

  async getOrderSyncHistory(orderId: number, limit: number = 50): Promise<SyncLogEntry[]> {
    return this.entries
      .filter((e) => e.orderId === orderId)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  async getAutoResolvableDiscrepancies(): Promise<Discrepancy[]> {
    const now = Date.now();
    const thirtySecondsAgo = now - 30 * 1000;

    const unresolved = this.entries.filter(
      (e) =>
        !e.resolved &&
        e.discrepancy_type === "timestamp_drift" &&
        e.updated_at > thirtySecondsAgo,
    );

    const grouped = new Map<number, SyncLogEntry>();
    for (const entry of unresolved) {
      if (!grouped.has(entry.orderId) || entry.updated_at > (grouped.get(entry.orderId)?.updated_at ?? 0)) {
        grouped.set(entry.orderId, entry);
      }
    }

    return Array.from(grouped.values()).map((entry) => ({
      orderId: entry.orderId,
      discrepancy_type: "timestamp_drift",
      v2_status: entry.v2_status,
      v3_status: entry.v3_status,
      last_sync_time: entry.updated_at,
    }));
  }

  async markAutoResolved(id: number, note: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.resolved = true;
      entry.resolution_note = note;
      entry.resolved_at = Date.now();
      entry.updated_at = Date.now();
    }
  }
}
