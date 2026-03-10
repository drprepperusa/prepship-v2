import crypto from "node:crypto";
import { bootstrapApi } from "./app/bootstrap.ts";
import { startHttpServer } from "./app/server.ts";
import { createAuthMiddleware } from "./app/auth-middleware.ts";

// Generate session token for this process (regenerated on every restart)
const sessionToken = crypto.randomBytes(32).toString("hex");
console.log(`[Auth] Session token generated: ${sessionToken.substring(0, 20)}...`);

const { config, app } = bootstrapApi(process.env, {}, sessionToken);

// Wrap the app with auth middleware
const authedApp = createAuthMiddleware(app, sessionToken);

startHttpServer(authedApp, config.port).then(() => {
  console.log(`PrepshipV2 API listening on http://127.0.0.1:${config.port}`);
  console.log(`[Auth] All /api routes protected with X-App-Token header (bypassed for localhost)`);
});

