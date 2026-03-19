// ═══════════════════════════════════════════════
//  PrepShip — Entry Point (ES Module)
//  Imports all modules and boots the app
// ═══════════════════════════════════════════════

import { state } from './state.js';
import { escHtml, fmtWeight, trunc, showToast } from './utils.js';
import { COLS, clientPalette, carrierLogo } from './constants.js';
import { fetchValidatedJson } from './api-client.js';
import {
  parseClearAndRefetchResult,
  parseClientDtoList,
  parseInitDataDto,
} from './api-contracts.js';
import { loadRbMarkups, renderSettingsRbMarkups } from './markups.js';
import { loadStores, getStoreName, loadCarrierAccounts } from './stores.js';
import { loadCounts, buildSidebarCounts, renderSidebarSections, selectStatus } from './sidebar.js';
import { buildTableHead, buildColDropdown, loadColPrefs, updateBatchBar, updateStats, setKbRow, toggleSkuSort } from './table.js';
import { fetchOrders, filterOrders, renderOrders } from './orders.js';
import { startSyncPoller } from './sync-poller.js';
import { startPolling } from './polling.js';
import { updateProfitEstimate, showBatchPanel } from './batch.js?v=20260318-2';
import { initAnalysisView } from './analysis-ui.js';
import { initBillingView } from './billing-ui.js';
import { loadInventoryView } from './inventory-ui.js';
import { loadDailyStrip } from './daily-strip.js';

// ── Import all modules so their window.X exports fire ──────────────────────
import './labels.js';
import './panel.js';
import './rate-browser.js';
import './order-detail.js';
import './packages-ui.js';
import './locations-ui.js';
import './manifests.js';
import { hydrateQueueFromDB, setQueueClientId } from './print-queue.js';

