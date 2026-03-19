import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import './index.css'
import App from './App.tsx'

// Global fetch interceptor: Add X-App-Token to all requests
const API_TOKEN = "dev-only-insecure-token-change-me"
const originalFetch = window.fetch
window.fetch = function(input, init) {
  const headers = {
    "x-app-token": API_TOKEN,
    ...(init?.headers || {}),
  }
  return originalFetch.call(window, input, { ...init, headers })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
