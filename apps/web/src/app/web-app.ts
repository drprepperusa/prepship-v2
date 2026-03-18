import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export interface WebAppDependencies {
  apiBaseUrl: string;
  publicDir: string;
  fetchImpl?: FetchLike;
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function getContentType(pathname: string): string {
  return CONTENT_TYPES[extname(pathname)] ?? "application/octet-stream";
}

function resolvePublicPath(publicDir: string, pathname: string): string | null {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filename = resolve(join(publicDir, safePath));
  const root = resolve(publicDir);
  return filename.startsWith(root) ? filename : null;
}

async function serveStatic(publicDir: string, pathname: string): Promise<Response> {
  const filename = resolvePublicPath(publicDir, pathname);

  if (filename == null) {
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  try {
    const body = await readFile(filename);
    
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": getContentType(filename),
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

async function proxyApiRequest(
  request: Request,
  apiBaseUrl: string,
  fetchImpl: FetchLike,
): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, apiBaseUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");
  
  // Inject SESSION_TOKEN from environment into every proxied API request.
  // This happens server-side; the token never reaches the browser.
  const sessionToken = process.env.SESSION_TOKEN;
  if (sessionToken) {
    headers.set("x-app-token", sessionToken);
  }
  
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetchImpl(target.toString(), {
    method: request.method,
    headers,
    body,
  });

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export function createWebApp(dependencies: WebAppDependencies) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyApiRequest(request, dependencies.apiBaseUrl, fetchImpl);
    }

    return serveStatic(dependencies.publicDir, url.pathname);
  };
}
