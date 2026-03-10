import { jsonResponse } from "../common/http/json.ts";

/**
 * Extract client IP from a fetch API Request object.
 * Handles IPv4, IPv6 (::1), and IPv6-mapped IPv4 (::ffff:127.0.0.1).
 */
function getClientIp(request: Request): string {
  // Try X-Forwarded-For header first (set by proxies/tunnels)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For is comma-separated list; take the first (client) IP
    return forwarded.split(",")[0]?.trim() || "";
  }

  // Fall back to cf-connecting-ip (set by Cloudflare)
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  // If no headers, we're likely localhost (direct connection or Tunnel)
  return "127.0.0.1";
}

/**
 * Check if an IP address is localhost or private LAN.
 */
function isLocalOrPrivate(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.") ||
    ip === "localhost"
  );
}

export type AppHandler = (request: Request) => Promise<Response>;

/**
 * Wraps an app handler with auth middleware.
 * - All /api/* routes require X-App-Token header (except /api/auth/token)
 * - Localhost and private LAN IPs bypass auth
 * - Remote requests without valid token get 401
 * - /api/portal/* routes have their own auth (skipped by this middleware)
 */
export function createAuthMiddleware(handler: AppHandler, sessionToken: string): AppHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // Allow /api/auth/token to be accessed without auth (it serves the token)
    if (url.pathname === "/api/auth/token") {
      return handler(request);
    }

    // Check if this is an /api route that needs auth
    if (url.pathname.startsWith("/api/")) {
      // Bypass for /api/portal/* (has its own JWT auth)
      if (url.pathname.startsWith("/api/portal/")) {
        return handler(request);
      }

      // Get client IP
      const clientIp = getClientIp(request);
      const isLocal = isLocalOrPrivate(clientIp);

      // If not local, require X-App-Token header
      if (!isLocal) {
        const token = request.headers.get("x-app-token");
        if (!token || token !== sessionToken) {
          return jsonResponse(401, { error: "Unauthorized" });
        }
      }
    }

    // All other routes (including /health) pass through
    return handler(request);
  };
}
