// ═══════════════════════════════════════════════════════════════════
//  PrepShip — Print Queue Module
//  CRITICAL #1:  GET /api/queue on mount (DB is source of truth)
//  CRITICAL #2:  Atomic add-to-queue via POST /api/queue/add
//  CRITICAL #3:  localStorage = cache only, always hydrate from DB on mount
//  CRITICAL #4:  ShipStation 404/410 = user-facing error, no caching
//  CRITICAL #5:  Async PDF merge with polling for progress
// ═══════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { showToast } from './utils.js';

const LS_KEY = 'prepship_print_queue_cache';

// ─── Queue State ─────────────────────────────────────────────────────────────

// Internal state (do NOT use this directly for UI — always hydrate from DB)
let queueState = {
  orders: [],       // PrintQueueEntry[]
  clientId: null,   // Current client filter
  isOpen: false,
};

// ─── CRITICAL #3: localStorage cache helpers ──────────────────────────────────

function saveToCache(orders, clientId) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ orders, clientId, savedAt: Date.now() }));
  } catch (e) {
    console.warn('[PrintQueue] localStorage save failed:', e);
  }
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cache is only good for 5 minutes (fallback only)
    if (Date.now() - parsed.savedAt > 5 * 60 * 1000) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

// ─── CRITICAL #1: Hydrate from DB on mount ────────────────────────────────────

