import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapApi } from "./app/bootstrap.ts";
import { startHttpServer } from "./app/server.ts";

// Load .env file if it exists (from project root)
const envPath = resolve(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  const lines = envContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=");
      if (key) {
        process.env[key] = value;
      }
    }
  }
} catch {
  // .env file doesn't exist, use existing process.env
}

const { config, app } = bootstrapApi(process.env, {});

startHttpServer(app, config.port).then(() => {
  console.log(`PrepshipV2 API listening on http://127.0.0.1:${config.port}`);
  console.log(`[Note] Authentication delegated to Cloudflare Access`);
});

