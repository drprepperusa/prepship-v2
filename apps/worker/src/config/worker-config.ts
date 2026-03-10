export interface WorkerConfig {
  syncEnabled: boolean;
}

export function loadWorkerConfig(env = process.env): WorkerConfig {
  return {
    syncEnabled: env.WORKER_SYNC_ENABLED === "1" || env.WORKER_SYNC_ENABLED === "true",
  };
}

