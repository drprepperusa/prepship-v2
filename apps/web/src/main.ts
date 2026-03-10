import { createWebApp } from "./app/web-app.ts";
import { startHttpServer } from "./app/server.ts";
import { resolveWebPublicDir } from "../../../packages/shared/src/config/repo-paths.ts";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4010";
const port = Number.parseInt(process.env.WEB_PORT ?? "4011", 10);
const publicDir = resolveWebPublicDir(import.meta.url, process.env);
const app = createWebApp({ apiBaseUrl, publicDir });

startHttpServer(app, port).then(() => {
  console.log(`PrepshipV2 web listening on http://127.0.0.1:${port}`);
});
