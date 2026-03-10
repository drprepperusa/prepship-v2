import { state } from './state.js';
import { escHtml } from './utils.js';
import { fetchValidatedJson } from './api-client.js';
import { parseInitCountsDto } from './api-contracts.js';

// ═══════════════════════════════════════════════
//  SIDEBAR COUNTS
// ═══════════════════════════════════════════════
export async function loadCounts() {
  try {
    const data = await fetchValidatedJson('/api/counts', undefined, parseInitCountsDto);
    buildSidebarCounts(data);
    renderSidebarSections();
  } catch (e) { console.warn('loadCounts:', e); }
}

export function buildSidebarCounts({ byStatus, byStatusStore }) {
  console.log('buildSidebarCounts called. storeMap keys:', Object.keys(state.storeMap), 'storeMap:', state.storeMap);
  state.sidebarCounts = {};
  (byStatus || []).forEach(row => {
    state.sidebarCounts[row.orderStatus] = { total: row.cnt, stores: [] };
  });
  (byStatusStore || []).forEach(row => {
    const status = row.orderStatus;
    if (!state.sidebarCounts[status]) state.sidebarCounts[status] = { total: 0, stores: [] };
    const name = state.storeMap[row.storeId] || `Store ${row.storeId}`;
    if (!state.storeMap[row.storeId]) {
      console.warn(`⚠️ storeId ${row.storeId} not found in storeMap, using fallback "Store ${row.storeId}"`);
    }
    state.sidebarCounts[status].stores.push({ storeId: row.storeId, name, cnt: row.cnt });
  });
  // Note: per-section sort removed — renderSidebarSections uses global totals for consistent ordering
}

export function renderSidebarSections() {
  const statuses = ['awaiting_shipment', 'shipped', 'cancelled'];

  // Build a global total per store (across all statuses) for consistent ordering
  const globalTotals = {};
  Object.values(state.sidebarCounts).forEach(s => {
    (s.stores || []).forEach(store => {
      globalTotals[store.storeId] = (globalTotals[store.storeId] || 0) + store.cnt;
    });
  });

  statuses.forEach(status => {
    const data  = state.sidebarCounts[status] || { total: 0, stores: [] };
    const badge = document.getElementById(`ssb-${status}`);
    if (badge) badge.textContent = data.total > 0 ? data.total.toLocaleString() : '0';
    const storesEl = document.getElementById(`sss-${status}`);
    if (!storesEl) return;

    // Merge counts with full storeMap so all accounts show even at 0 orders
    const storeRows = [...data.stores];
    const seenIds   = new Set(storeRows.map(s => String(s.storeId)));
    Object.entries(state.storeMap).forEach(([sid, name]) => {
      if (!seenIds.has(String(sid))) {
        storeRows.push({ storeId: sid, name, cnt: 0 });
      }
    });
    // Sort by global total (same order in every section), then alpha for ties
    storeRows.sort((a, b) =>
      (globalTotals[b.storeId] || 0) - (globalTotals[a.storeId] || 0) ||
      a.name.localeCompare(b.name)
    );

    storesEl.innerHTML = storeRows.map(s =>
      `<div class="ss-store${s.cnt === 0 ? ' ss-store-zero' : ''}" id="sstore-${status}-${s.storeId}" onclick="selectStatus('${status}','${s.storeId}')">
        <span class="ss-store-name">${escHtml(s.name)}</span>
        <span class="ss-store-count">${s.cnt > 0 ? s.cnt.toLocaleString() : ''}</span>
      </div>`
    ).join('');
  });
}

export function toggleSection(status) {
  document.getElementById(`ss-${status}`)?.classList.toggle('expanded');
}

export function toggleMobileMenu() {
  const sb = document.querySelector('.sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  sb.classList.toggle('mobile-open');
  bd.classList.toggle('show');
}

// ═══════════════════════════════════════════════
//  SIDEBAR SELECTION
// ═══════════════════════════════════════════════
export function selectStatus(status, storeId = '') {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('show');

  state.currentStatus  = status;
  state.currentStoreId = storeId;

  document.querySelectorAll('.ss-header, .ss-store').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-tool-item').forEach(el => el.classList.remove('active'));

  if (!storeId) {
    const header = document.getElementById(`ssh-${status}`);
    if (header) header.classList.add('active');
  }
  if (storeId) {
    const storeEl = document.getElementById(`sstore-${status}-${storeId}`);
    if (storeEl) storeEl.classList.add('active');
  }

  const section = document.getElementById(`ss-${status}`);
  if (section) section.classList.add('expanded');

  const storeName = storeId ? state.storeMap[storeId] : null;
  const labels    = { awaiting_shipment:'Awaiting Shipment', shipped:'Shipped', cancelled:'Cancelled' };
  const title     = storeName
    ? `${labels[status] || status} · ${storeName}`
    : (labels[status] || status);
  document.getElementById('viewTitle').textContent = title;

  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  document.querySelector('.orders-wrap')?.scrollTo(0, 0);

  if (typeof window.showView === 'function') window.showView('orders');
  if (typeof window.fetchOrders === 'function') window.fetchOrders(1);
  if (typeof window.loadDailyStrip === 'function') window.loadDailyStrip();
}

export function handleSidebarSearch() {
  const q = document.getElementById('sidebarSearch').value.toLowerCase();
  document.getElementById('searchInput').value = q;
  if (typeof window.filterOrders === 'function') window.filterOrders();
}

// Expose to window for inline HTML calls
window.selectStatus      = selectStatus;
window.handleSidebarSearch = handleSidebarSearch;
window.toggleSection     = toggleSection;
window.toggleMobileMenu  = toggleMobileMenu;
