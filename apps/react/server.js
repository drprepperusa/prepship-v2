import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 4012;
const distDir = path.join(__dirname, 'dist');

const server = http.createServer((req, res) => {
  let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);

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
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
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
  console.log(`PrepShip V3 running on http://localhost:${PORT}`);
  console.log(`Serving from: ${distDir}`);
});
