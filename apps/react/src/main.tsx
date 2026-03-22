import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { apiClient } from './api/client'

// Initialize API client with session token
const sessionToken = import.meta.env.VITE_SESSION_TOKEN || 'b05b4996d27144788a085477e5db30fbe2e057c7029ab2617647704bf3a07c75'
apiClient.setToken(sessionToken)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
