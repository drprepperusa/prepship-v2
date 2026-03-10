import { defaultSecretsPath, loadTransitionalSecrets, type TransitionalSecrets } from "../../../../packages/shared/src/config/secrets-adapter.ts";

export type DbProvider = "sqlite" | "memory";

export interface AppConfig {
  port: number;
  dbProvider: DbProvider;
  sqliteDbPath: string | null;
  secretsPath: string;
  workerSyncEnabled: boolean;
  secrets: TransitionalSecrets;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function loadAppConfig(env = process.env): AppConfig {
  const dbProvider = (env.DB_PROVIDER ?? "sqlite") as DbProvider;
  const sqliteDbPath = env.SQLITE_DB_PATH;

  if (dbProvider !== "sqlite" && dbProvider !== "memory") {
    throw new Error(`Unsupported DB_PROVIDER: ${dbProvider}`);
  }

  if (dbProvider === "sqlite" && !sqliteDbPath) {
    throw new Error("SQLITE_DB_PATH is required when DB_PROVIDER=sqlite");
  }

  const secretsPath = env.PREPSHIP_SECRETS_PATH ?? defaultSecretsPath(env);

  return {
    port: Number.parseInt(env.API_PORT ?? "4010", 10),
    dbProvider,
    sqliteDbPath: sqliteDbPath ?? null,
    secretsPath,
    workerSyncEnabled: parseBooleanFlag(env.WORKER_SYNC_ENABLED, false),
    secrets: loadTransitionalSecrets(secretsPath),
  };
}