// ══════════════════════════════════════════════
//  VIEW ROUTER
// ══════════════════════════════════════════════
export function showView(v) {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('show');
  const views = ['orders','rates','inventory','locations','packages','analysis','settings','billing'];
  views.forEach(n => {
    const el = document.getElementById('view-' + n);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById('view-' + v);
  if (el) el.style.display = v === 'orders' ? 'flex' : 'block';
  document.querySelectorAll('.sidebar-tool-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.ss-header, .ss-store').forEach(el => el.classList.remove('active'));
  const tool = document.getElementById('tool-' + v);
  if (tool) tool.classList.add('active');
  document.getElementById('topbarActions').style.display  = v === 'orders' ? 'flex' : 'none';
  document.getElementById('paginationBar').style.display  = v === 'orders' ? 'flex' : 'none';
  const viewTitleMap = {
    rates:'Rates', inventory:'Inventory', locations:'Locations',
    packages:'Packages', analysis:'Analysis', settings:'Settings', billing:'Billing',
  };
  if (v !== 'orders') {
    const vt = document.getElementById('viewTitle');
    if (vt && viewTitleMap[v]) vt.textContent = viewTitleMap[v];
  }
  if (v === 'inventory') loadInventoryView();
  if (v === 'locations') window.loadLocations?.();
  if (v === 'packages')  window.loadPackages?.();
  if (v === 'settings')  { updateProfitEstimate(); renderSettingsRbMarkups(); }
  if (v === 'analysis')  initAnalysisView();
  if (v === 'billing')   initBillingView();
}
window.showView = showView;

// ══════════════════════════════════════════════
//  ZOOM
// ══════════════════════════════════════════════
export function setZoom(pct) {
  const zl = document.getElementById('zoomLabel');
  if (zl) zl.textContent = pct + '%';
  localStorage.setItem('prepship_zoom', pct);
  document.querySelectorAll('.zoom-opt').forEach(el =>
    el.classList.toggle('active', parseInt(el.dataset.z) === pct)
  );
  const zm = document.getElementById('zoomMenu');
  if (zm) zm.style.display = 'none';

  // On mobile, zoom control is hidden — applying body.zoom causes the gray dead
  // space at the bottom and breaks column widths. Reset any stale zoom and bail.
  if (window.matchMedia('(max-width:768px)').matches) {
    document.body.style.zoom   = '';
    document.body.style.height = '';
    return;
  }

  document.body.style.zoom   = pct + '%';
  // Compensate height: body.zoom scales visual output by pct/100, which would push
  // the bottom of the page (incl. pagination bar) off-screen. Setting height to
  // 100vh / (pct/100) means the post-zoom visual height exactly equals 100vh.
  document.body.style.height = (10000 / pct).toFixed(2) + 'vh';
}
export function toggleZoomMenu() {
  const m = document.getElementById('zoomMenu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
window.setZoom       = setZoom;
window.toggleZoomMenu = toggleZoomMenu;

// printPicklist lives in orders.js (SKU-aggregated version)

export function copyAddr(addr) {
  navigator.clipboard?.writeText(addr.replace(/\\n/g, '\n'))
    .then(() => showToast('📋 Address copied'))
    .catch(() => showToast('⚠ Copy failed'));
}
export function copyOrderNum(num) {
  navigator.clipboard?.writeText(num).then(() => showToast(`📋 Copied: ${num}`)).catch(() => {
    const el = document.createElement('textarea');
    el.value = num; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    showToast(`📋 Copied: ${num}`);
  });
}
window.copyAddr     = copyAddr;
window.copyOrderNum = copyOrderNum;

export async function printSelected() {
  if (!state.selectedOrders.size) {
    // Open the queue panel to show what's already queued
    if (typeof window.toggleQueuePanel === 'function') window.toggleQueuePanel();
    return;
  }
  // Batch-send selected orders to print queue
  showToast(`⏳ Sending ${state.selectedOrders.size} order${state.selectedOrders.size !== 1 ? 's' : ''} to print queue…`);
  let sent = 0;
  let failed = 0;
  for (const orderId of state.selectedOrders) {
    const order = state.allOrders.find(o => o.orderId === orderId);
    if (!order) continue;
    const label = order.label;
    if (!label?.labelUrl) {
      failed++;
      continue;
    }
    const items = order.items || [];
    const sku = items.length === 1 ? items[0].sku : null;
    const desc = items.length === 1 ? items[0].name : null;
    const qty = items.reduce((s, i) => s + (i.quantity || 1), 0);
    const multiSkus = items.length > 1 ? items.map(i => ({ sku: i.sku, description: i.name, qty: i.quantity || 1 })) : null;
    const skuGroupId = sku ? `SKU:${sku}` : `ORDER:${orderId}`;
    try {
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: String(orderId),
          order_number: order.orderNumber,
          client_id: window._queueClientId || 1,
          label_url: label.labelUrl,
          sku_group_id: skuGroupId,
          primary_sku: sku,
          item_description: desc,
          order_qty: qty,
          multi_sku_data: multiSkus,
        }),
      });
      if (res.ok) sent++;
      else failed++;
    } catch (e) { failed++; }
  }
  const msg = sent > 0
    ? `✅ ${sent} order${sent !== 1 ? 's' : ''} added to print queue${failed > 0 ? ` (${failed} skipped — no label)` : ''}`
    : `⚠ No orders added — ${failed} skipped (create labels first)`;
  showToast(msg);
  if (sent > 0 && typeof window.hydrateQueueFromDB === 'function') {
    await window.hydrateQueueFromDB(window._queueClientId || 1);
  }
}
export function clearSelection() {
  state.selectedOrders.forEach(id => {
    const row = document.getElementById(`row-${id}`);
    if (row) row.classList.remove('row-selected', 'row-panel-open');
    const cb = document.querySelector(`#row-${id} input[type=checkbox]`);
    if (cb) cb.checked = false;
  });
  state.selectedOrders.clear();
  updateBatchBar();
  window.closePanel?.();
}
window.printSelected  = printSelected;
window.clearSelection = clearSelection;

export function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.toggle('show');
}
window.toggleSidebar = toggleSidebar;

export function toggleOrder(id, cb) {
  if (cb.checked) {
    state.selectedOrders.add(id);
    document.getElementById(`row-${id}`)?.classList.add('row-selected');
  } else {
    state.selectedOrders.delete(id);
    document.getElementById(`row-${id}`)?.classList.remove('row-selected', 'row-panel-open');
  }
  updateBatchBar();
  if (state.selectedOrders.size >= 2) showBatchPanel();
  else if (state.selectedOrders.size === 0) window.closePanel?.();
}
window.toggleOrder = toggleOrder;

