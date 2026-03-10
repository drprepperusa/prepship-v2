// ═══════════════════════════════════════════════
//  PrepShip — Entry Point (ES Module)
//  Imports all modules and boots the app
// ═══════════════════════════════════════════════

import { state } from './state.js';
import { escHtml, fmtWeight, trunc, showToast } from './utils.js';
import { COLS, clientPalette, carrierLogo } from './constants.js';
import { loadRbMarkups, renderSettingsRbMarkups } from './markups.js';
import { loadStores, getStoreName, loadCarrierAccounts } from './stores.js';
import { loadCounts, buildSidebarCounts, renderSidebarSections, selectStatus } from './sidebar.js';
import { buildTableHead, buildColDropdown, loadColPrefs, updateBatchBar, updateStats, setKbRow, toggleSkuSort } from './table.js';
import { fetchOrders, filterOrders, renderOrders } from './orders.js';
import { startSyncPoller } from './sync-poller.js';
import { startPolling } from './polling.js';
import { updateProfitEstimate, showBatchPanel } from './batch.js';
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

export function printSelected() {
  if (!state.selectedOrders.size) return showToast('Select orders first');
  showToast(`🖨️ ${state.selectedOrders.size} labels queued — Phase 3`);
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
    const initData = await fetch('/api/init-data').then(r => r.json());

    // Apply stores
    if (Array.isArray(initData.stores)) {
      initData.stores.forEach(s => state.storeMap[s.storeId] = s.storeName);
      localStorage.setItem('prepship_store_map', JSON.stringify(state.storeMap));
    }

    // Apply clients
    if (Array.isArray(initData.clients)) {
      state.clientMap = {};
      initData.clients.forEach(c => state.clientMap[c.clientId] = c.name);
      localStorage.setItem('prepship_client_map', JSON.stringify(state.clientMap));
      console.log('✅ clientMap populated:', state.clientMap);
    } else {
      console.warn('⚠️ initData.clients missing or not array:', initData.clients);
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
    console.warn('[Init] init-data failed, falling back:', e.message);
    await Promise.all([loadRbMarkups(), loadStores(), loadCounts()]);
    // Fallback to fetch clients explicitly if init-data failed
    try {
      const clientsRes = await fetch('/api/clients').then(r => r.json());
      if (Array.isArray(clientsRes)) {
        state.clientMap = {};
        clientsRes.forEach(c => state.clientMap[c.clientId] = c.name);
        console.log('✅ clientMap populated (fallback):', state.clientMap);
      }
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
    const resp = await fetch('/api/cache/clear-and-refetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'all' })
    });
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    
    const result = await resp.json();
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
