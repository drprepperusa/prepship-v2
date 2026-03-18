/**
 * In-memory sliding-window rate limiter for PrepShip V2 API.
 *
 * Config defaults:
 *   - Window: 60 seconds
 *   - Limit:  100 requests per window per IP
 *
 * Applied to all /api/* routes.
 * /health is intentionally excluded.
 */

export interface RateLimitConfig {
  windowMs: number;   // Rolling window in milliseconds
  max: number;        // Max requests per window per IP
}

interface IpRecord {
  count: number;
  windowStart: number; // epoch ms when this window began
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000, // 1 minute
  max: 100,
};

export class RateLimiter {
  private readonly store = new Map<string, IpRecord>();
  private readonly config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Prune stale entries every window to prevent memory growth.
    setInterval(() => this.prune(), this.config.windowMs).unref();
  }

  /**
   * Check if the given IP has exceeded the rate limit.
   * Returns null if allowed, or a Response with 429 if exceeded.
   */
  check(ip: string, pathname: string): Response | null {
    // Only rate-limit /api/* routes.
    if (!pathname.startsWith("/api/")) return null;

    const now = Date.now();
    let record = this.store.get(ip);

    if (!record || now - record.windowStart >= this.config.windowMs) {
      // Start a fresh window.
      record = { count: 1, windowStart: now };
      this.store.set(ip, record);
      return null;
    }

    record.count += 1;

    const remaining = Math.max(0, this.config.max - record.count);
    const resetSec = Math.ceil((record.windowStart + this.config.windowMs - now) / 1000);

    if (record.count > this.config.max) {
      console.error(
        `[rate-limit] EXCEEDED ip=${ip} path=${pathname} count=${record.count} window=${this.config.windowMs}ms`,
      );
      return new Response(
        JSON.stringify({ error: "Too Many Requests", retryAfter: resetSec }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": String(this.config.max),
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(resetSec),
            "X-RateLimit-Reset": String(Math.ceil((record.windowStart + this.config.windowMs) / 1000)),
          },
        },
      );
    }

    return null;
  }

  /** Add rate-limit headers to a successful response. */
  annotate(response: Response, ip: string): Response {
    const record = this.store.get(ip);
    if (!record) return response;

    const now = Date.now();
    const remaining = Math.max(0, this.config.max - record.count);
    const resetSec = Math.ceil((record.windowStart + this.config.windowMs - now) / 1000);

    const headers = new Headers(response.headers);
    headers.set("X-RateLimit-Limit", String(this.config.max));
    headers.set("X-RateLimit-Remaining", String(remaining));
    headers.set("X-RateLimit-Reset", String(Math.ceil((record.windowStart + this.config.windowMs) / 1000)));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  private prune(): void {
    const now = Date.now();
    for (const [ip, record] of this.store.entries()) {
      if (now - record.windowStart >= this.config.windowMs) {
        this.store.delete(ip);
      }
    }
  }
}

/** Singleton instance used by the server. */
export const rateLimiter = new RateLimiter();