// ══════════════════════════════════════════════
//  KEYBOARD NAVIGATION
// ══════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'Escape') {
    const odDrawer = document.getElementById('od-drawer');
    if (odDrawer?.classList.contains('open')) { window.closeOrderDetail?.(); return; }
    const rbModal = document.getElementById('rateBrowserModal');
    if (rbModal && rbModal.style.display !== 'none') { window.closeRateBrowser?.(); return; }
    if (state.currentPanelOrder) {
      const id = state.currentPanelOrder.orderId;
      state.selectedOrders.delete(id);
      const row = document.getElementById(`row-${id}`);
      if (row) row.classList.remove('row-selected', 'row-panel-open');
      const cb = document.querySelector(`#row-${id} input[type=checkbox]`);
      if (cb) cb.checked = false;
      updateBatchBar();
    }
    window.closePanel?.();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    const newIdx = Math.max(0, Math.min(state.filteredOrders.length - 1, state.kbRowIndex + dir));
    setKbRow(newIdx);
    const o = state.filteredOrders[newIdx];
    if (o) {
      const row = document.getElementById(`row-${o.orderId}`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  if (e.key === 'Enter' && state.kbRowIndex >= 0 && state.filteredOrders[state.kbRowIndex]) {
    window.toggleRowSelect?.(state.filteredOrders[state.kbRowIndex].orderId);
  }
  if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    if (state.kbRowIndex >= 0 && state.filteredOrders[state.kbRowIndex]) {
      copyOrderNum(state.filteredOrders[state.kbRowIndex].orderNumber);
    }
  }
});

// Click outside zoom menu to close
document.addEventListener('click', e => {
  const zm = document.getElementById('zoomMenu');
  if (zm && zm.style.display !== 'none' && !zm.contains(e.target) && !e.target.closest('#zoomLabel')) {
    zm.style.display = 'none';
  }
});

