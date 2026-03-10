import { createServer, type Server } from "node:http";

async function readRequestBody(req: Parameters<typeof createServer>[0] extends (req: infer T, ...args: unknown[]) => unknown ? T : never): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

export function startHttpServer(handler: (request: Request) => Promise<Response>, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const origin = `http://${req.headers.host ?? `127.0.0.1:${port}`}`;
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readRequestBody(req);
      const request = new Request(new URL(req.url ?? "/", origin), {
        method: req.method,
        headers: req.headers as HeadersInit,
        body,
      });

      const response = await handler(request);
      res.statusCode = response.status;

      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }

      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(message);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}
