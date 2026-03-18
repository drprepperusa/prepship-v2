import type { DatabaseSync } from "node:sqlite";
import type { Job, JobContext } from "../../../packages/shared/src/jobs/job.ts";
import type { SyncLogRepository } from "../modules/orders/application/sync-log-repository.ts";
import type { OrderRepository } from "../modules/orders/application/order-repository.ts";
import { SqliteSyncLogRepository } from "../modules/orders/data/sqlite-sync-log-repository.ts";

/**
 * Discrepancy Detection Job
 *
 * Runs periodically to:
 * 1. Check last 1000 orders updated in the last hour
 * 2. Compare V2 status vs expected V3 status
 * 3. Detect timestamp drift (>30 sec difference)
 * 4. Flag discrepancies in order_sync_log
 * 5. Auto-resolve simple cases (timestamp drift <30 sec)
 * 6. Alert if unresolved count > 5
 */
export class SyncDiscrepancyCheckerJob implements Job {
  readonly name = "orders.sync.discrepancy-checker";

  constructor(
    private readonly db: DatabaseSync,
    private readonly orderRepository: OrderRepository,
  ) {}

  async run(context: JobContext): Promise<void> {
    console.log(`[${this.name}] started at ${context.now.toISOString()}`);

    try {
      const syncLogRepo = new SqliteSyncLogRepository(this.db);

      // Get last 1000 orders updated in the last hour
      const oneHourAgo = context.now.getTime() - 60 * 60 * 1000;
      const recentOrders = this.getRecentOrders(oneHourAgo);

      console.log(`[${this.name}] checking ${recentOrders.length} recent orders`);

      // For each order, check for discrepancies
      for (const order of recentOrders) {
        await this.checkOrderDiscrepancies(order, context.now, syncLogRepo);
      }

      // Auto-resolve timestamp drift < 30 sec
      await this.autoResolveDriftDiscrepancies(syncLogRepo);

      // Get unresolved count
      const unresolvedCount = await syncLogRepo.countUnresolvedDiscrepancies();
      console.log(`[${this.name}] unresolved discrepancies: ${unresolvedCount}`);

      if (unresolvedCount > 5) {
        console.warn(
          `[${this.name}] CRITICAL: ${unresolvedCount} unresolved discrepancies detected`,
        );
        // Flag for alerting (next step in spec)
      }

      console.log(`[${this.name}] completed at ${context.now.toISOString()}`);
    } catch (error) {
      console.error(`[${this.name}] error:`, error);
      throw error;
    }
  }

  /**
   * Get orders updated in the last X milliseconds (limit 1000)
   */
  private getRecentOrders(
    afterTimestamp: number,
  ): Array<{ orderId: number; orderStatus: string; updatedAt?: number }> {
    // Query last 1000 orders from order_sync_log where updated_at > afterTimestamp
    const stmt = this.db.prepare(`
      SELECT DISTINCT
        osl.orderId,
        o.orderStatus,
        MAX(osl.updated_at) as lastSyncTime
      FROM order_sync_log osl
      JOIN orders o ON o.orderId = osl.orderId
      WHERE osl.updated_at > ?
      GROUP BY osl.orderId
      ORDER BY lastSyncTime DESC
      LIMIT 1000
    `);

    const rows = stmt.all(afterTimestamp) as Array<{
      orderId: number;
      orderStatus: string;
      lastSyncTime: number;
    }>;

    return rows.map((row) => ({
      orderId: row.orderId,
      orderStatus: row.orderStatus,
      updatedAt: row.lastSyncTime,
    }));
  }

  /**
   * Check an individual order for discrepancies
   */
  private async checkOrderDiscrepancies(
    order: { orderId: number; orderStatus: string; updatedAt?: number },
    now: Date,
    syncLogRepo: SyncLogRepository,
  ): Promise<void> {
    // Get the order record
    const orderRecord = this.orderRepository.getById(order.orderId);
    if (!orderRecord) {
      return; // Order not found
    }

    // Get the most recent sync log for this order
    const history = await syncLogRepo.getOrderSyncHistory(order.orderId, 1);
    if (history.length === 0) {
      return; // No sync history
    }

    const lastSync = history[0];

    // Check 1: Status mismatch between V2 and V3
    if (lastSync.v3_status && lastSync.v2_status && lastSync.v2_status !== lastSync.v3_status) {
      await syncLogRepo.recordDiscrepancy(
        order.orderId,
        "status_mismatch",
        orderRecord.orderStatus,
        lastSync.v3_status,
      );
      console.log(
        `[${this.name}] status_mismatch for order ${order.orderId}: V2=${orderRecord.orderStatus} vs V3=${lastSync.v3_status}`,
      );
    }

    // Check 2: Missing in V3 (V3 status is null but V2 has a status)
    if (!lastSync.v3_status && lastSync.v2_status) {
      const timeSinceSync = now.getTime() - lastSync.created_at;
      const fiveMinutes = 5 * 60 * 1000;

      if (timeSinceSync < fiveMinutes) {
        // Recent order, flag as missing_in_v3 for retry
        await syncLogRepo.recordDiscrepancy(
          order.orderId,
          "missing_in_v3",
          lastSync.v2_status,
          undefined,
        );
        console.log(
          `[${this.name}] missing_in_v3 for order ${order.orderId} (created ${timeSinceSync}ms ago)`,
        );
      }
    }

    // Check 3: Timestamp drift (updated_at difference > 30 sec)
    if (lastSync.resolved_at && order.updatedAt) {
      const timeDiff = Math.abs(order.updatedAt - lastSync.resolved_at);
      const thirtySeconds = 30 * 1000;

      if (timeDiff > thirtySeconds) {
        await syncLogRepo.recordDiscrepancy(
          order.orderId,
          "timestamp_drift",
          orderRecord.orderStatus,
          lastSync.v3_status,
        );
        console.log(
          `[${this.name}] timestamp_drift for order ${order.orderId}: ${timeDiff}ms difference`,
        );
      }
    }
  }

  /**
   * Auto-resolve timestamp drift discrepancies < 30 sec
   */
  private async autoResolveDriftDiscrepancies(syncLogRepo: SyncLogRepository): Promise<void> {
    const autoResolvable = await syncLogRepo.getAutoResolvableDiscrepancies();

    for (const disc of autoResolvable) {
      // These are already filtered to be < 30 sec old
      await syncLogRepo.recordSync({
        orderId: disc.orderId,
        operation: "update",
        v2_status: disc.v2_status,
        v3_status: disc.v3_status,
        discrepancy_type: undefined,
        resolved: true,
        resolution_note: "Auto-resolved: timestamp drift < 30 sec",
      });

      console.log(
        `[${this.name}] auto-resolved timestamp_drift for order ${disc.orderId}`,
      );
    }
  }
}

// Export factory for testing
export function createSyncDiscrepancyCheckerJob(
  db: DatabaseSync,
  orderRepository: OrderRepository,
): Job {
  return new SyncDiscrepancyCheckerJob(db, orderRepository);
}
