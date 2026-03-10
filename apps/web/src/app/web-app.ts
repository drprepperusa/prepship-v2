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

async function serveStatic(publicDir: string, pathname: string, appToken?: string): Promise<Response> {
  const filename = resolvePublicPath(publicDir, pathname);

  if (filename == null) {
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  try {
    let body = await readFile(filename);
    
    // Inject auth token into index.html
    if (pathname === "/" && appToken) {
      let html = body.toString("utf-8");
      
      // Inject fetch interceptor before </head>
      const fetchInterceptor = `<script>
(function(){
  const _T='${appToken}';
  const _F=window.fetch.bind(window);
  window.fetch=function(url,opts){
    if(typeof url==='string'&&url.startsWith('/api')){
      opts=Object.assign({},opts);
      const h=opts.headers instanceof Headers?opts.headers:new Headers(opts.headers||{});
      h.set('X-App-Token',_T);
      opts.headers=h;
    }
    return _F(url,opts);
  };
})();
</script>`;
      
      html = html.replace("</head>", `${fetchInterceptor}</head>`);
      body = Buffer.from(html, "utf-8");
    }
    
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": getContentType(filename),
        "cache-control": pathname === "/" || pathname.endsWith(".html") ? "no-cache" : "public, max-age=300",
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
  let cachedAppToken: string | null = null;

  async function getAppToken(): Promise<string> {
    // Return cached token if available
    if (cachedAppToken) {
      return cachedAppToken;
    }

    try {
      const response = await fetchImpl(`${dependencies.apiBaseUrl}/api/auth/token`);
      const data = (await response.json()) as { token?: string };
      if (data.token) {
        cachedAppToken = data.token;
        return cachedAppToken;
      }
    } catch (error) {
      console.error("Failed to fetch app token:", error);
    }

    // Fallback to empty string if unable to fetch token
    // (API might be down, but web can still serve static files)
    return "";
  }

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

    // Get app token for injection into HTML
    const appToken = await getAppToken();
    return serveStatic(dependencies.publicDir, url.pathname, appToken);
  };
}
