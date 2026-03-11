import { state } from './state.js';
import { escHtml, fmtDate, fmtWeight, ageHours, ageStr, showToast, getDateRangePreset } from './utils.js';
import { COLS, CARRIER_NAMES, SERVICE_NAMES, carrierLogo, clientPalette, clientBadge, fmtCarrier, formatCarrierDisplay, isBlockedRate } from './constants.js';
import { applyCarrierMarkup, applyRbMarkup, priceDisplay, pickBestRate, isResidential, isOrionRate, formatOrionRateDisplay } from './markups.js';
import { getStoreName, getShipAcct } from './stores.js';
import { buildTableHead, applyColVisibility, sortFilteredOrders, updatePagination, updateBatchBar, updateStats, getOrderPrimarySku, getOrderTotalQty } from './table.js';
import { loadCounts } from './sidebar.js';
import { getTrackingUrl, getExpedited } from './carriers.js';
import { fetchValidatedJson } from './api-client.js';
import { parseBulkCachedRatesResponse, parseListOrdersResponse, parseLiveRatesResponse, parseOrderIdsResponse, parseOrderPicklistResponse, parseProductBulkMap } from './api-contracts.js';
import { getOrderBillingProviderId, getOrderDimensions, getOrderRequestedService, getOrderStoreId } from './order-data.js';

// Fire-and-forget: persist best rate to DB so page reloads skip re-fetching
function saveBestRate(orderId, best, dimsStr) {
  if (!best || !orderId) return;
  fetch(`/api/orders/${orderId}/best-rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ best, dims: dimsStr }),
  }).catch(() => {});
}

// ═══════════════════════════════════════════════
//  FETCH ORDERS
// ═══════════════════════════════════════════════

// localStorage cache: shipped orders are static, so we cache them client-side
// to avoid redundant DB queries. Cache key includes storeId to isolate per-client.
function getShippedOrdersCacheKey(storeId, page) {
  return `prepship_shipped_${storeId || 'all'}_p${page || 1}`;
}

function getServerBuildVersion() {
  const scriptEl = document.querySelector('script[src*="/js/app.js"]');
  if (!scriptEl) return null;
  const src = scriptEl.getAttribute('src');
  const match = src.match(/v=(\d+)/);
  return match ? match[1] : null;
}

function getShippedOrdersFromCache(storeId, page) {
  try {
    const key = getShippedOrdersCacheKey(storeId, page);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { ts, data, buildVer } = JSON.parse(cached);
    // Cache valid for 24h (shipped orders never change)
    // BUT invalidate if server restarted (buildVer changed)
    const currentBuildVer = getServerBuildVersion();
    if (currentBuildVer && buildVer && buildVer !== currentBuildVer) {
      // Server restarted — cache is stale (shipments may have been synced)
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

function setShippedOrdersInCache(storeId, data, page) {
  try {
    const key = getShippedOrdersCacheKey(storeId, page);
    const buildVer = getServerBuildVersion();
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data, buildVer }));
  } catch {
    // localStorage quota exceeded or disabled — ignore
  }
}

// Clear shipped orders cache when shipments sync completes.
// Called by sync-poller after shipments sync to ensure fresh tracking numbers.
window.clearShippedOrdersCache = function(storeId = null) {
  try {
    if (storeId) {
      const key = getShippedOrdersCacheKey(storeId);
      localStorage.removeItem(key);
    } else {
      // Clear all shipped order caches
      const keys = Object.keys(localStorage).filter(k => k.startsWith('prepship_shipped_'));
      keys.forEach(k => localStorage.removeItem(k));
    }
  } catch {
    // Ignore errors
  }
};

export async function fetchOrders(page = 1, skipRatesHint = false) {
  state._fetchSkipRates = skipRatesHint;
  state.preSkuSortSnapshot = null;
  setLoading(true);
  try {
    const params = new URLSearchParams({ pageSize: 50, page });
    if (state.currentStatus)  params.set('orderStatus', state.currentStatus);
    if (state.currentStoreId) params.set('storeId', state.currentStoreId);
    // Server-side date filter
    const range = getDateRange();
    if (range?.start) params.set('dateStart', range.start.toISOString());
    if (range?.end)   params.set('dateEnd',   range.end.toISOString());

    let data = null;
    
    // ─── OPTIMIZATION: Use cached shipped orders to avoid DB query ───
    // Shipped orders are immutable, so cached results are safe.
    // Only fetch from server if: (a) not shipped, or (b) cache miss.
    if (state.currentStatus === 'shipped') {
      const cached = getShippedOrdersFromCache(state.currentStoreId, page);
      if (cached) {
        data = parseListOrdersResponse(cached);
      } else {
        data = await fetchValidatedJson('/api/orders?' + params, undefined, parseListOrdersResponse);
        setShippedOrdersInCache(state.currentStoreId, data, page);
      }
    } else {
      // Non-shipped orders: always fetch fresh (awaiting_shipment, cancelled, etc.)
      data = await fetchValidatedJson('/api/orders?' + params, undefined, parseListOrdersResponse);
    }

    state.allOrders   = data.orders || [];
    if (state.currentPanelOrder && !state.allOrders.find(o => o.orderId === state.currentPanelOrder.orderId)) {
      if (typeof window.closePanel === 'function') window.closePanel();
    }
    state.totalOrders = data.total || 0;
    state.totalPages  = data.pages || 1;
    state.currentPage = page;

    populateSkuFilter();
    filterOrders();
    updatePagination();
  } catch (e) {
    setLoading(false, '⚠️ Error: ' + e.message);
  }
}

export function setLoading(on, errMsg) {
  const ld = document.getElementById('loadingState');
  const tb = document.getElementById('ordersTable');
  const em = document.getElementById('emptyState');
  if (!ld) return;
  if (on) {
    ld.innerHTML = '<div class="spinner"></div><div style="font-size:12px;margin-top:4px">Loading orders…</div>';
    ld.style.display = 'block';
    if (tb) tb.style.display = 'none';
    if (em) em.style.display = 'none';
  } else if (errMsg) {
    ld.innerHTML = `<div style="color:var(--red);font-size:12.5px">${errMsg}</div>`;
    ld.style.display = 'block';
  } else {
    ld.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════
//  SKU FILTER
// ═══════════════════════════════════════════════
export function populateSkuFilter() {
  const skus = [...new Set(state.allOrders.flatMap(o => o.items.map(i => i.sku)).filter(Boolean))].sort();
  const sel  = document.getElementById('skuFilter');
  if (!sel) return;
  const cur  = sel.value;
  sel.innerHTML = '<option value="">All SKUs</option>' +
    skus.map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${s}</option>`).join('');
}

// ═══════════════════════════════════════════════
//  FILTER (client-side)
// ═══════════════════════════════════════════════
export function onDateFilterChange() {
  const val  = document.getElementById('dateFilter')?.value;
  const wrap = document.getElementById('customDateWrap');
  if (wrap) wrap.style.display = val === 'custom' ? 'flex' : 'none';
  fetchOrders(1);  // re-fetch from server with date range applied
}

function getDateRange() {
  const val = document.getElementById('dateFilter')?.value;
  if (!val) return null;
  
  if (val === 'custom') {
    const f = document.getElementById('dateFrom')?.value;
    const t = document.getElementById('dateTo')?.value;
    return getDateRangePreset('custom', { start: f, end: t });
  }
  
  return getDateRangePreset(val);
}

