import type { SyncLogRepository } from "../modules/orders/application/sync-log-repository.ts";
import type { OrderRecord } from "../modules/orders/domain/order.ts";

export interface DualWriteConfig {
  syncLogRepository: SyncLogRepository;
  v2QueueHandler?: (operation: DualWriteOperation, orderId: number) => Promise<void>;
  v3QueueHandler?: (operation: DualWriteOperation, orderId: number) => Promise<void>;
  logger?: {
    error: (msg: string, err?: unknown) => void;
    info: (msg: string) => void;
  };
}

export type DualWriteOperation = "create" | "update" | "cancel";

export interface DualWriteResult {
  v2Status: "success" | "failed" | "skipped";
  v3Status: "success" | "failed" | "best-effort" | "skipped";
  orderId: number;
  operation: DualWriteOperation;
}

/**
 * Dual-write middleware: sends order mutations to both V2 and V3 systems.
 * - V2 writes block the response (must succeed, if handler present)
 * - V3 writes are best-effort (logged but don't block V2)
 * - If no handlers are configured, operations are logged and tracked
 * - Handlers receive orderId instead of full OrderRecord for lightweight operation
 */
export function createDualWriteNotifier(config: DualWriteConfig) {
  const defaultLogger = {
    error: (msg: string, err?: unknown) => console.error(msg, err),
    info: (msg: string) => console.info(msg),
  };
  const logger = config.logger || defaultLogger;

  return async function dualWriteNotifier(
    operation: DualWriteOperation,
    orderId: number,
  ): Promise<DualWriteResult> {
    const timestamp = new Date().toISOString();

    let v2Status: "success" | "failed" | "skipped" = "skipped";
    let v3Status: "success" | "failed" | "best-effort" | "skipped" = "skipped";

    try {
      // 1. Send to V2 queue (must succeed if handler is present)
      if (config.v2QueueHandler) {
        try {
          await config.v2QueueHandler(operation, orderId);
          v2Status = "success";
          logger.info(`[Dual-Write] V2 notification sent for order ${orderId} (${operation})`);
        } catch (v2Error) {
          logger.error(`[Dual-Write] V2 queue notification failed for order ${orderId}`, v2Error);
          v2Status = "failed";
          throw v2Error; // V2 failure blocks the response
        }
      } else {
        v2Status = "skipped";
      }

      // 2. Send to V3 queue (best-effort, non-blocking)
      if (config.v3QueueHandler) {
        try {
          await config.v3QueueHandler(operation, orderId);
          v3Status = "success";
          logger.info(`[Dual-Write] V3 notification sent for order ${orderId} (${operation})`);
        } catch (v3Error) {
          logger.error(`[Dual-Write] V3 queue notification failed for order ${orderId} (non-blocking)`, v3Error);
          v3Status = "best-effort"; // Log but don't block V2
        }
      } else {
        v3Status = "skipped";
      }

      // 3. Log to sync_log table
      try {
        void config.syncLogRepository.recordSync({
          orderId,
          operation,
          v2_status: v2Status,
          v3_status: v3Status === "best-effort" ? "failed" : v3Status,
          resolved: v2Status === "success",
        });
      } catch (logError) {
        logger.error(`[Dual-Write] Failed to log sync operation for order ${orderId}`, logError);
        // Don't fail the dual-write if logging fails
      }

      return {
        v2Status,
        v3Status,
        orderId,
        operation,
      };
    } catch (error) {
      // Log final sync state with failure
      try {
        void config.syncLogRepository.recordSync({
          orderId,
          operation,
          v2_status: v2Status,
          v3_status: v3Status === "best-effort" ? "failed" : v3Status,
          resolved: v2Status === "success",
        });
      } catch (logError) {
        logger.error(`[Dual-Write] Failed to log final sync state for order ${orderId}`, logError);
      }

      throw error;
    }
  };
}
