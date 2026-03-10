import type { WorkerConfig } from "../config/worker-config.ts";
import { OrderSyncJob } from "../modules/orders/order-sync-job.ts";

export async function runWorker(config: WorkerConfig): Promise<void> {
  if (!config.syncEnabled) {
    console.log("[worker] sync disabled; V1 remains the active sync owner");
    return;
  }

  const jobs = [new OrderSyncJob()];

  for (const job of jobs) {
    await job.run({ now: new Date() });
  }
}

