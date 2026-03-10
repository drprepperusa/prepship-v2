// ═══════════════════════════════════════════════
//  POLLING — Auto-refresh orders every 5 seconds
// ═══════════════════════════════════════════════

import { state } from './state.js';
import { renderOrders } from './orders.js';

const POLL_INTERVAL_MS = 2000; // 2 seconds — faster rate updates during initial load
let pollingActive = false;
let pollingTimer = null;
let lastPollTime = 0;

// Fetch fresh orders with current filters
async function fetchFreshOrders() {
  try {
    const params = new URLSearchParams({ pageSize: 50, page: state.currentPage || 1 });
    if (state.currentStatus)  params.set('orderStatus', state.currentStatus);
    if (state.currentStoreId) params.set('storeId', state.currentStoreId);
    
    // Include date range if set
    const range = window.getDateRange?.();
    if (range?.start) params.set('dateStart', range.start.toISOString());
    if (range?.end)   params.set('dateEnd',   range.end.toISOString());

    const resp = await fetch(`/api/orders?${params.toString()}`, {
      headers: { 'X-App-Token': window.APP_TOKEN || '' },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.warn('[Polling] fetch error:', e.message);
    return null;
  }
}

// Detect if an order changed (comparing key fields)
function orderChanged(oldOrder, newOrder) {
  if (!oldOrder || !newOrder) return true;
  
  // Fields that matter for UI updates (V2 API structure)
  const keys = [
    'orderStatus', 'orderNumber', 'orderTotal', 'shippingAmount',
    'carrierCode', 'serviceCode',
    'label.trackingNumber', 'label.carrierCode', 'label.cost',
    'externalShipped', 'selectedRate'
  ];
  
  // Simple field comparison
  const simpleFields = ['orderStatus', 'orderNumber', 'orderTotal', 'shippingAmount', 'carrierCode', 'serviceCode', 'externalShipped'];
  if (simpleFields.some(k => oldOrder[k] !== newOrder[k])) return true;
  
  // Nested field comparison (label, selectedRate)
  if ((oldOrder.label?.trackingNumber || null) !== (newOrder.label?.trackingNumber || null)) return true;
  if ((oldOrder.label?.carrierCode || null) !== (newOrder.label?.carrierCode || null)) return true;
  if ((oldOrder.selectedRate?.cost || null) !== (newOrder.selectedRate?.cost || null)) return true;
  
  return false;
}

// Update orders state and re-render rows that changed
function applyPollingUpdates(freshData) {
  if (!freshData || !freshData.orders) return;

  const freshMap = new Map(freshData.orders.map(o => [o.orderId, o]));
  const oldMap = new Map((state.orders || []).map(o => [o.orderId, o]));
  
  let hasChanges = false;
  let changedCount = 0;

  // Track new/updated orders
  freshData.orders.forEach(freshOrder => {
    const oldOrder = oldMap.get(freshOrder.orderId);
    if (!oldOrder) {
      hasChanges = true;
      changedCount++;
    } else if (orderChanged(oldOrder, freshOrder)) {
      hasChanges = true;
      changedCount++;
    }
  });

  if (!hasChanges) return; // No changes detected
  
  // Update state
  state.allOrders = freshData.orders;
  state.totalOrders = freshData.total || 0;
  state.totalPages = freshData.pages || 1;

  // Re-apply current filters/sorts to maintain sort order
  window.filterOrders?.();
  
  // Re-render (maintains checkboxes and panel state via class names in DOM)
  renderOrders(true); // skipRates=true to avoid re-fetching rates on every update
  
  console.log(`[Polling] Updated ${changedCount} orders at ${new Date().toLocaleTimeString()}`);
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
