import { loadWorkerConfig } from "./config/worker-config.ts";
import { runWorker } from "./app/run-worker.ts";

runWorker(loadWorkerConfig());