export async function hydrateQueueFromDB(clientId) {
  if (!clientId) return;
  queueState.clientId = clientId;

  try {
    const res = await fetch(`/api/queue?client_id=${clientId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    queueState.orders = data.queuedOrders ?? [];
    saveToCache(queueState.orders, clientId);  // Update cache from DB result
    renderQueuePanel();
    updateQueueBadge();
  } catch (err) {
    console.warn('[PrintQueue] DB hydration failed, falling back to cache:', err);

    // CRITICAL #3: localStorage is fallback ONLY (not source of truth)
    const cached = loadFromCache();
    if (cached && cached.clientId === clientId) {
      queueState.orders = cached.orders;
      renderQueuePanel();
      updateQueueBadge();
      showToast('⚠ Queue loaded from cache (offline mode) — data may be stale', 4000);
    }
  }
}

// ─── CRITICAL #2: Add to queue (atomic via API) ───────────────────────────────

export async function sendToQueue(orderId, orderNumber, labelUrl, skuGroupId, primarySku, itemDescription, orderQty, multiSkuData) {
  if (!queueState.clientId) {
    showToast('⚠ No client selected');
    return false;
  }

  // Validate label URL is present (spec: fail before calling API)
  if (!labelUrl) {
    showToast('⚠ No label URL — create a label first');
    return false;
  }

  try {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: String(orderId),
        order_number: orderNumber,
        client_id: queueState.clientId,
        label_url: labelUrl,
        sku_group_id: skuGroupId || `ORDER:${orderId}`,
        primary_sku: primarySku || null,
        item_description: itemDescription || null,
        order_qty: orderQty || 1,
        multi_sku_data: multiSkuData || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.already_queued) {
      showToast(`ℹ Order ${orderNumber || orderId} already in print queue`);
      return true;
    }

    showToast(`✅ Order ${orderNumber || orderId} added to print queue`);

    // Refresh from DB to keep state in sync (CRITICAL #3)
    await hydrateQueueFromDB(queueState.clientId);
    return true;
  } catch (err) {
    showToast(`❌ Failed to add to queue: ${err.message}`);
    return false;
  }
}

// ─── Remove single entry ──────────────────────────────────────────────────────

async function removeFromQueue(entryId) {
  if (!confirm('Remove this order from the print queue?')) return;
  try {
    const res = await fetch(`/api/queue/${entryId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: queueState.clientId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('✅ Removed from queue');
    await hydrateQueueFromDB(queueState.clientId);
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

// ─── Clear all ────────────────────────────────────────────────────────────────

async function clearQueue() {
  const count = queueState.orders.filter(o => o.status === 'queued').length;
  if (count === 0) { showToast('Queue is already empty'); return; }
  if (!confirm(`Clear all ${count} order${count !== 1 ? 's' : ''} from print queue?\n\nOrders remain shipped — this only removes them from the queue.`)) return;

  try {
    const res = await fetch('/api/queue/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: queueState.clientId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    showToast(`✅ Cleared ${data.cleared_count} order${data.cleared_count !== 1 ? 's' : ''} from queue`);
    await hydrateQueueFromDB(queueState.clientId);
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

// ─── CRITICAL #5: Print All — Async PDF merge with polling ───────────────────

async function printAll(entryIds) {
  if (!entryIds || entryIds.length === 0) {
    showToast('⚠ No orders to print');
    return;
  }

  // Check for reprints (CRITICAL: reprint confirmation per spec)
  const reprints = queueState.orders.filter(o => entryIds.includes(o.queue_entry_id) && o.print_count > 0);
  if (reprints.length > 0) {
    const confirmed = confirm(
      `${reprints.length} of ${entryIds.length} order${reprints.length !== 1 ? 's are' : ' is'} a reprint.\n\nContinue and print all including reprints?`
    );
    if (!confirmed) return;
  }

  // Show progress UI
  const progressEl = document.getElementById('pq-progress');
  const progressBar = document.getElementById('pq-progress-bar');
  const progressText = document.getElementById('pq-progress-text');
  const printAllBtn = document.getElementById('pq-print-all-btn');

  if (progressEl) progressEl.style.display = 'block';
  if (printAllBtn) { printAllBtn.disabled = true; printAllBtn.textContent = '⏳ Starting…'; }

  try {
    // Start the async merge job
    const startRes = await fetch('/api/queue/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: queueState.clientId,
        queue_entry_ids: entryIds,
        merge_headers: true,
      }),
    });

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${startRes.status}`);
    }

    const { job_id: jobId, total } = await startRes.json();

    // Poll for status
    let done = false;
    let errorCount = 0;
    while (!done) {
      await new Promise(r => setTimeout(r, 600));

      let statusData;
      try {
        const statusRes = await fetch(`/api/queue/print/status/${jobId}`);
        if (!statusRes.ok) throw new Error(`Status HTTP ${statusRes.status}`);
        statusData = await statusRes.json();
      } catch (pollErr) {
        errorCount++;
        if (errorCount > 10) throw new Error('Lost connection to server during merge');
        continue;
      }

      const pct = statusData.progress ?? 0;
      const msg = statusData.message ?? `Merging ${statusData.current ?? 0} of ${total}…`;

      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressText) progressText.textContent = msg;

      if (statusData.status === 'done') {
        done = true;

        // Download the merged PDF
        const dlRes = await fetch(`/api/queue/print/download/${jobId}`);
        if (!dlRes.ok) throw new Error('Failed to download merged PDF');

        const blob = await dlRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = statusData.file_name || `batch_print_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);

        showToast(`✅ ${total} label${total !== 1 ? 's' : ''} printed — downloading PDF…`);
        await hydrateQueueFromDB(queueState.clientId);

      } else if (statusData.status === 'error') {
        throw new Error(statusData.error || 'PDF merge failed');
      }
    }

  } catch (err) {
    // CRITICAL #4: ShipStation 404/410 errors are surfaced in the merged PDF
    // as error pages, but we also show a toast for the overall failure
    showToast(`❌ Print failed: ${err.message}`);
  } finally {
    if (progressEl) progressEl.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (printAllBtn) { printAllBtn.disabled = false; printAllBtn.textContent = '🖨️ Print All'; }
  }
}

// ─── Queue Panel UI ───────────────────────────────────────────────────────────

export function toggleQueuePanel() {
  queueState.isOpen = !queueState.isOpen;
  const panel = document.getElementById('print-queue-panel');
  const btn = document.getElementById('pq-toggle-btn');
  if (panel) panel.style.display = queueState.isOpen ? 'flex' : 'none';
  if (btn) {
    const count = queueState.orders.filter(o => o.status === 'queued').length;
    btn.textContent = queueState.isOpen ? '✕ Close Queue' : `🖨️ Print Queue${count > 0 ? ` (${count})` : ''}`;
  }

  // Refresh from DB when opening panel
  if (queueState.isOpen && queueState.clientId) {
    hydrateQueueFromDB(queueState.clientId);
  }
}

function updateQueueBadge() {
  const count = queueState.orders.filter(o => o.status === 'queued').length;
  const btn = document.getElementById('pq-toggle-btn');
  if (btn) {
    const label = count > 0 ? `🖨️ Print Queue (${count})` : '🖨️ Print Queue';
    if (!queueState.isOpen) btn.textContent = label;
    // Highlight if items waiting
    btn.style.background = count > 0 ? 'var(--warning, #f59e0b)' : '';
    btn.style.color = count > 0 ? '#000' : '';
  }

  const badge = document.getElementById('pq-badge');
  if (badge) {
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

function renderQueuePanel() {
  const container = document.getElementById('pq-order-list');
  if (!container) return;

  const queued = queueState.orders.filter(o => o.status === 'queued');

  // Update summary
  const summaryEl = document.getElementById('pq-summary');
  if (summaryEl) {
    const totalQty = queued.reduce((s, o) => s + (o.order_qty ?? 1), 0);
    const skuGroups = new Set(queued.map(o => o.sku_group_id)).size;
    summaryEl.innerHTML = `
      <div class="pq-stat"><span class="pq-stat-val">${queued.length}</span><span class="pq-stat-lbl">Orders</span></div>
      <div class="pq-stat"><span class="pq-stat-val">${totalQty}</span><span class="pq-stat-lbl">Total Qty</span></div>
      <div class="pq-stat"><span class="pq-stat-val">${skuGroups}</span><span class="pq-stat-lbl">SKU Groups</span></div>
    `;
  }

  if (queued.length === 0) {
    container.innerHTML = `<div class="pq-empty">📭 Queue is empty<br><small>Click "Send to Queue" on any order with a label</small></div>`;
    return;
  }

  // Group by sku_group_id
  const groups = {};
  for (const order of queued) {
    const gid = order.sku_group_id;
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(order);
  }

  let html = '';
  for (const [groupId, orders] of Object.entries(groups)) {
    const first = orders[0];
    const groupQty = orders.reduce((s, o) => s + (o.order_qty ?? 1), 0);
    const label = first.primary_sku || groupId;
    const desc = first.item_description ? ` — ${first.item_description}` : '';
    const entryIds = JSON.stringify(orders.map(o => o.queue_entry_id));

    html += `
      <div class="pq-group">
        <div class="pq-group-header">
          <span class="pq-group-label">${escHtml(label)}${escHtml(desc)}</span>
          <span class="pq-group-meta">${orders.length} order${orders.length !== 1 ? 's' : ''} · Qty ${groupQty}</span>
          <div class="pq-group-actions">
            <button class="btn btn-ghost btn-xs" onclick="window.printQueueGroup(${escHtml(JSON.stringify(entryIds))})">🖨️ Print Group</button>
          </div>
        </div>
        <div class="pq-group-orders">
    `;

    for (const order of orders) {
      const printedNote = order.print_count > 0 ? ` <span class="pq-reprint-badge">Reprint #${order.print_count}</span>` : '';
      const queuedDate = new Date(order.queued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      html += `
        <div class="pq-order-row" id="pq-order-${order.queue_entry_id}">
          <span class="pq-order-num">Order #${escHtml(order.order_number || order.order_id)}${printedNote}</span>
          <span class="pq-order-qty">Qty: ${order.order_qty ?? 1}</span>
          <span class="pq-order-time">${queuedDate}</span>
          <button class="pq-remove-btn" onclick="window.removeFromPrintQueue('${order.queue_entry_id}')" title="Remove from queue">✕</button>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Update Print All button state
  const allIds = queued.map(o => o.queue_entry_id);
  const printAllBtn = document.getElementById('pq-print-all-btn');
  if (printAllBtn) {
    printAllBtn.onclick = () => printAll(allIds);
    printAllBtn.disabled = queued.length === 0;
  }
}

// Escape HTML helper (queue panel uses this)
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getQueueCount() {
  return queueState.orders.filter(o => o.status === 'queued').length;
}

export function setQueueClientId(clientId) {
  queueState.clientId = clientId;
}

// Expose to window for inline HTML onclick handlers
window.toggleQueuePanel = toggleQueuePanel;
window.removeFromPrintQueue = removeFromQueue;
window.clearPrintQueue = clearQueue;
window.printQueueGroup = (idsJson) => {
  try {
    const ids = JSON.parse(idsJson);
    printAll(ids);
  } catch (e) {
    showToast('❌ Error parsing group IDs');
  }
};
window.sendToQueue = sendToQueue;
