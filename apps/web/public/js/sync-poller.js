import { state } from './state.js';
import { showToast } from './utils.js';
import { loadCounts } from './sidebar.js';

// ═══════════════════════════════════════════════
//  SYNC POLLER
// ═══════════════════════════════════════════════

export function startSyncPoller() {
  pollSyncStatus();
  setInterval(pollSyncStatus, 10000);
}

export async function pollSyncStatus() {
  try {
    const r    = await fetch('/api/sync/status');
    const data = await r.json();
    updateSyncPill(data);
  } catch {}
}

export function updateSyncPill(data) {
  const pill = document.getElementById('syncPill');
  const text = document.getElementById('syncText');
  if (!pill || !text) return;
  pill.className = 'sync-pill';
  if (data.status === 'syncing') {
    pill.classList.add('syncing');
    const modeLabel = data.mode === 'full' ? 'Full sync' : 'Syncing';
    text.textContent = `${modeLabel}… (${data.page || 0})`;
  } else if (data.status === 'done') {
    pill.classList.add('done');
    const syncTime = data.lastSync
      ? new Date(data.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '—';
    text.textContent = `Last sync ${syncTime}`;
    // Only react once per sync event — compare lastSync timestamp to avoid
    // triggering re-renders on every poll of the same completed sync
    if (data.count > 0 && data.lastSync > state.lastSeenSyncTs) {
      state.lastSeenSyncTs = data.lastSync;
      loadCounts(); // always update sidebar counts
      // Clear shipped orders cache so new tracking numbers appear immediately
      if (typeof window.clearShippedOrdersCache === 'function') {
        window.clearShippedOrdersCache();
      }
      if (data.count <= 10) {
        // Small delta — quiet toast only, no flicker
        showToast(`🆕 ${data.count} order${data.count > 1 ? 's' : ''} updated`, 2500);
      } else if (!state.rateFetchActive) {
        // Large delta — silent refresh, but ONLY if rates aren't currently being fetched.
        if (typeof window.fetchOrders === 'function') {
          window.fetchOrders(state.currentPage, true);
        }
      }
    }
  } else if (data.status === 'error') {
    pill.classList.add('error');
    text.textContent = 'Sync error';
  } else {
    text.textContent = 'Last sync —';
  }
}

export async function triggerSync(full = false) {
  try {
    const url = full ? '/api/sync/trigger?full=1' : '/api/sync/trigger';
    await fetch(url, { method: 'POST' });
    document.getElementById('syncPill').className = 'sync-pill syncing';
    document.getElementById('syncText').textContent = full ? 'Full sync…' : 'Syncing…';
    showToast(full ? '🔄 Full re-sync triggered' : '🔄 Incremental sync triggered');
    setTimeout(pollSyncStatus, 2000);
    setTimeout(() => { pollSyncStatus(); loadCounts(); }, full ? 30000 : 5000);
  } catch {}
}

// Expose to window for inline HTML calls
window.triggerSync = triggerSync;
