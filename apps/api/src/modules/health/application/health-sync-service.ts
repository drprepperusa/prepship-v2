import type { ApiDataStore } from "../../../app/datastore.ts";
import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";

export interface HealthSyncStatusDto {
  sync_enabled: boolean;
  last_backfill: string | null;
  unresolved_discrepancies: number;
  alignment_pct: number;
  status: "healthy" | "warning" | "critical";
  total_orders: number;
}

export class HealthSyncService {
  private readonly datastore: ApiDataStore;
  private readonly secrets: TransitionalSecrets;
  private readonly db: any;

  constructor(datastore: ApiDataStore, secrets: TransitionalSecrets, db?: any) {
    this.datastore = datastore;
    this.secrets = secrets;
    // Get db from orderRepository which wraps it
    this.db = db || (datastore.orderRepository as any).db || (datastore.shipmentRepository as any).db;
  }

  getSyncStatus(): HealthSyncStatusDto {
    const syncEnabled = process.env.WORKER_SYNC_ENABLED === "true" || process.env.WORKER_SYNC_ENABLED === "1";
    
    // Get total orders count from the actual orders table
    let totalOrders = 0;
    try {
      const result = this.db.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number } | undefined;
      totalOrders = result?.count ?? 0;
    } catch {
      totalOrders = 0;
    }

    // Get unresolved discrepancies count (stored in discrepancy_tracker table if it exists)
    const unresolvedDiscrepancies = this.getUnresolvedDiscrepanciesCount();

    // Get last backfill timestamp
    const lastBackfill = this.getLastBackfillTimestamp();

    // Calculate alignment percentage
    const alignmentPct = totalOrders > 0 
      ? Math.round(((totalOrders - unresolvedDiscrepancies) / totalOrders) * 10000) / 100
      : 100;

    // Determine health status
    let status: "healthy" | "warning" | "critical";
    if (alignmentPct >= 99) {
      status = "healthy";
    } else if (alignmentPct >= 95) {
      status = "warning";
    } else {
      status = "critical";
    }

    return {
      sync_enabled: syncEnabled,
      last_backfill: lastBackfill,
      unresolved_discrepancies: unresolvedDiscrepancies,
      alignment_pct: alignmentPct,
      status,
      total_orders: totalOrders,
    };
  }

  private getUnresolvedDiscrepanciesCount(): number {
    try {
      // Try to read from a hypothetical discrepancy_tracker table
      // This will be populated by the worker/discrepancy checker
      const result = this.db.prepare(`
        SELECT COUNT(*) as count FROM discrepancy_tracker 
        WHERE resolved = 0 OR resolved IS NULL
      `).get() as { count: number } | undefined;
      
      return result?.count ?? 0;
    } catch {
      // Table doesn't exist yet or datastore doesn't support this
      return 0;
    }
  }

  private getLastBackfillTimestamp(): string | null {
    try {
      // Check for last sync timestamp in shipments or discrepancy table
      const shipmentSync = this.db.prepare(
        "SELECT MAX(createdAt) as lastSync FROM shipments WHERE source = 'v3'"
      ).get() as { lastSync: number | null } | undefined;

      if (shipmentSync?.lastSync) {
        return new Date(shipmentSync.lastSync).toISOString();
      }

      // Fallback: check discrepancy_tracker
      const discrepancySync = this.db.prepare(
        "SELECT MAX(created_at) as lastSync FROM discrepancy_tracker"
      ).get() as { lastSync: number | null } | undefined;

      if (discrepancySync?.lastSync) {
        return new Date(discrepancySync.lastSync).toISOString();
      }

      return null;
    } catch {
      return null;
    }
  }
}
