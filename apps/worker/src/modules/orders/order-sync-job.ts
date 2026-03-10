import type { Job, JobContext } from "../../jobs/job.ts";

export class OrderSyncJob implements Job {
  readonly name = "orders.sync.shadow";

  async run(context: JobContext): Promise<void> {
    console.log(`[worker] ${this.name} skipped at ${context.now.toISOString()} until cutover is approved`);
  }
}