export function filterOrders() {
  const q   = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const sku = document.getElementById('skuFilter')?.value;

  state.filteredOrders = state.allOrders.filter(o => {
    if (q) {
      const hit = o.orderNumber.toLowerCase().includes(q) ||
        (o.shipTo?.name || '').toLowerCase().includes(q) ||
        (o.customerEmail || '').toLowerCase().includes(q) ||
        o.items.some(i => (i.sku || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (sku && !o.items.some(i => i.sku === sku)) return false;
    return true;
  });

  sortFilteredOrders();
  const skipRates = state._fetchSkipRates;
  state._fetchSkipRates = false;
  renderOrders(skipRates);
}

function isException(o) {
  if (o.orderStatus !== 'awaiting_shipment') return false;
  return ageHours(o.orderDate) > 48 || !(o.weight?.value > 0);
}

// ═══════════════════════════════════════════════
//  RENDER TABLE
// ═══════════════════════════════════════════════
export function renderOrders(skipRates = false) {
  setLoading(false);
  const tbody = document.getElementById('ordersBody');
  const table = document.getElementById('ordersTable');
  const empty = document.getElementById('emptyState');

  if (!state.filteredOrders.length) {
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (table) table.style.display = 'table';
  if (empty) empty.style.display = 'none';

  // Debug: Check if clientMap is populated at render time
  if (!Object.keys(state.clientMap || {}).length) {
    console.warn('⚠️ WARNING: clientMap is empty during renderOrders!', state.clientMap);
  }

  const visColCount = COLS.filter(c => !state.hiddenCols.has(c.key)).length;
  let prevSkuGroup = null;

  tbody.innerHTML = state.filteredOrders.map((o, idx) => {
    let groupHeader = '';
    if (state.skuSortActive) {
      const thisSku   = getOrderPrimarySku(o);
      const thisQty   = getOrderTotalQty(o);
      const thisGroup = thisSku + '||' + thisQty;
      if (thisGroup !== prevSkuGroup) {
        prevSkuGroup = thisGroup;
        const grpIds  = state.filteredOrders.filter(ord =>
          getOrderPrimarySku(ord) === thisSku && getOrderTotalQty(ord) === thisQty
        ).map(ord => ord.orderId);
        const grpCount = grpIds.length;
        const grpItem  = o.items.find(i => !i.adjustment);
        const grpName  = grpItem?.name || grpItem?.sku || 'Unknown';
        const grpIdJson = JSON.stringify(grpIds);
        const skuJson = JSON.stringify(thisSku);
        const qtyJson = JSON.stringify(thisQty);
        groupHeader = `<tr class="sku-group-header">
          <td colspan="${visColCount}" style="padding:5px 12px;background:var(--ss-blue-bg);border-top:2px solid var(--ss-blue);border-bottom:1px solid var(--border);font-size:11.5px;font-weight:700;color:var(--ss-blue)">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;pointer-events:auto" onclick='event.stopPropagation();selectSkuGroupAndShowBatch(${grpIdJson},${skuJson},${qtyJson})'>
              <input type="checkbox" style="width:16px;height:16px;accent-color:var(--ss-blue);cursor:pointer">
              📦 ${escHtml(grpName)} &nbsp;·&nbsp; Qty ${thisQty} per order &nbsp;·&nbsp; <span style="font-weight:400;color:var(--text2)">${grpCount} order${grpCount !== 1 ? 's' : ''}</span>
            </label>
          </td>
        </tr>`;
      }
    }

    const items      = o.items.filter(i => !i.adjustment);
    const uniqueSkus = [...new Set(items.map(i => i.sku).filter(Boolean))];
    const isMultiSku = uniqueSkus.length > 1;
    const item       = isMultiSku ? { name: `Multi-SKU (${uniqueSkus.length} products)`, sku: 'MULTI', imageUrl: null } : (items[0] || {});
    const extra      = !isMultiSku && items.length > 1 ? ` ×${items.reduce((s, i) => s + (i.quantity || 1), 0)}` : '';
    const chk        = state.selectedOrders.has(o.orderId) ? 'checked' : '';
    const isOpen     = state.currentPanelOrder?.orderId === o.orderId;
    const isKb       = state.kbRowIndex === idx;
    const rowCls     = (state.selectedOrders.has(o.orderId) ? ' row-selected' : '') + (isOpen ? ' row-panel-open' : '') + (isKb ? ' row-kb-focus' : '') + (isMultiSku ? ' multi-sku-row' : '') + (isException(o) ? ' row-exception' : '');
    const hrs        = ageHours(o.orderDate);
    const ageText    = ageStr(o.orderDate);
    const ageDot     = hrs > 48 ? 'var(--red)' : hrs > 24 ? '#d97706' : 'var(--green)';
    const storeName  = getStoreName(o);
    const cc         = fmtCarrier(o);
    const custCarrierName = getShipAcct(o) || '—';
    const city       = o.shipTo?.city || '';
    const stateStr   = o.shipTo?.state || '';
    const zip        = o.shipTo?.postalCode || '';
    const shiptoStr  = [city, stateStr, zip].filter(Boolean).join(', ');
    const skuCode    = item.sku || '';
    const skuHtml    = skuCode ? `<span class="sku-link">${escHtml(skuCode)}</span>` : '—';
    const clientName = o.clientName || 'Untagged';
    const clientCol  = clientBadge(clientName);
    const totalQty   = items.reduce((s, i) => s + i.quantity, 0);
    const weightHtml = o.weight?.value > 0
      ? `<span style="font-size:12px;color:var(--text2)">${fmtWeight(o.weight.value)}</span>`
      : `<span style="color:var(--text3);font-size:12px">—</span>`;

    // Pre-compute merged items for multi-SKU (used by both itemname + sku columns)
    let mergedItems = [];
    if (isMultiSku) {
      for (const i of items) {
        const key = (i.sku || '') + '|' + (i.name || '');
        const ex  = mergedItems.find(m => m._key === key);
        if (ex) { ex.quantity = (ex.quantity || 1) + (i.quantity || 1); }
        else     { mergedItems.push({ ...i, _key: key }); }
      }
    }

    const cells = COLS.map(c => {
      if (state.hiddenCols.has(c.key)) return '';
      switch (c.key) {
        case 'select':    return `<td data-col="select"><input type="checkbox" ${chk} onclick="event.stopPropagation();toggleCheckbox(${o.orderId},this.checked)" tabindex="-1"></td>`;
        case 'date': {
          const _pb = o.bestRate;
          const serviceCode = _pb?.serviceCode || getOrderRequestedService(o) || '';
          const expedited = getExpedited(serviceCode);
          const expeditedHtml = expedited
            ? `<div style="font-size:9.5px;font-weight:700;color:${expedited === '1-day' ? '#dc2626' : '#d97706'};margin-bottom:2px">${expedited === '1-day' ? '🔴 1-day' : '🟠 2-day'}</div>`
            : '';
          return `<td data-col="date" style="font-size:11.5px;color:var(--text2);white-space:nowrap"><div style="display:flex;flex-direction:column">${expeditedHtml}<div>${fmtDate(o.orderDate)}</div></div></td>`;
        }
        case 'client':    return `<td data-col="client">${clientCol}</td>`;
        case 'orderNum':  return `<td data-col="orderNum"><div class="order-num" style="display:flex;align-items:center;gap:4px;font-size:12px;min-width:0"><span class="od-order-link" onclick="event.stopPropagation();openOrderDetail(${o.orderId})" title="Open detail view" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.orderNumber}</span><span onclick="event.stopPropagation();copyOrderNum('${escHtml(o.orderNumber)}')" title="Copy" style="cursor:pointer;color:var(--text4);font-size:9px;opacity:.6;transition:opacity .1s;flex-shrink:0" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='.6'">⎘</span></div></td>`;
        case 'customer':  return `<td data-col="customer"><div class="customer-name">${escHtml(o.shipTo?.name || '—')}</div></td>`;
        case 'itemname': {
          const maxW = state.colWidths['itemname'] || 260;
          if (isMultiSku) {
            const visible  = mergedItems.slice(0, 5);
            const overflow = mergedItems.length - visible.length;
            const lines    = visible.map(i => {
              const img = i.imageUrl
                ? `<img src="${escHtml(i.imageUrl)}" loading="lazy" style="width:22px;height:22px;border-radius:3px;object-fit:cover;flex-shrink:0;cursor:zoom-in" onerror="this.style.display='none'" onmouseenter="showThumbPreview(this, event)" onmouseleave="hideThumbPreview()">`
                : `<span style="width:22px;height:22px;flex-shrink:0;background:var(--bg);border:1px solid var(--border);border-radius:3px;display:inline-block"></span>`;
              const qty = (i.quantity || 1) > 1
                ? `<span style="background:var(--ss-blue-bg);color:var(--ss-blue);font-size:9.5px;font-weight:700;padding:0 4px;border-radius:3px;flex-shrink:0">×${i.quantity}</span>`
                : '';
              return `<div style="display:flex;align-items:center;gap:5px;min-width:0">${img}<span style="display:flex;align-items:center;gap:3px;flex:1;min-width:0;overflow:hidden"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;min-width:0">${escHtml(i.name || i.sku || '—')}</span>${qty}</span></div>`;
            }).join('');
            const more = overflow > 0 ? `<div style="font-size:10.5px;color:var(--text3);padding-left:27px">+${overflow} more</div>` : '';
            return `<td data-col="itemname"><div style="display:flex;flex-direction:column;gap:3px;padding:3px 0;max-width:${maxW}px;overflow:hidden">${lines}${more}</div></td>`;
          }
          // Single-SKU (unchanged)
          const imgUrl = item.imageUrl;
          return `<td data-col="itemname" style="font-size:12px;color:var(--text)"><div class="cell-itemname" title="${escHtml(item.name || '—')}" style="display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;max-width:${maxW}px">${imgUrl ? `<img src="${escHtml(imgUrl)}" loading="lazy" style="width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0;cursor:zoom-in" onerror="this.style.display='none'" onmouseenter="showThumbPreview(this, event)" onmouseleave="hideThumbPreview()">` : ''}<span style="overflow:hidden;text-overflow:ellipsis">${escHtml(item.name || '—')}${extra ? `<span style="color:var(--text3);font-size:10.5px"> ${extra}</span>` : ''}</span></div></td>`;
        }
        case 'sku': {
          if (isMultiSku) {
            const visible  = mergedItems.slice(0, 5);
            const overflow = mergedItems.length - visible.length;
            const lines = visible.map(i =>
              `<div style="display:flex;align-items:center;height:22px;gap:3px;min-width:0">${i.sku ? `<span class="sku-link" style="font-size:11px">${escHtml(i.sku)}</span>` : '<span style="color:var(--text4);font-size:11px">—</span>'}</div>`
            ).join('');
            const more = overflow > 0 ? `<div style="height:14px"></div>` : '';
            return `<td data-col="sku"><div style="display:flex;flex-direction:column;gap:3px;padding:3px 0">${lines}${more}</div></td>`;
          }
          return `<td data-col="sku">${skuHtml}</td>`;
        }
        case 'qty':       return `<td data-col="qty" style="text-align:center;font-weight:700;color:var(--text2)">${totalQty > 1 ? `<span style="display:inline-block;padding:1px 6px;border:2px solid var(--red);border-radius:4px;color:var(--red)">${totalQty}</span>` : (totalQty || '—')}</td>`;
        case 'weight':    return `<td data-col="weight">${weightHtml}</td>`;
        case 'shipto':    return `<td data-col="shipto" style="font-size:11.5px;color:var(--text2)">${escHtml(shiptoStr || '—')}</td>`;
        case 'carrier': {
          // Check if order is shipped: either status=shipped OR has a label
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          if (isShipped) {
            if (o.externalShipped) return `<td data-col="carrier"><span style="font-size:10px;color:var(--text2)">Externally Shipped</span></td>`;
            return `<td data-col="carrier">${cc}</td>`;
          }
          const _pb  = o.bestRate;
          if (!_pb)  return `<td data-col="carrier"><div class="spin-center"><span class="spin-sm"></span></div></td>`;
          const _bcc  = _pb.carrierCode || '';
          const _bsc  = _pb.serviceCode || '';
          const _bsvc = SERVICE_NAMES[_bsc] || _bsc.replace(/_/g, ' ');
          return `<td data-col="carrier"><div style="display:flex;align-items:center;gap:6px;line-height:1.3">${carrierLogo(_bcc, 18)}<span style="font-size:10px;color:var(--text2)">${escHtml((_bsvc + '').substring(0, 26))}</span></div></td>`;
        }
        case 'custcarrier': {
          // Check if order is shipped: either status=shipped OR has a label
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          if (isShipped) {
            // Check if marked as externally shipped first
            if (o.externalShipped) {
              return `<td data-col="custcarrier" data-acct-name="Externally Shipped" style="white-space:nowrap"><div style="line-height:1.4"><div style="font-size:14px;font-weight:600;color:var(--text2)">Externally Shipped</div><div style="font-size:10px;color:var(--text3)" class="svc-label">$0.00</div></div></td>`;
            }
            // Check for selectedRate (actual rate used at label creation)
            if (o.selectedRate) {
              let acctName = o.selectedRate.providerAccountNickname || 'External';
              const _cost = parseFloat(o.selectedRate.cost || 0);
              return `<td data-col="custcarrier" data-acct-name="${escHtml(acctName)}" style="white-space:nowrap"><div style="line-height:1.4"><div style="font-size:14px;font-weight:600;color:var(--text2)">${escHtml(acctName)}</div><div style="font-size:10px;color:var(--text3)" class="svc-label">$${_cost.toFixed(2)}</div></div></td>`;
            }
            // No rate data available → eBay/Amazon/Walmart generated the label externally
            if (!o.label?.cost && !o.label?.trackingNumber && !o.label?.shippingProviderId && !o.selectedRate) {
              return `<td data-col="custcarrier" data-acct-name="Ext. label" style="white-space:nowrap"><span style="display:inline-block;background:#f0f0f0;color:#666;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;cursor:help" title="Label purchased outside ShipStation (eBay/Walmart/Amazon/etc.)">Ext. Label</span></td>`;
            }
            // For shipped orders: shippingProviderId is authoritative.
            // shippingProviderId → numeric spid → state.carriersList lookup → nickname.
            // Fall back to generic carrier name if shippingProviderId not set.
            let acctName = custCarrierName;
            if (o.label?.shippingProviderId) {
              const acct = state.carriersList.find(c => c.shippingProviderId === o.label.shippingProviderId);
              if (acct) acctName = acct._label || acct.nickname || acct.accountNumber || acct.name || custCarrierName;
            } else {
              // shippingProviderId not set — show generic carrier name
              const effectiveCode = o.label?.carrierCode || o.carrierCode;
              if (effectiveCode) acctName = CARRIER_NAMES[effectiveCode] || effectiveCode.replace(/_/g, ' ').toUpperCase();
            }
            return `<td data-col="custcarrier" data-acct-name="${escHtml(acctName)}" style="white-space:nowrap"><div style="line-height:1.4"><div style="font-size:14px;font-weight:600;color:var(--text2)">${escHtml(acctName)}</div><div style="font-size:10px;color:var(--text3)" class="svc-label"></div></div></td>`;
          }
          const _pb   = o.bestRate;
          if (_pb?._noDims) return `<td data-col="custcarrier" style="white-space:nowrap"><span style="font-size:10.5px;color:var(--text3)">— add dims</span></td>`;
          if (!_pb)   return `<td data-col="custcarrier" style="white-space:nowrap"><div class="spin-center"><span class="spin-sm"></span></div></td>`;
          const _bcc  = _pb.carrierCode || '';
          const _bsc  = _pb.serviceCode || '';
          const _bsvc = SERVICE_NAMES[_bsc] || _bsc.replace(/_/g, ' ');
          const _bacct = formatCarrierDisplay(_pb);
          return `<td data-col="custcarrier" style="white-space:nowrap"><div style="line-height:1.4"><div style="font-size:14px;font-weight:600;color:var(--text2)">${escHtml(_bacct)}</div><div style="font-size:10px;color:var(--text3)" class="svc-label">${escHtml((_bsvc + '').substring(0, 22))}</div></div></td>`;
        }
        case 'total':     return `<td data-col="total" style="font-weight:700;white-space:nowrap">$${(o.orderTotal || 0).toFixed(2)}</td>`;
        case 'bestrate': {
          // For shipped orders with label, show label cost
          if (o.label?.cost != null) {
            const _lc = o.label.cost || 0;
            const _lm = o.label.cost || 0; // TODO: apply carrier markup if needed
            return `<td data-col="bestrate" id="rate-${o.orderId}"><div style="display:flex;align-items:center;gap:6px"><div>${priceDisplay(_lc, _lm, { mainSize:'12px' })}</div></div></td>`;
          }
          // For shipped orders with selected rate (actual rate from label creation), show that
          if (o.selectedRate) {
            const _srj = o.selectedRate;
            const _bcc = _srj.carrierCode || '';
            const _rawCost = parseFloat(_srj.cost || 0);
            const _markedCost = applyCarrierMarkup(_srj);
            return `<td data-col="bestrate" id="rate-${o.orderId}"><div style="display:flex;align-items:center;gap:6px">${carrierLogo(_bcc, 18)}<div>${priceDisplay(_rawCost, _markedCost, { mainSize:'12px' })}</div></div></td>`;
          }
          // For shipped orders with no rate data
          if (o.orderStatus !== 'awaiting_shipment') return `<td data-col="bestrate" id="rate-${o.orderId}"><span style="color:var(--text3);font-size:11px">—</span></td>`;
          
          // For awaiting_shipment orders
          const _pb = o.bestRate;
          if (_pb?._noDims) return `<td data-col="bestrate" id="rate-${o.orderId}"><span style="font-size:10.5px;color:var(--text3)">— add dims</span></td>`;
          if (!_pb) return `<td data-col="bestrate" id="rate-${o.orderId}"><div class="spin-center"><span class="spin-sm"></span></div></td>`;
          const _bcc  = _pb.carrierCode || '';
          const _rawCost    = (_pb.shipmentCost || 0) + (_pb.otherCost || 0);
          const _markedCost = applyCarrierMarkup(_pb);
          return `<td data-col="bestrate" id="rate-${o.orderId}"><div style="display:flex;align-items:center;gap:6px">${carrierLogo(_bcc, 18)}<div>${priceDisplay(_rawCost, _markedCost, { mainSize:'12px' })}</div></div></td>`;
        }
        case 'margin': {
          // Check if order is shipped: either status=shipped OR has a label
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          if (isShipped) {
            // Shipped: show label cost markup if we have it
            const _lc = o.label?.cost || 0;
            const _lm = o.label?.cost || 0; // TODO: apply carrier markup if needed
            const _ldiff = _lm - _lc;
            if (_lc > 0 && _ldiff > 0) {
              return `<td data-col="margin" style="text-align:right"><span style="font-size:12px;font-weight:700;color:#16a34a">+$${_ldiff.toFixed(2)}</span></td>`;
            }
            return `<td data-col="margin" style="text-align:right;color:var(--text4);font-size:11px">—</td>`;
          }
          const _mpb = o.bestRate;
          if (_mpb?._noDims) return `<td data-col="margin" style="text-align:right;color:var(--text4);font-size:11px">—</td>`;
          if (!_mpb) return `<td data-col="margin" style="text-align:right"><div class="spin-center"><span class="spin-sm"></span></div></td>`;
          const _mRaw    = (_mpb.shipmentCost || 0) + (_mpb.otherCost || 0);
          const _mMarked = applyCarrierMarkup(_mpb);
          const _mDiff   = _mMarked - _mRaw;
          if (_mDiff <= 0) return `<td data-col="margin" style="text-align:right;color:var(--text4);font-size:11px">—</td>`;
          const _mPct = _mRaw > 0 ? Math.round((_mDiff / _mRaw) * 100) : 0;
          return `<td data-col="margin" style="text-align:right"><div style="line-height:1.3"><div style="font-size:12px;font-weight:700;color:#16a34a">+$${_mDiff.toFixed(2)}</div><div style="font-size:10px;color:var(--text3)">${_mPct}%</div></div></td>`;
        }
        case 'tracking': {
          // Use label tracking number
          const trackingNum = o.label?.trackingNumber;
          if (!trackingNum) return `<td data-col="tracking" style="font-size:11px;font-family:monospace"><span style="color:var(--text4)">—</span></td>`;
          
          // Determine carrier code for tracking URL
          let carrierCode = o.label?.carrierCode || o.bestRate?.carrierCode || o.carrierCode || '';
          
          const trackUrl = getTrackingUrl(carrierCode, trackingNum);
          if (trackUrl) {
            const _carrierCode = escHtml(carrierCode || '');
            return `<td data-col="tracking" style="font-size:11px;font-family:monospace"><span style="color:var(--ss-blue);cursor:pointer;text-decoration:underline;text-decoration-style:dotted" onclick="event.stopPropagation();showTrackingModal('${escHtml(trackUrl)}','${escHtml(trackingNum)}','${_carrierCode}')" title="Track package">${escHtml(trackingNum)}</span></td>`;
          }
          return `<td data-col="tracking" style="font-size:11px;font-family:monospace"><span style="color:var(--ss-blue);cursor:pointer" onclick="event.stopPropagation();navigator.clipboard.writeText('${escHtml(trackingNum)}').then(()=>showToast('Tracking # copied!'))" title="Click to copy">${escHtml(trackingNum)}</span></td>`;
        }
        case 'requested': return `<td data-col="requested" style="font-size:11px;color:var(--text3)">${escHtml(getOrderRequestedService(o) || '—')}</td>`;
        case 'age':       return `<td data-col="age"><div class="age-wrap"><span class="age-dot" style="background:${ageDot}"></span><span style="font-size:11px;color:${hrs > 48 ? 'var(--red)' : hrs > 24 ? '#d97706' : 'var(--text3)'}">${ageText}</span></div></td>`;
        
        // ═══════════════════════════════════════════════
        // TESTING COLUMNS (diagnostic)
        // ═══════════════════════════════════════════════
        case 'test_carrierCode': {
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          const cc = isShipped ? (o.selectedRate?.carrierCode || o.label?.carrierCode || o.carrierCode || '—') : (o.bestRate?.carrierCode || '—');
          return `<td data-col="test_carrierCode" style="font-size:14px;text-align:center;font-family:monospace;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px">${escHtml(cc)}</td>`;
        }
        case 'test_shippingProviderID': {
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          const spid = isShipped ? (o.selectedRate?.shippingProviderId || o.label?.shippingProviderId || '—') : (o.bestRate?.shippingProviderId || '—');
          return `<td data-col="test_shippingProviderID" style="font-size:14px;text-align:center;font-family:monospace;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px">${escHtml(String(spid))}</td>`;
        }
        case 'test_clientID': {
          const cid = o.clientId || '—';
          return `<td data-col="test_clientID" style="font-size:14px;text-align:center;font-family:monospace;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px">${escHtml(String(cid))}</td>`;
        }
        case 'test_serviceCode': {
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          const sc = isShipped ? (o.selectedRate?.serviceCode || o.label?.serviceCode || o.serviceCode || '—') : (o.bestRate?.serviceCode || '—');
          return `<td data-col="test_serviceCode" style="font-size:10px;font-family:monospace;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(sc)}">${escHtml(sc)}</td>`;
        }
        case 'test_bestRate': {
          const brj = o.bestRate;
          if (!brj) return `<td data-col="test_bestRate" style="font-size:10px;color:var(--text3)">—</td>`;
          const display = `${brj.carrierCode || '?'}|${brj.serviceCode || '?'}|$${((brj.shipmentCost || 0) + (brj.otherCost || 0)).toFixed(2)}`;
          return `<td data-col="test_bestRate" style="font-size:9px;font-family:monospace;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(JSON.stringify(brj))}">${escHtml(display)}</td>`;
        }
        case 'test_orderLocal': {
          const parts = [];
          if (o.weight?.value > 0) parts.push(`w:${o.weight.value}${o.weight.units?.[0] || 'oz'}`);
          if (o.label?.trackingNumber) parts.push(`track:✓`);
          if (o.bestRate) parts.push(`best:✓`);
          const display = parts.length ? parts.join(' ') : '—';
          return `<td data-col="test_orderLocal" style="font-size:9px;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(display)}">${escHtml(display)}</td>`;
        }
        case 'test_shippingAccount': {
          const isShipped = o.orderStatus !== 'awaiting_shipment' || (o.label?.trackingNumber && o.label?.carrierCode);
          const acctName = isShipped 
            ? (o.selectedRate?.providerAccountNickname || o.label?.carrierCode || '—')
            : '—';  // Awaiting shipment: account not selected yet
          return `<td data-col="test_shippingAccount" style="font-size:14px;text-align:center;color:var(--text2);background:var(--surface2);padding:4px 6px;border-radius:3px">${escHtml(acctName)}</td>`;
        }
        
        default:          return `<td data-col="${c.key}"></td>`;
      }
    }).join('');

    const _cp = clientPalette(storeName);
    const _pb = o.bestRate;
    const serviceCode = _pb?.serviceCode || getOrderRequestedService(o) || '';
    const expedited = getExpedited(serviceCode);
    const expeditedBg = expedited ? 'background:rgba(34,197,94,.08)' : '';
    return groupHeader + `<tr id="row-${o.orderId}" class="order-row${rowCls}" style="border-left:3px solid ${_cp.border};${expeditedBg}" onclick="toggleRowSelect(${o.orderId})" ondblclick="event.stopPropagation();window.open('https://ship.shipstation.com/orders/${o.orderId}','_blank')" onmouseenter="setKbRow(${idx})">${cells}</tr>`;
  }).join('');

  updateStats();
  applyColVisibility();

  const rateTh = document.querySelector('th[data-col="bestrate"]');
  if (rateTh) {
    const labelNode = [...rateTh.childNodes].find(n => n.nodeType === 3);
    const newLabel  = state.currentStatus !== 'awaiting_shipment' ? 'Selected Rate' : 'Best Rate';
    if (labelNode) labelNode.textContent = newLabel;
  }

  if (state.currentStatus !== 'awaiting_shipment') {
    state.filteredOrders.forEach(o => renderActualRateCell(o.orderId, o));
  } else if (!skipRates) {
    fetchCheapestRates(state.filteredOrders);
  }
}

// ═══════════════════════════════════════════════
//  RATE CELLS
// ═══════════════════════════════════════════════

/** Format delivery ETA from a rate object → "Mon 3/4" or "3 days" or '' */
function _formatEta(rate) {
  if (!rate) return '';
  if (rate.estimatedDelivery) {
    const d = new Date(rate.estimatedDelivery);
    return d.toLocaleDateString('en-US', { weekday:'short', month:'numeric', day:'numeric' });
  }
  if (rate.deliveryDays) return `${rate.deliveryDays} day${rate.deliveryDays > 1 ? 's' : ''}`;
  return '';
}

export function renderRateCell(id, best, spid) {
  if (best) state.orderBestRate[id] = best;
  const cell = document.getElementById(`rate-${id}`);
  if (!cell) return;

  if (!spid) {
    const ord = state.allOrders.find(o => o.orderId === id);
    spid = getOrderBillingProviderId(ord);
  }

  if (best) {
    const cc  = best.carrierCode || '';
    const rawCost    = (best.shipmentCost || 0) + (best.otherCost || 0);
    const markedCost = applyCarrierMarkup(best);
    
    // For ORION/ORI rates, always show markup on top and cost below
    const isOrion = isOrionRate(best);
    const rateDisplay = isOrion 
      ? formatOrionRateDisplay(best, { mainSize: '12px', subSize: '10px', mainColor: 'var(--green)' })
      : `<strong style="color:var(--green);font-size:12px;display:block">$${markedCost.toFixed(2)}</strong>`;
    
    cell.innerHTML = `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
        ${carrierLogo(cc, 18)}
        <div style="text-align:right">
          ${rateDisplay}
        </div>
      </div>`;
  } else {
    cell.innerHTML = '<span style="color:var(--text3);font-size:11px">N/A</span>';
  }
}

export function renderActualRateCell(id, o) {
  const cell = document.getElementById(`rate-${id}`);
  if (!cell) return;
  
  // Check if marked as externally shipped (shipped outside ShipStation)
  if (o.externalShipped) {
    cell.innerHTML = '<span style="font-size:10.5px;color:var(--text3);background:var(--surface3);border:1px solid var(--border2);border-radius:4px;padding:2px 6px;white-space:nowrap" title="Shipped outside ShipStation">Externally Shipped</span>';
    return;
  }
  
  // No label and no selectedRate → marketplace/external label
  if (!o.label?.cost && !o.label?.trackingNumber && !o.label?.shippingProviderId && !o.selectedRate) {
    cell.innerHTML = '<span style="display:inline-block;background:#f0f0f0;color:#666;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;cursor:help" title="Label purchased outside ShipStation (eBay/Walmart/Amazon/etc.)">Ext. Label</span>';
    return;
  }

  const hasLabel = o.label?.cost != null;
  const hasSelectedRate = o.selectedRate != null;
  let cost = 0;
  let cc = '';
  let costColor = 'var(--text)';
  let costTitle = 'Actual label cost';
  
  if (hasLabel) {
    cost = parseFloat(o.label.cost);
    cc = o.label.carrierCode || o.carrierCode || '';
  } else if (hasSelectedRate) {
    // Use selected rate (actual rate used at label creation for externally fulfilled orders)
    cost = parseFloat(o.selectedRate.cost) || 0;
    cc = o.selectedRate.carrierCode || '';
    costColor = 'var(--text)';
    costTitle = 'Rate used at label creation (external)';
  }

  // Apply carrier markup using persisted selected carrier account (shippingProviderId)
  // For labels, use label.shippingProviderId
  // For selectedRate, use selectedRate.shippingProviderId
  const pid = o.label?.shippingProviderId || (hasSelectedRate ? o.selectedRate.shippingProviderId : null);
  const markedCost = pid ? applyRbMarkup(pid, cost) : cost;

  const costHtml  = cost > 0
    ? priceDisplay(cost, markedCost, { mainSize: '12px', subSize: '10px', mainColor: costColor })
    : `<span style="font-size:10.5px;color:var(--text4)">N/A</span>`;
  cell.innerHTML = `<div style="display:flex;align-items:center;gap:4px;line-height:1.4" title="${costTitle}">
    ${carrierLogo(cc, 18)}
    ${costHtml}
  </div>`;
}

// ═══════════════════════════════════════════════
//  CHEAPEST RATE FETCHER
// ═══════════════════════════════════════════════
export async function fetchCheapestRates(orders) {
  state.rateFetchGeneration++;
  const myGen = state.rateFetchGeneration;
  state.rateFetchActive = true;

  // Enrich missing weight/dims from product DB
  const needsDefault = orders.filter(o => {
    const hasWt   = o.weight?.value > 0;
    const dims = getOrderDimensions(o);
    const hasDims = dims.length > 0 && dims.width > 0 && dims.height > 0;
    return (!hasWt || !hasDims) && (o.items || []).filter(i => !i.adjustment && i.sku).length > 0;
  });
  if (needsDefault.length) {
    const skuSet = new Set(needsDefault.flatMap(o => (o.items || []).filter(i => !i.adjustment && i.sku).map(i => i.sku)));
    try {
      const prodMap = await fetchValidatedJson(
        `/api/products/bulk?skus=${[...skuSet].map(encodeURIComponent).join(',')}`,
        undefined,
        parseProductBulkMap,
      );
      for (const o of needsDefault) {
        const items      = (o.items || []).filter(i => !i.adjustment && i.sku);
        const uniqueSkus = [...new Set(items.map(i => i.sku))];
        if (uniqueSkus.length !== 1) continue;
        const prod = prodMap[uniqueSkus[0]];
        if (!prod) continue;
        const qty = items.reduce((s, i) => s + (i.quantity || 1), 0);
        if (!(o.weight?.value > 0) && prod.weightOz > 0) {
          o._enrichedWeight = { value: +(prod.weightOz * qty).toFixed(2), units: 'ounces' };
        }
        const dims = getOrderDimensions(o);
        if (!(dims.length > 0) && prod.length > 0) {
          o._enrichedDims = { length: prod.length, width: prod.width, height: prod.height };
        }
      }
    } catch { /* continue */ }
  }

  orders.forEach(o => {
    if (o.bestRate) renderRateCell(o.orderId, o.bestRate);
  });
  const ordersToProcess = orders;

  const groups = {};
  ordersToProcess.forEach(o => {
    const rawWt = (o._enrichedWeight || o.weight)?.value;
    const dSrc  = o._enrichedDims || getOrderDimensions(o);
    const dims  = (dSrc?.length > 0 && dSrc?.width > 0 && dSrc?.height > 0) ? dSrc : null;

    if (!rawWt || rawWt <= 0) { renderRateCell(o.orderId, null); return; }
    if (!dims) {
      // Missing dims: only update rate cell, not custcarrier
      // custcarrier should remain stable and never flash during rate fetching
      const cell = document.getElementById(`rate-${o.orderId}`);
      if (cell) {
        cell.innerHTML = `<span style="font-size:10.5px;color:var(--text3)">— add dims</span>`;
      }
      return;
    }
    const wt  = Math.round(rawWt);
    const zip = (o.shipTo?.postalCode || '').replace(/\D/g, '').slice(0, 5);
    if (!zip || zip.length < 5) return;
    const dimStr      = `${dims.length}x${dims.width}x${dims.height}`;
    const residential = isResidential(o);
    const resFlag     = residential ? 'R' : 'C';
    const storeId     = getOrderStoreId(o);
    const key         = `${wt}|${zip}|${dimStr}|${resFlag}|${storeId}`;
    if (!groups[key]) groups[key] = { key, wt, zip, dims, residential, storeId, ids: [] };
    groups[key].ids.push(o.orderId);
  });

  const needsLookup = [];
  Object.values(groups).forEach(g => {
    if (state.rateCache[g.key]) {
      g.ids.forEach(id => {
        const ord     = state.allOrders.find(o => o.orderId === id);
        const spid    = getOrderBillingProviderId(ord);
        const storeId = getOrderStoreId(ord);
        // Debug: log storeId when Media Mail allowed store detected
        if (storeId === 376759) {
          console.log(`[orders-cached] Order ${ord.orderNumber} storeId=${storeId}, rates=${state.rateCache[g.key]?.length || 0}`);
        }
        const best    = pickBestRate(state.rateCache[g.key], spid, storeId);
        renderRateCell(id, best, spid);
        if (best) saveBestRate(id, best, g.dims ? `${g.dims.length}x${g.dims.width}x${g.dims.height}` : null);
      });
    } else {
      needsLookup.push(g);
    }
  });
  if (!needsLookup.length) { state.rateFetchActive = false; return; }

  try {
    const data = await fetchValidatedJson('/api/rates/cached/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(needsLookup.map(g => ({ key: g.key, wt: g.wt, zip: g.zip, dims: g.dims, residential: g.residential, ids: g.ids, storeId: g.storeId }))),
    }, parseBulkCachedRatesResponse);

    const stillMissing = [];
    needsLookup.forEach(g => {
      const result = data.results?.[g.key];
      if (result?.cached && result.rates?.length) {
        state.rateCache[g.key] = result.rates;
        g.ids.forEach(id => {
          const ord     = state.allOrders.find(o => o.orderId === id);
          const spid    = getOrderBillingProviderId(ord);
          const storeId = getOrderStoreId(ord);
          // Debug: log storeId when Media Mail allowed store detected
          if (storeId === 376759) {
            console.log(`[orders-bulk] Order ${ord.orderNumber} storeId=${storeId}, rates=${result.rates.length}`);
          }
          const best    = pickBestRate(result.rates, spid, storeId);
          renderRateCell(id, best, spid);
          if (best) saveBestRate(id, best, g.dims ? `${g.dims.length}x${g.dims.width}x${g.dims.height}` : null);
        });
      } else {
        stillMissing.push(g);
      }
    });

    if (stillMissing.length) {
      if (state.rateFetchGeneration !== myGen) { state.rateFetchActive = false; return; }
      const BATCH = 2;
      for (let i = 0; i < stillMissing.length; i += BATCH) {
        if (state.rateFetchGeneration !== myGen) { state.rateFetchActive = false; return; }
        await Promise.all(stillMissing.slice(i, i + BATCH).map(async g => {
          if (state.rateFetchGeneration !== myGen) return;
          const body = {
            fromPostalCode: '90248', toPostalCode: g.zip, toCountry: 'US',
            weight: { value: g.wt, units: 'ounces' },
            dimensions: g.dims ? { units: 'inches', length: g.dims.length, width: g.dims.width, height: g.dims.height } : undefined,
            residential: g.residential,
            orderIds: g.ids,   // save SS reference rates for all orders in this group
            storeId: g.storeId,  // storeId for rate filtering (Media Mail allowlist check)
          };
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
              if (state.rateFetchGeneration !== myGen) return;
              const rates = await fetchValidatedJson('/api/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, parseLiveRatesResponse);
              if (Array.isArray(rates) && rates.length) {
                state.rateCache[g.key] = rates;
                if (state.rateFetchGeneration !== myGen) return;
                g.ids.forEach(id => {
                  const ord     = state.allOrders.find(o => o.orderId === id);
                  const spid    = getOrderBillingProviderId(ord);
                  const storeId = getOrderStoreId(ord);
                  // Debug: log storeId when Media Mail allowed store detected
                  if (storeId === 376759) {
                    console.log(`[orders-live] Order ${ord.orderNumber} storeId=${storeId}, rates=${rates.length}`);
                  }
                  const best    = pickBestRate(rates, spid, storeId);
                  renderRateCell(id, best, spid);
                  if (best) saveBestRate(id, best, g.dims ? `${g.dims.length}x${g.dims.width}x${g.dims.height}` : null);
                });
                return;
              }
            } catch { /* retry */ }
          }
          if (state.rateFetchGeneration === myGen) g.ids.forEach(id => renderRateCell(id, null));
        }));
        if (i + BATCH < stillMissing.length) await new Promise(r => setTimeout(r, 600));
      }
    }
  } catch (e) {
    console.warn('[Rates] Bulk lookup failed:', e.message);
  }
  if (state.rateFetchGeneration === myGen) state.rateFetchActive = false;
}

// ═══════════════════════════════════════════════
//  SELECTION
// ═══════════════════════════════════════════════
export function toggleOrder(id, el) {
  const row = document.getElementById(`row-${id}`);
  if (el.checked) {
    state.selectedOrders.add(id);
    row?.classList.add('row-selected');
  } else {
    state.selectedOrders.delete(id);
    if (row) {
      row.classList.remove('row-selected', 'row-panel-open', 'row-kb-focus');
      row.querySelectorAll('td').forEach(td => td.style.background = '');
    }
    el.checked = false;
    if (state.currentPanelOrder?.orderId === id && typeof window.closePanel === 'function') window.closePanel();
  }
  updateBatchBar();
}

export function selectAll() {
  state.filteredOrders.forEach(o => {
    state.selectedOrders.add(o.orderId);
    const row = document.getElementById(`row-${o.orderId}`);
    if (row) row.classList.add('row-selected');
    const cb = document.querySelector(`#row-${o.orderId} input[type=checkbox]`);
    if (cb) cb.checked = true;
  });
  updateBatchBar();
}

export function clearSelection() {
  state.selectedOrders.forEach(id => {
    const row = document.getElementById(`row-${id}`);
    if (row) row.classList.remove('row-selected', 'row-panel-open');
    const cb = document.querySelector(`#row-${id} input[type=checkbox]`);
    if (cb) cb.checked = false;
  });
  state.selectedOrders.clear();
  if (typeof window.closePanel === 'function') window.closePanel();
  updateBatchBar();
}

export function toggleCheckbox(id, checked) {
  const row = document.getElementById(`row-${id}`);
  if (checked) {
    state.selectedOrders.add(id);
    if (row) row.classList.add('row-selected');
  } else {
    state.selectedOrders.delete(id);
    if (row) row.classList.remove('row-selected', 'row-panel-open');
    if (state.currentPanelOrder?.orderId === id && typeof window.closePanel === 'function') window.closePanel();
  }
  updateBatchBar();
  if (state.selectedOrders.size >= 2) {
    if (typeof window.showBatchPanel === 'function') window.showBatchPanel();
  } else if (checked) {
    if (typeof window.openPanel === 'function') window.openPanel(id);
  }
}

export async function toggleRowSelect(id) {
  if (state.selectedOrders.has(id)) {
    state.selectedOrders.delete(id);
    const row = document.getElementById(`row-${id}`);
    if (row) row.classList.remove('row-selected', 'row-panel-open');
    const rowCb = document.querySelector(`#row-${id} input[type=checkbox]`);
    if (rowCb) rowCb.checked = false;
    updateBatchBar();
    if (state.currentPanelOrder?.orderId === id && typeof window.closePanel === 'function') window.closePanel();
  } else {
    if (typeof window.openPanel === 'function') await window.openPanel(id);
  }
}

export async function toggleSkuGroup(currentPageIds, checked, skuJson) {
  // Parse current-page IDs
  const pageIds = typeof currentPageIds === 'string' ? JSON.parse(currentPageIds) : currentPageIds;

  if (checked) {
    // Immediately select current-page orders for responsiveness
    pageIds.forEach(id => state.selectedOrders.add(id));

    // If sku provided, fetch ALL matching IDs across pages
    if (skuJson) {
      try {
        const sku = typeof skuJson === 'string' ? JSON.parse(skuJson) : skuJson;
        const params = new URLSearchParams({ sku: JSON.stringify(sku) });
        if (state.currentStatus) params.set('orderStatus', state.currentStatus);
        if (state.currentStoreId) params.set('storeId', state.currentStoreId);
        const data = await fetchValidatedJson(`/api/orders/ids?${params}`, undefined, parseOrderIdsResponse);
        if (data.ids) data.ids.forEach(id => state.selectedOrders.add(id));
      } catch (e) {
        console.warn('toggleSkuGroup cross-page fetch failed', e);
      }
    }
  } else {
    // Deselect: remove all page IDs; if sku provided, fetch all to remove
    pageIds.forEach(id => state.selectedOrders.delete(id));
    if (skuJson) {
      try {
        const sku = typeof skuJson === 'string' ? JSON.parse(skuJson) : skuJson;
        const params = new URLSearchParams({ sku: JSON.stringify(sku) });
        if (state.currentStatus) params.set('orderStatus', state.currentStatus);
        if (state.currentStoreId) params.set('storeId', state.currentStoreId);
        const data = await fetchValidatedJson(`/api/orders/ids?${params}`, undefined, parseOrderIdsResponse);
        if (data.ids) data.ids.forEach(id => state.selectedOrders.delete(id));
      } catch (e) {
        console.warn('toggleSkuGroup cross-page fetch failed', e);
      }
    }
  }

  // Update all visible checkboxes on this page
  pageIds.forEach(id => {
    const cb = document.querySelector(`#row-${id} input[type=checkbox]`);
    if (cb) cb.checked = checked;
  });

  // Update bulk action bar
  updateBatchBar();

  // Auto-open batch panel when SKU group is selected
  if (checked && state.selectedOrders.size >= 2) {
    if (typeof window.showBatchPanel === 'function') window.showBatchPanel();
  }
}

/** Select all orders in a SKU group (matching SKU + Qty) and immediately show batch panel */
export async function selectSkuGroupAndShowBatch(currentPageIds, skuJson, qtyJson) {
  const pageIds = typeof currentPageIds === 'string' ? JSON.parse(currentPageIds) : currentPageIds;
  const qty = qtyJson ? (typeof qtyJson === 'string' ? JSON.parse(qtyJson) : qtyJson) : null;

  // Fetch ALL matching IDs across pages first (for SKU + Qty combination)
  let allGroupIds = [...pageIds];
  if (skuJson) {
    try {
      const sku = skuJson; // Already a plain string from onclick attribute
      const params = new URLSearchParams({ sku });
      if (qty !== null && qty !== undefined) params.set('qty', qty);
      if (state.currentStatus) params.set('orderStatus', state.currentStatus);
      if (state.currentStoreId) params.set('storeId', state.currentStoreId);
      const data = await fetchValidatedJson(`/api/orders/ids?${params}`, undefined, parseOrderIdsResponse);
      if (data.ids) allGroupIds = data.ids;
    } catch (e) {
      console.warn('selectSkuGroupAndShowBatch cross-page fetch failed', e);
    }
  }

  // Determine if group is already fully selected
  const groupFullySelected = allGroupIds.every(id => state.selectedOrders.has(id));
  
  if (groupFullySelected) {
    // Deselect all orders in this group
    allGroupIds.forEach(id => state.selectedOrders.delete(id));
  } else {
    // Select all orders in this group
    allGroupIds.forEach(id => state.selectedOrders.add(id));
  }

  // Update all visible checkboxes on this page
  const shouldCheck = !groupFullySelected;
  pageIds.forEach(id => {
    const cb = document.querySelector(`#row-${id} input[type=checkbox]`);
    if (cb) cb.checked = shouldCheck;
  });

  // Update bulk action bar and show batch panel if 2+ selected
  updateBatchBar();
  console.log(`[SKU Group Toggle] Selection count: ${state.selectedOrders.size}, fully selected: ${groupFullySelected}`);
  if (state.selectedOrders.size >= 2) {
    console.log('[SKU Group Toggle] Showing batch panel');
    if (typeof window.showBatchPanel === 'function') window.showBatchPanel();
  } else {
    // Hide batch panel if deselection dropped count below 2
    console.log('[SKU Group Toggle] Closing panel (< 2 orders)');
    if (typeof window.closePanel === 'function') window.closePanel();
  }
}

// ═══════════════════════════════════════════════
//  PRINT PICKLIST
// ═══════════════════════════════════════════════
export async function printPicklist() {
  showToast('⏳ Building pick list…');

  // Build same filter params as fetchOrders
  const params = new URLSearchParams();
  if (state.currentStatus)  params.set('orderStatus', state.currentStatus);
  if (state.currentStoreId) params.set('storeId', state.currentStoreId);
  const range = getDateRange();
  if (range?.start) params.set('dateStart', range.start.toISOString());
  if (range?.end)   params.set('dateEnd',   range.end.toISOString());

  let data;
  try {
    data = await fetchValidatedJson(`/api/orders/picklist?${params}`, undefined, parseOrderPicklistResponse);
  } catch (e) {
    return showToast(`❌ Picklist error: ${e.message}`);
  }

  if (!data.skus?.length) return showToast('No items found for current filter');

  const now        = new Date().toLocaleString();
  const totalUnits = data.skus.reduce((s, r) => s + r.totalQty, 0);
  const totalSkus  = data.skus.length;

  // Date range label — read from the dropdown in the DOM
  const dateFilterVal = document.getElementById('dateFilter')?.value || 'all';
  const dateLabelMap  = { last7:'Last 7 days', last30:'Last 30 days', last90:'Last 90 days', today:'Today', yesterday:'Yesterday', all:'All time' };
  let dateLabel = dateLabelMap[dateFilterVal] || 'Custom range';
  if (dateFilterVal === 'custom' && range?.start) {
    dateLabel = `${range.start.toLocaleDateString()} – ${range.end?.toLocaleDateString() || 'now'}`;
  }

  const rows = data.skus.map((s, i) => {
    const img = s.imageUrl
      ? `<img src="${escHtml(s.imageUrl)}" style="width:48px;height:48px;object-fit:cover;border-radius:5px;border:1px solid #e0e0e0" onerror="this.style.display='none'">`
      : `<div style="width:48px;height:48px;background:#f5f5f5;border-radius:5px;border:1px solid #e0e0e0;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`;
    return `<tr style="page-break-inside:avoid">
      <td style="font-size:11px;color:#888;text-align:center">${i + 1}</td>
      <td style="font-size:12px;font-weight:700;color:#333">${escHtml(s.clientName || '—')}</td>
      <td style="text-align:center">${img}</td>
      <td>
        <div style="font-weight:600;font-size:13px;color:#1a1a1a;margin-bottom:3px">${escHtml(s.name || '—')}</div>
        <div style="font-family:monospace;font-size:11px;color:#666;background:#f5f5f5;display:inline-block;padding:1px 6px;border-radius:3px">${escHtml(s.sku)}</div>
      </td>
      <td style="text-align:center">
        <span style="font-size:26px;font-weight:800;color:#1a1a1a">${s.totalQty}</span>
      </td>
      <td style="text-align:center">
        <div style="width:34px;height:34px;border:2px solid #ccc;border-radius:6px;margin:0 auto"></div>
      </td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>PrepShip Pick List — ${now}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a1a; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #1a1a1a; }
    .header h1 { font-size: 22px; font-weight: 800; }
    .header .meta { font-size: 12px; color: #555; margin-top: 4px; }
    .stats { display: flex; gap: 24px; }
    .stat { text-align: right; }
    .stat .n { font-size: 28px; font-weight: 800; line-height: 1; }
    .stat .l { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #1a1a1a; color: #fff; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
    thead th:nth-child(1), thead th:nth-child(3), thead th:nth-child(5), thead th:nth-child(6) { text-align: center; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    tbody tr:hover td { background: #f0f4ff; }
    td { padding: 10px; border-bottom: 1px solid #e8e8e8; vertical-align: middle; }
    @media print {
      @page { size: letter portrait; margin: 12mm; }
      body { padding: 0; }
      tbody tr:hover td { background: inherit; }
    }
  </style></head><body>
  <div class="header">
    <div>
      <h1>📦 PrepShip Pick List</h1>
      <div class="meta">Generated: ${now} &nbsp;·&nbsp; ${dateLabel} &nbsp;·&nbsp; Status: ${(state.currentStatus||'all').replace(/_/g,' ')}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="n">${totalSkus}</div><div class="l">SKUs</div></div>
      <div class="stat"><div class="n">${totalUnits}</div><div class="l">Total Units</div></div>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Client</th><th>IMG</th><th>Item / SKU</th><th>Qty to Pick</th><th>✓ Done</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = () => window.print();<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else showToast('⚠️ Allow popups to print pick list');
}

export function printSelected() {
  if (!state.selectedOrders.size) return showToast('Select orders first');
  showToast(`🖨️ ${state.selectedOrders.size} labels queued — Phase 3`);
}

// ═══════════════════════════════════════════════
//  COPY HELPERS
// ═══════════════════════════════════════════════
export function copyAddr(addr) {
  navigator.clipboard?.writeText(addr.replace(/\\n/g, '\n')).then(() => showToast('📋 Address copied')).catch(() => showToast('⚠ Copy failed'));
}

export function copyOrderNum(num) {
  navigator.clipboard?.writeText(num).then(() => showToast(`📋 Copied: ${num}`)).catch(() => {
    const el = document.createElement('textarea');
    el.value = num;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`📋 Copied: ${num}`);
  });
}

// Expose to window for inline HTML calls
window.renderOrders   = renderOrders;
window.fetchOrders         = fetchOrders;
window.fetchCheapestRates  = fetchCheapestRates;
window.renderRateCell      = renderRateCell;

// ─── Thumbnail hover preview ──────────────────────────────────────────────────
let _thumbMoveHandler = null;
function _positionThumbPreview(preview, cx, cy) {
  // CSS zoom on body means position:fixed coords are in the zoomed space.
  // Divide viewport coords by zoom factor to get the correct CSS pixel value.
  const zoom = (parseFloat(document.body.style.zoom) || 100) / 100;
  const W = 170, H = 170, GAP = 14;
  const vw = window.innerWidth, vh = window.innerHeight;
  const rawLeft = cx + GAP + W > vw ? cx - W - GAP : cx + GAP;
  const rawTop  = cy + GAP + H > vh ? cy - H - GAP : cy + GAP;
  preview.style.left = (rawLeft / zoom) + 'px';
  preview.style.top  = (rawTop  / zoom) + 'px';
}
window.showThumbPreview = function(img, e) {
  if (!img?.src) return;
  let preview = document.getElementById('_thumb-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = '_thumb-preview';
    preview.style.cssText = 'position:fixed;z-index:99999;background:var(--bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.22);padding:5px;pointer-events:none;display:none';
    const el = document.createElement('img');
    el.id = '_thumb-preview-img';
    el.style.cssText = 'width:160px;height:160px;object-fit:contain;border-radius:5px;display:block';
    preview.appendChild(el);
    document.body.appendChild(preview);
  }
  preview.querySelector('#_thumb-preview-img').src = img.src;

  // Counter body zoom so preview is always 160px visually regardless of zoom level
  const zoom = (parseFloat(document.body.style.zoom) || 100) / 100;
  preview.style.zoom = String(1 / zoom);

  // Use actual cursor position from event (viewport coords, unaffected by CSS zoom)
  if (e) _positionThumbPreview(preview, e.clientX, e.clientY);
  preview.style.display = 'block';

  // Continue tracking cursor movement
  if (_thumbMoveHandler) document.removeEventListener('mousemove', _thumbMoveHandler);
  _thumbMoveHandler = function(ev) { _positionThumbPreview(preview, ev.clientX, ev.clientY); };
  document.addEventListener('mousemove', _thumbMoveHandler);
};
window.hideThumbPreview = function() {
  const el = document.getElementById('_thumb-preview');
  if (el) el.style.display = 'none';
  if (_thumbMoveHandler) { document.removeEventListener('mousemove', _thumbMoveHandler); _thumbMoveHandler = null; }
};
window.filterOrders        = filterOrders;
window.onDateFilterChange  = onDateFilterChange;
window.toggleRowSelect = toggleRowSelect;
window.toggleCheckbox = toggleCheckbox;
window.toggleOrder    = toggleOrder;
window.toggleSkuGroup = toggleSkuGroup;
window.selectSkuGroupAndShowBatch = selectSkuGroupAndShowBatch;
window.selectAll      = selectAll;
window.clearSelection = clearSelection;
window.copyOrderNum   = copyOrderNum;
window.copyAddr       = copyAddr;
window.printPicklist  = printPicklist;
window.printSelected  = printSelected;
window.showToast      = showToast;

// ═══════════════════════════════════════════════
//  TRACKING MODAL
// ═══════════════════════════════════════════════
function showTrackingModal(url, tracking, carrierCode) {
  const CARRIER_NAMES = {
    usps: 'USPS', stamps_com: 'USPS',
    ups: 'UPS', ups_walleted: 'UPS',
    fedex: 'FedEx', fedex_walleted: 'FedEx',
    dhl: 'DHL', dhl_walleted: 'DHL',
  };
  const carrierName = CARRIER_NAMES[carrierCode] || (carrierCode ? carrierCode.toUpperCase() : 'Carrier');

  const existing = document.getElementById('trackingModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'trackingModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center';

  overlay.innerHTML = `
    <div id="trackingModalCard" style="background:#fff;border-radius:12px;width:min(960px,94vw);height:min(680px,90vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.45)">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #e5e7eb;flex-shrink:0">
        <div style="font-size:15px;font-weight:700;color:#111;flex:1">📦 Track Package</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${escHtml(carrierName)}</span>
          <span style="font-size:12px;font-family:monospace;color:#374151;font-weight:600">${escHtml(tracking)}</span>
        </div>
        <a href="${escHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"
           style="display:flex;align-items:center;gap:5px;padding:6px 12px;background:#0ea5e9;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;margin-left:8px">
          Open in new tab ↗
        </a>
        <button onclick="document.getElementById('trackingModalOverlay').remove()"
                style="margin-left:4px;width:30px;height:30px;border:none;background:#f3f4f6;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#374151">×</button>
      </div>
      <div id="trackingFallbackBar" style="display:none;align-items:center;justify-content:center;gap:10px;padding:10px 18px;background:#fef9c3;border-bottom:1px solid #fde68a;font-size:12px;color:#92400e;flex-shrink:0">
        <span>⚠️ ${escHtml(carrierName)} blocks embedding — use the button above to open the tracking page.</span>
      </div>
      <iframe id="trackingIframe" src="${escHtml(url)}"
              style="flex:1;border:none;width:100%"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              referrerpolicy="no-referrer">
      </iframe>
    </div>`;

  document.body.appendChild(overlay);

  const iframe = overlay.querySelector('#trackingIframe');
  const fallbackBar = overlay.querySelector('#trackingFallbackBar');

  // Carriers known to block iframe embedding — skip attempt, show button immediately
  const BLOCKS_EMBED = new Set(['ups', 'ups_walleted', 'fedex', 'fedex_walleted', 'usps', 'stamps_com']);
  if (BLOCKS_EMBED.has(carrierCode)) {
    iframe.style.display = 'none';
    fallbackBar.style.display = 'flex';
  } else {
    let iframeLoaded = false;
    iframe.addEventListener('load', () => {
      iframeLoaded = true;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || doc.URL === 'about:blank') throw new Error('blank');
      } catch {
        fallbackBar.style.display = 'flex';
      }
    });
    setTimeout(() => { if (!iframeLoaded) fallbackBar.style.display = 'flex'; }, 4000);
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  const onKey = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}
window.showTrackingModal = showTrackingModal;
