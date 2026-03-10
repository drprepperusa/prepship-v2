import path from "node:path";
import { fileURLToPath } from "node:url";

export function repoRootFromModule(metaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "../../../..");
}

export function resolveV1RepoRoot(metaUrl: string, env = process.env): string {
  const configured = env.PREPSHIP_V1_ROOT?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(repoRootFromModule(metaUrl), "../prepship");
}

export function resolveWebPublicDir(metaUrl: string, env = process.env): string {
  const configured = env.PREPSHIP_WEB_PUBLIC_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "../public");
}
