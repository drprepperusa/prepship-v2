// ═══════════════════════════════════════════════
//  POLLING — Auto-refresh orders every 5 seconds
// ═══════════════════════════════════════════════

import { state } from './state.js';
import { applyOrdersData, loadOrdersData } from './orders.js';
import { didOrdersResponseChange } from './orders-sync.js';

const POLL_INTERVAL_MS = 2000; // 2 seconds — faster rate updates during initial load
let pollingActive = false;
let pollingTimer = null;
let lastPollTime = 0;

// Fetch fresh orders with current filters
async function fetchFreshOrders() {
  try {
    return await loadOrdersData(state.currentPage || 1, {
      bypassShippedCache: true,
      requestInit: {
      headers: { 'X-App-Token': window.APP_TOKEN || '' },
      },
    });
  } catch (e) {
    console.warn('[Polling] fetch error:', e.message);
    return null;
  }
}

// Update orders state and re-render rows that changed
function applyPollingUpdates(freshData) {
  if (!freshData || !freshData.orders) return;

  const previousData = {
    orders: state.allOrders,
    total: state.totalOrders,
    pages: state.totalPages,
    page: state.currentPage,
  };

  if (!didOrdersResponseChange(previousData, freshData)) return;

  applyOrdersData(freshData, state.currentPage || 1, true);
  console.log(`[Polling] Updated orders at ${new Date().toLocaleTimeString()}`);
}

// Main polling loop
async function runPoll() {
  const now = Date.now();
  // Avoid running too frequently (min 1s between polls)
  if (now - lastPollTime < 1000) return;
  lastPollTime = now;

  // Skip polling if:
  // - View is not 'orders'
  // - User is in a modal (rate browser, etc.)
  // - User is editing (cursor in input)
  const rateBrowserModal = document.getElementById('rateBrowserModal');
  const panelOpen = document.getElementById('orderPanel')?.style.display !== 'none';
  const isEditing = document.activeElement?.tagName === 'INPUT';
  
  if (rateBrowserModal?.style.display !== 'none' || isEditing) {
    // Still polling, but don't update UI while user is interacting
    return;
  }

  const freshData = await fetchFreshOrders();
  if (freshData) {
    applyPollingUpdates(freshData);
  }
}

// Start polling
export function startPolling() {
  if (pollingActive) return;
  pollingActive = true;
  
  // Run immediately, then every 5s
  runPoll();
  pollingTimer = setInterval(runPoll, POLL_INTERVAL_MS);
  console.log('[Polling] Started (5s interval)');
}

// Stop polling
export function stopPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingActive = false;
  console.log('[Polling] Stopped');
}

// Expose to window
window.startPolling = startPolling;
window.stopPolling = stopPolling;
