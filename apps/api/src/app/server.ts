import { createServer, type Server } from "node:http";
import { rateLimiter } from "./rate-limit.ts";

export function startHttpServer(handler: (request: Request) => Promise<Response>, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const origin = `http://${req.headers.host ?? `127.0.0.1:${port}`}`;
    const method = req.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';
    
    const requestInit: RequestInit & { duplex?: string } = {
      method,
      headers: req.headers as HeadersInit,
    };
    
    if (hasBody) {
      requestInit.body = req;
      requestInit.duplex = 'half';
    }
    
    const request = new Request(new URL(req.url ?? "/", origin), requestInit);

    // ── Rate limiting (100 req/min per IP, /api/* only) ──────────────────────
    // Prefer CF-Connecting-IP (set by Cloudflare) → x-forwarded-for → socket IP
    const clientIp =
      (req.headers["cf-connecting-ip"] as string | undefined) ??
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    const limitResponse = rateLimiter.check(clientIp, new URL(req.url ?? "/", origin).pathname);
    if (limitResponse) {
      res.statusCode = 429;
      for (const [key, value] of limitResponse.headers.entries()) {
        res.setHeader(key, value);
      }
      res.end(await limitResponse.text());
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    let response = await handler(request);

    // Annotate successful /api/* responses with rate-limit headers.
    response = rateLimiter.annotate(response, clientIp);

    // Add CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");

    res.statusCode = response.status;

    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    const body = await response.text();
    res.end(body);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

