const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 4014;
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3001';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// API Proxy: forward /api requests to backend
app.use('/api', async (req, res) => {
  const path = req.path === '/' ? '/api' : `/api${req.path}`;
  const url = new URL(path, API_BASE);
  
  // Copy query params
  for (const [key, value] of Object.entries(req.query)) {
    url.searchParams.set(key, value);
  }

  try {
    const token = process.env.SESSION_TOKEN || 'dev-only-insecure-token-change-me';
    console.log(`[API PROXY] GET ${url} | Params: ${JSON.stringify(req.query)} | Token: ${token.substring(0, 20)}...`);
    
    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        'X-App-Token': token,
        'Host': 'localhost:3001',  // Force localhost hostname for API
      },
    };
    delete options.headers.host;  // Remove old host header

    const apiRes = await fetch(url, {
      ...options,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const contentType = apiRes.headers.get('content-type');
    const data = contentType?.includes('application/json')
      ? await apiRes.json()
      : await apiRes.text();

    res.status(apiRes.status);
    res.set('Content-Type', contentType || 'application/json');
    res.send(data);
  } catch (error) {
    console.error('[API PROXY]', error.message);
    res.status(502).json({ error: 'Backend API unreachable' });
  }
});

// SPA fallback: serve index.html for client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[React Server] Listening on port ${PORT}`);
  console.log(`[API Proxy] Forwarding requests to ${API_BASE}`);
});
