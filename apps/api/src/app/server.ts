import { createServer, type Server } from "node:http";

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

    const response = await handler(request);
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

