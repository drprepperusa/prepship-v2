import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { repoRootFromModule, resolveV1RepoRoot } from "./repo-paths.ts";

export interface TransitionalSecrets {
  shipstation?: {
    api_key?: string;
    api_secret?: string;
    api_key_v2?: string;
  };
  portal?: {
    setupToken?: string;
  };
}

export function defaultSecretsPath(env = process.env): string {
  const repoRoot = repoRootFromModule(import.meta.url);
  const localPath = path.resolve(repoRoot, "secrets.json");
  if (existsSync(localPath)) {
    return localPath;
  }
  return path.resolve(resolveV1RepoRoot(import.meta.url, env), "secrets.json");
}

export function loadTransitionalSecrets(secretsPath: string): TransitionalSecrets {
  const raw = readFileSync(secretsPath, "utf8");
  return JSON.parse(raw) as TransitionalSecrets;
}
