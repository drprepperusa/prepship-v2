import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 4012;
const distDir = path.join(__dirname, 'dist');
const API_BASE = 'http://127.0.0.1:4010';

const server = http.createServer((req, res) => {
  // Proxy API requests
  if (req.url.startsWith('/api')) {
    console.log(`[API PROXY] ${req.method} ${req.url} → ${API_BASE}${req.url}`);
    
    const apiUrl = new URL(API_BASE + req.url);
    const clientReq = http.request(apiUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: apiUrl.host
      }
    }, (clientRes) => {
      console.log(`[API PROXY] Response: ${clientRes.statusCode}`);
      res.writeHead(clientRes.statusCode, clientRes.headers);
      clientRes.pipe(res);
    });

    clientReq.on('error', (err) => {
      console.error('[API PROXY] Error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API unavailable', message: err.message }));
    });

    req.pipe(clientReq);
    return;
  }

  // Serve static files
  const pathname = req.url.split('?')[0];
  let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname);

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Serve index.html for SPA routing
      filePath = path.join(distDir, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
      };

      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`PrepShip React preview running on http://localhost:${PORT}`);
  console.log(`Serving from: ${distDir}`);
  console.log(`API proxy: /api/* → ${API_BASE}`);
});
