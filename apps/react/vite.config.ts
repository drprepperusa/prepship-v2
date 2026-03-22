import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const sessionToken = process.env.SESSION_TOKEN ?? 'dev-only-insecure-token-change-me'
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4010'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@prepshipv2/contracts': path.resolve(__dirname, '../../packages/contracts/src'),
    },
  },
  server: {
    port: 4014,
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        headers: {
          'X-App-Token': sessionToken,
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  define: {
    'import.meta.env.VITE_SESSION_TOKEN': JSON.stringify(sessionToken),
  },
})