// ══════════════════════════════════════════════
//  BOOT / INIT
// ══════════════════════════════════════════════
(async () => {
  // Initialize colWidths from COLS config
  state.colWidths = Object.fromEntries(COLS.map(c => [c.key, c.width]));

  // Load column prefs first (needed before buildTableHead)
  await loadColPrefs();
  buildTableHead();
  buildColDropdown();

  // Load saved zoom
  const savedZoom = parseInt(localStorage.getItem('prepship_zoom') || '115');
  setZoom(savedZoom);

  // Re-evaluate zoom on resize/rotation so mobile→desktop and back work correctly
  window.addEventListener('resize', () => {
    const z = parseInt(localStorage.getItem('prepship_zoom') || '115');
    setZoom(z);
  });

  try {
    const initData = await fetchValidatedJson('/api/init-data', undefined, parseInitDataDto);
    console.log('✅ initData received. Keys:', Object.keys(initData), 'stores count:', initData.stores?.length);

    // Apply stores
    if (Array.isArray(initData.stores)) {
      console.log('✅ initData.stores is array, populating storeMap from', initData.stores.length, 'stores');
      initData.stores.forEach(s => state.storeMap[s.storeId] = s.storeName);
      localStorage.setItem('prepship_store_map', JSON.stringify(state.storeMap));
      console.log('✅ storeMap populated. Keys:', Object.keys(state.storeMap), 'storeMap:', state.storeMap);
    } else {
      console.warn('⚠️ WARNING: stores not returned in init-data. initData.stores:', initData.stores, 'typeof:', typeof initData.stores);
    }

    // Apply clients
    if (Array.isArray(initData.clients)) {
      state.clientMap = {};
      initData.clients.forEach(c => state.clientMap[c.clientId] = c.name);
      console.log('✅ clientMap populated:', state.clientMap);
    }

    // Apply counts
    if (initData.counts) buildSidebarCounts(initData.counts);
    renderSidebarSections();

    // Apply markups
    if (initData.markups && typeof initData.markups === 'object') {
      state.rbMarkups = initData.markups;
    } else {
      try {
        const s = localStorage.getItem('prepship_rb_markups');
        if (s) state.rbMarkups = JSON.parse(s);
      } catch {}
    }

    console.log('✅ init-data validation successful, skipping fallback path');
    // Apply carriers
    if (Array.isArray(initData.carriers) && initData.carriers.length) {
      state.carriersList = initData.carriers.filter(c => c.code !== 'voucher-generic');
      state.carrierAccountMap = {};
      state.carriersList.forEach(c => {
        // Prefer pre-set _label (from CARRIER_ACCOUNTS_V2 via init-data).
        // Only fall back to CARRIER_PREFIX mangling if _label is absent (legacy path).
        if (!c._label) {
          const CARRIER_PREFIX = { stamps_com:'USPS', ups_walleted:'UPS by SS', fedex_walleted:'FedEx One Bal' };
          const base = c.nickname || c.accountNumber || c.name || c.code;
          const pfx  = CARRIER_PREFIX[c.code];
          c._label   = pfx ? `${pfx} — ${base}` : base;
        }
        state.carrierAccountMap[c.shippingProviderId] = c._label;
      });
      localStorage.setItem('prepship_carrier_accounts', JSON.stringify(state.carrierAccountMap));
      localStorage.setItem('prepship_carriers_list', JSON.stringify(state.carriersList));
      renderSettingsRbMarkups();
    } else {
      loadCarrierAccounts();
    }
  } catch (e) {
    console.warn('[Init] init-data failed, falling back:', e.message, e);
    // IMPORTANT: loadCounts() needs storeMap to be populated first, so we must
    // await loadStores() before calling loadCounts()
    await Promise.all([loadRbMarkups(), loadStores()]);  // populate storeMap first
    await loadCounts();  // then load counts (which calls buildSidebarCounts with storeMap ready)
    // Fallback to fetch clients explicitly if init-data failed
    try {
      const clientsRes = await fetchValidatedJson('/api/clients', undefined, parseClientDtoList);
      state.clientMap = {};
      clientsRes.forEach(c => state.clientMap[c.clientId] = c.name);
      console.log('✅ clientMap populated (fallback):', state.clientMap);
    } catch (clientErr) {
      console.warn('⚠️ fallback clients fetch failed:', clientErr);
    }
    loadCarrierAccounts();
  }

  window.loadPackages?.();
  window.loadLocations?.();
  window.closePanel?.();
  selectStatus('awaiting_shipment');
  startSyncPoller();
  startPolling(); // Auto-refresh orders every 5 seconds

  // CRITICAL #1/#3: Hydrate print queue from DB on mount (DB = source of truth)
  // Use first available client (in real use, clientId is set per-session by user)
  const queueClientKeys = Object.keys(state.clientMap ?? {});
  const defaultQueueClientId = queueClientKeys.length > 0 ? Number(queueClientKeys[0]) : null;
  if (defaultQueueClientId) {
    setQueueClientId(defaultQueueClientId);
    hydrateQueueFromDB(defaultQueueClientId).catch(e => console.warn('[PrintQueue] Initial hydration failed:', e));
  }
  // Expose for other modules to call when client changes
  window.hydrateQueueFromDB = hydrateQueueFromDB;
  window.setQueueClientId = setQueueClientId;
  window._queueClientId = defaultQueueClientId;
})();

// ── Refetch All Rates ────────────────────────────────────────────────────────
async function refetchAllRates() {
  const btn = document.getElementById('btn-refetch-all-rates');
  const status = document.getElementById('refetch-status');
  
  btn.disabled = true;
  btn.style.opacity = '0.5';
  status.textContent = '⏳ Clearing cache and refetching rates...';
  status.style.display = 'block';
  
  try {
    const result = await fetchValidatedJson('/api/cache/clear-and-refetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'all' })
    }, parseClearAndRefetchResult);
    status.textContent = `✅ ${result.message} (${result.ordersQueued} orders queued)`;
    status.style.color = 'var(--success)';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      status.style.display = 'none';
      btn.disabled = false;
      btn.style.opacity = '1';
      status.style.color = 'var(--text3)';
    }, 5000);
  } catch (e) {
    status.textContent = `❌ Error: ${e.message}`;
    status.style.color = 'var(--error)';
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}
