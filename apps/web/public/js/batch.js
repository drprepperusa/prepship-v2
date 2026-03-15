import { state } from './state.js';
import { escHtml, trunc, showToast } from './utils.js';
import { CARRIER_NAMES, SERVICE_NAMES, isBlockedRate } from './constants.js';
import { applyCarrierMarkup, pickBestRate, isResidential } from './markups.js';
import { getStoreName } from './stores.js';
import { getOrderPrimarySku, updateBatchBar } from './table.js';
import { fetchValidatedJson, parseErrorResponse } from './api-client.js';
import { getOrderBillingProviderId, getOrderDimensions, getOrderStoreId } from './order-data.js';
import {
  parseAutoCreatePackageResponse,
  parseBulkCachedRatesResponse,
  parseCreateLabelResponse,
  parseLiveRatesResponse,
  parseNullablePackageDto,
  parsePackageDtoList,
} from './api-contracts.js';

export async function getRates() {
  const wt  = parseFloat(document.getElementById('rWeight').value) || 0;
  const len = parseFloat(document.getElementById('rLength').value) || 0;
  const wid = parseFloat(document.getElementById('rWidth').value) || 0;
  const hgt = parseFloat(document.getElementById('rHeight').value) || 0;
  if (!wt) {
    document.getElementById('ratesResult').innerHTML = '<div class="empty-state"><div class="empty-icon">⚖️</div><div>Enter weight to get rates</div></div>';
    return;
  }
  const fromZip = document.getElementById('rFromZip').value.trim() || '90248';
  const toZip   = document.getElementById('rToZip').value.trim();
  const markup  = parseFloat(document.getElementById('globalMarkup').value) || 0;
  if (!toZip) {
    document.getElementById('ratesResult').innerHTML = '<div class="empty-state"><div class="empty-icon">📍</div><div>Enter a destination ZIP</div></div>';
    return;
  }
  document.getElementById('ratesResult').innerHTML = '<div class="loading"><div class="spinner"></div><div>Fetching live rates…</div></div>';
  try {
    const allRates = await fetchValidatedJson('/api/rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPostalCode: fromZip, toPostalCode: toZip, toCountry: 'US',
        weight: { value: wt, units: 'ounces' }, dimensions: { units: 'inches', length: len, width: wid, height: hgt } }),
    }, parseLiveRatesResponse);
    if (!Array.isArray(allRates) || !allRates.length) {
      document.getElementById('ratesResult').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div>No rates returned.</div></div>';
      return;
    }
    const rates = allRates.filter(rate => !isBlockedRate(rate));
    if (!rates.length) {
      document.getElementById('ratesResult').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div>No available rates returned.</div></div>';
      return;
    }
    const { carrierLogo } = await import('./constants.js');
    document.getElementById('ratesResult').innerHTML = `
      <div style="background:var(--surface);border-radius:8px;border:1px solid var(--border);overflow:hidden;box-shadow:var(--shadow)">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);display:flex;gap:8px;align-items:center">
          <strong style="color:var(--text)">${rates.length} rates</strong>
          <span style="font-size:11.5px;color:var(--text3)">${wt}oz · ${len}×${wid}×${hgt}" · ${fromZip}→${toZip}</span>
        </div>
        <div style="overflow-x:auto">
        <table class="rates-table">
          <thead><tr><th>Carrier</th><th>Service</th><th>Base Cost</th><th>Your Price</th><th>Profit</th><th></th></tr></thead>
          <tbody>${rates.map((rate, i) => {
            const cc = rate.carrierCode || '';
            const carrier = cc === 'stamps_com' ? 'USPS' : cc.startsWith('fedex') ? 'FedEx' : 'UPS';
            const totalCost = (rate.shipmentCost || 0) + (rate.otherCost || 0);
            const cp = (totalCost + markup).toFixed(2);
            const svcName = SERVICE_NAMES[rate.serviceCode] || rate.serviceName || '';
            return `<tr ${i===0?'class="best-rate"':''}>
              <td>${carrierLogo(cc, 18)}</td>
              <td>${escHtml(svcName)} ${i===0?'<span class="best-badge">✓ CHEAPEST</span>':''}</td>
              <td style="font-weight:700">$${totalCost.toFixed(2)}</td>
              <td style="color:var(--orange);font-weight:700">$${cp}</td>
              <td style="color:var(--green);font-weight:600">+$${markup.toFixed(2)}</td>
              <td><button class="btn btn-primary btn-xs" onclick="showToast('${carrier} ${(svcName||'').replace(/'/g,'')} @ \\$${cp} — Phase 3')">Select</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div></div>`;
  } catch (e) {
    document.getElementById('ratesResult').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div>Error: ${e.message}</div></div>`;
  }
}

export function updateProfitEstimate() {
  const el = document.getElementById('profitEstimate');
  if (!el) return;
  const daily = state.totalOrders || 0;
  const vals  = Object.values(state.rbMarkups).map(m => m.type==='pct' ? 8*(m.value/100) : (m.value||0));
  const avg   = vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
  el.innerHTML = `
    <div>Avg markup/label: <strong style="color:var(--orange)">$${avg.toFixed(2)}</strong></div>
    <div>Daily orders: <strong>${daily.toLocaleString()}</strong></div>
    <div>Est. daily profit: <strong style="color:var(--green)">$${(daily*avg).toFixed(0)}</strong></div>
    <div>Est. monthly profit: <strong style="color:var(--green)">$${(daily*avg*30).toFixed(0)}/mo</strong></div>`;
}

export function showBatchPanel() {
  const ids    = [...state.selectedOrders];
  const orders = ids.map(id => state.allOrders.find(o => o.orderId === id)).filter(Boolean);
  console.log(`[showBatchPanel] Called with ${orders.length} orders`);
  if (orders.length < 2) {
    console.log('[showBatchPanel] Early return: < 2 orders');
    return;
  }

  const totalUnits = orders.reduce((s,o) => s + (o.items||[]).filter(i=>!i.adjustment).reduce((ss,i)=>ss+(i.quantity||1),0), 0);
  const totalValue = orders.reduce((s,o) => s + (o.orderTotal||0), 0);
  const skus    = [...new Set(orders.map(o => getOrderPrimarySku(o)))];
  const sameSku = skus.length === 1 && skus[0];
  const skuName = sameSku ? (orders[0].items.find(i => !i.adjustment)?.name || sameSku) : null;
  const statesMap = {};
  orders.forEach(o => { const st = o.shipTo?.state || '?'; statesMap[st] = (statesMap[st]||0) + 1; });
  const stateList = Object.entries(statesMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([st,n])=>`${st} (${n})`).join(', ');
  const first = orders[0];
  const wt = (first._enrichedWeight || first.weight)?.value || 0;
  const dSrc = first._enrichedDims || getOrderDimensions(first) || {};
  const pkgOpts = state.packagesList.filter(p => p.source === 'custom').map(p => `<option value="${p.packageId}">${escHtml(p.name)} (${p.length}×${p.width}×${p.height})</option>`).join('');

  state.currentPanelOrder = null;
  state.batchForceShared  = false;

  // For multi-SKU, build per-SKU form sections
  let perSkuHtml = '';
  if (!sameSku && skus.length > 0) {
    perSkuHtml = skus.map(sku => {
      const ordersWithSku = orders.filter(o => getOrderPrimarySku(o) === sku);
      const skuOrderName = ordersWithSku[0]?.items?.find(i => !i.adjustment && i.sku === sku)?.name || sku;
      return `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ss-blue)"></span>
          ${escHtml(skuOrderName)}
        </div>
        <div style="font-size:10px;color:var(--text3);font-family:monospace;margin-bottom:10px">${escHtml(sku)} · ${ordersWithSku.length} order${ordersWithSku.length > 1 ? 's' : ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div>
            <label style="font-size:9px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:3px">Weight (oz)</label>
            <input type="number" class="sku-weight ship-select" data-sku="${escHtml(sku)}" step="0.1" min="0" style="width:100%;font-size:11px;padding:6px">
          </div>
          <div>
            <label style="font-size:9px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:3px">Package</label>
            <select class="sku-package ship-select" data-sku="${escHtml(sku)}" style="width:100%;font-size:11px;padding:6px">
              <option value="">— Select —</option>${pkgOpts}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
          <div>
            <label style="font-size:9px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:3px">L (in)</label>
            <input type="number" class="sku-length ship-select" data-sku="${escHtml(sku)}" step="0.1" min="0" style="width:100%;font-size:11px;padding:6px">
          </div>
          <div>
            <label style="font-size:9px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:3px">W (in)</label>
            <input type="number" class="sku-width ship-select" data-sku="${escHtml(sku)}" step="0.1" min="0" style="width:100%;font-size:11px;padding:6px">
          </div>
          <div>
            <label style="font-size:9px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:3px">H (in)</label>
            <input type="number" class="sku-height ship-select" data-sku="${escHtml(sku)}" step="0.1" min="0" style="width:100%;font-size:11px;padding:6px">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveBatchSkuDims('${escHtml(sku).replace(/'/g, '')}', ${ordersWithSku.length})" style="width:100%;font-size:11px;padding:6px 8px">
          💾 Save to ${escHtml(sku.substring(0, 20))}
        </button>
      </div>`;
    }).join('');
  }

  document.getElementById('panelInner').innerHTML = `
    <div style="padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--ss-blue)">
        <div style="font-size:28px">📦</div>
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text)">Batch Ship</div>
          <div style="font-size:12px;color:var(--text2)">${orders.length} orders · ${totalUnits} units · $${totalValue.toFixed(2)}</div>
        </div>
      </div>
      ${sameSku ? `
      <div style="background:var(--ss-blue-bg);border:1px solid var(--ss-blue-border);border-radius:8px;padding:10px 12px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ss-blue);letter-spacing:.4px;margin-bottom:3px">Same SKU</div>
        <div style="font-size:12px;font-weight:600;color:var(--text)">${escHtml(skuName)}</div>
        <div style="font-size:11px;color:var(--text3);font-family:monospace">${escHtml(sameSku)}</div>
      </div>` : `
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#92400e">⚠ Multi-SKU — ${skus.length} different products. Enter dims for each.</div>
      </div>`}
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3);letter-spacing:.4px;margin-bottom:4px">Destinations</div>
      <div style="font-size:11.5px;color:var(--text2);margin-bottom:14px">${escHtml(stateList)}</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3);letter-spacing:.4px;margin-bottom:6px">Orders</div>
      <div style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:14px">
        ${orders.map(o=>`<div style="padding:5px 10px;font-size:11px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border)">
          <span style="font-family:monospace;color:var(--ss-blue)">${escHtml(o.orderNumber)}</span>
          <span style="color:var(--text3)">${escHtml(o.shipTo?.state||'')} ${escHtml((o.shipTo?.postalCode||'').substring(0,5))}</span>
        </div>`).join('')}
      </div>
      ${sameSku ? `
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3);letter-spacing:.4px">📦 Package</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">Weight (oz)</label>
            <input type="number" id="batch-weight" value="${wt}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">Package</label>
            <select id="batch-package" class="ship-select" style="width:100%;font-size:12px">
              <option value="">— Select —</option>${pkgOpts}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
          <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">L (in)</label>
            <input type="number" id="batch-l" value="${dSrc.length||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px" onchange="autoMatchPackageByDims()"></div>
          <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">W (in)</label>
            <input type="number" id="batch-w" value="${dSrc.width||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px" onchange="autoMatchPackageByDims()"></div>
          <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">H (in)</label>
            <input type="number" id="batch-h" value="${dSrc.height||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px" onchange="autoMatchPackageByDims()"></div>
        </div>
      </div>` : `
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3);letter-spacing:.4px;margin-bottom:12px">📦 Dimensions Per SKU</div>
        ${perSkuHtml}
      </div>`}
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3);letter-spacing:.4px">💰 Best Rate Per Order</div>
          <button class="btn btn-outline btn-sm" onclick="batchRateShop()" id="batch-rate-btn">Rate Shop All</button>
        </div>
        <div id="batch-rates-list" style="border:1px solid var(--border);border-radius:6px;overflow:hidden;max-height:250px;overflow-y:auto">
          <div style="padding:16px;text-align:center;color:var(--text3);font-size:12px">Click "Rate Shop All" to find the cheapest carrier for each order</div>
        </div>
        <div id="batch-rates-summary" style="display:none;margin-top:8px;padding:10px;background:var(--surface2);border-radius:6px;font-size:12px"></div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn btn-primary" id="batch-create-btn" style="flex:1;padding:12px;font-size:13px;font-weight:700;opacity:.5;pointer-events:none" onclick="batchCreateLabels()">
            🖨️ Print ${orders.length}
          </button>
          <button class="create-label-btn" id="batch-queue-btn" style="flex:1;padding:12px;font-size:13px;font-weight:700;background:#16a34a;opacity:.5;pointer-events:none" onclick="batchSendToQueue()">
            📥 Queue ${orders.length}
          </button>
        </div>
      </div>
      <div style="text-align:center;margin-top:14px">
        <button class="btn btn-ghost btn-sm" onclick="clearSelection()">✕ Clear Selection</button>
      </div>
    </div>`;

  // Auto-fill from already-cached rates (state.orderBestRate populated from prior rate fetch)
  // This prevents users having to re-click "Rate Shop All" for orders already rated on the main table
  setTimeout(() => {
    const list    = document.getElementById('batch-rates-list');
    const summary = document.getElementById('batch-rates-summary');
    if (!list) return;

    let html = '', totalCost = 0, rated = 0, missing = 0;

    for (const o of orders) {
      const spid    = getOrderBillingProviderId(o);
      const storeId = getOrderStoreId(o);
      const cached  = state.orderBestRate[o.orderId];
      if (cached) {
        const cc   = CARRIER_NAMES[cached.carrierCode] || cached.carrierCode;
        const sc   = SERVICE_NAMES[cached.serviceCode] || cached.serviceName || cached.serviceCode;
        const cost = applyCarrierMarkup(cached, spid, storeId);
        const _nick = cached.carrierNickname && !cached.carrierNickname.startsWith('se-') ? cached.carrierNickname : '';
        const acct = _nick || state.carrierAccountMap[cached.shippingProviderId] || cc;
        totalCost += cost;
        rated++;
        html += `<div style="padding:6px 10px;font-size:11px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
          <span style="font-family:monospace;color:var(--ss-blue);min-width:80px">${escHtml((o.orderNumber||'').slice(-8))}</span>
          <span style="font-size:10px;color:var(--text2);flex:1;margin:0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(acct)} · ${escHtml((sc+'').substring(0,18))}</span>
          <strong style="color:var(--green-dark)">$${cost.toFixed(2)}</strong>
        </div>`;
      } else {
        missing++;
        html += `<div id="br-${o.orderId}" style="padding:6px 10px;font-size:11px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
          <span style="font-family:monospace;color:var(--ss-blue);min-width:80px">${escHtml((o.orderNumber||'').slice(-8))}</span>
          <span style="color:var(--text3)">${escHtml(o.shipTo?.state||'')} ${escHtml((o.shipTo?.postalCode||'').substring(0,5))}</span>
          <span style="color:var(--text4);font-size:10px">— rate shop</span>
        </div>`;
      }
    }

    if (rated > 0) {
      list.innerHTML = html;
      summary.style.display = '';
      summary.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-weight:700">
          <span>${rated} of ${orders.length} rated${missing ? ` · <span style="color:var(--yellow)">${missing} need rate shop</span>` : ''}</span>
          <span style="color:var(--green-dark);font-size:14px">Total: $${totalCost.toFixed(2)}</span>
        </div>
        <div style="color:var(--text3);font-size:11px;margin-top:2px">Avg: $${(totalCost/rated).toFixed(2)}/order · Each order uses its cheapest carrier</div>`;
      if (missing === 0) {
        // All already rated — hide Rate Shop button and enable Create + Queue buttons
        const rateBtn   = document.getElementById('batch-rate-btn');
        const createBtn = document.getElementById('batch-create-btn');
        const queueBtn  = document.getElementById('batch-queue-btn');
        if (rateBtn)   rateBtn.style.display = 'none';
        if (createBtn) { createBtn.style.opacity = '1'; createBtn.style.pointerEvents = 'auto'; }
        if (queueBtn)  { queueBtn.style.opacity = '1'; queueBtn.style.pointerEvents = 'auto'; }
      }
    }
  }, 50);
}

export function batchApplyToAll() {
  state.batchForceShared = true;
  const btn = document.getElementById('batch-apply-all-btn');
  if (btn) { btn.textContent = '✓ Applied'; btn.disabled = true; }
  showToast('Batch weight/dims will apply to all orders');
}

// Auto-package matching: when user enters dims, find or create matching package
export async function autoMatchPackageByDims() {
  const l = parseFloat(document.getElementById('batch-l')?.value) || 0;
  const w = parseFloat(document.getElementById('batch-w')?.value) || 0;
  const h = parseFloat(document.getElementById('batch-h')?.value) || 0;
  const pkgSel = document.getElementById('batch-package');

  if (!l || !w || !h || !pkgSel) return;

  try {
    // Try to find existing package with matching dims
    const pkg = await fetchValidatedJson(`/api/packages/find-by-dims?length=${l}&width=${w}&height=${h}`, undefined, parseNullablePackageDto);

    if (pkg) {
      // Found exact match — auto-select it
      pkgSel.value = pkg.packageId;
      showToast(`📦 Auto-selected: ${escHtml(pkg.name)}`);
    } else {
      // No match found — check if single-SKU batch, then prompt to auto-create
      const ids = [...state.selectedOrders];
      const orders = ids.map(id => state.allOrders.find(o => o.orderId === id)).filter(Boolean);
      const skus = [...new Set(orders.map(o => getOrderPrimarySku(o)))];
      const isSingleSku = skus.length === 1 && skus[0];

      if (isSingleSku) {
        // Get clientId from any order's store
        const storeId = getOrderStoreId(orders[0]);
        const client = (state.clientsList || []).find(c => Array.isArray(c.storeIds) && c.storeIds.includes(storeId));
        const clientId = client?.clientId;

        if (clientId) {
          // Auto-create the package and set as SKU default
          const createResult = await fetchValidatedJson('/api/packages/auto-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ length: l, width: w, height: h, sku: isSingleSku, clientId }),
          }, parseAutoCreatePackageResponse);
          if (createResult.ok && createResult.package) {
            pkgSel.value = createResult.package.packageId;
            showToast(`✨ Created & selected: ${createResult.package.name} (saved as default for ${isSingleSku})`);
            // Refresh packages list to include new package
            const pkgs = await fetchValidatedJson('/api/packages?source=custom', undefined, parsePackageDtoList);
            state.packagesList = pkgs;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[AutoMatch] Error:', e);
  }
}

export async function batchRateShop() {
  const ids    = [...state.selectedOrders];
  const orders = ids.map(id => state.allOrders.find(o => o.orderId === id)).filter(Boolean);
  const sharedWt = parseFloat(document.getElementById('batch-weight')?.value) || 0;
  const sharedL  = parseFloat(document.getElementById('batch-l')?.value) || 0;
  const sharedW  = parseFloat(document.getElementById('batch-w')?.value) || 0;
  const sharedH  = parseFloat(document.getElementById('batch-h')?.value) || 0;

  function getOrderParams(o) {
    if (state.batchForceShared) return { wt: sharedWt, l: sharedL, w: sharedW, h: sharedH };
    const wt   = (o._enrichedWeight || o.weight)?.value || sharedWt;
    const dSrc = o._enrichedDims || getOrderDimensions(o) || {};
    return { wt, l: dSrc.length || sharedL, w: dSrc.width || sharedW, h: dSrc.height || sharedH };
  }

  const invalid = orders.filter(o => { const p = getOrderParams(o); return !p.wt || !p.l || !p.w || !p.h; });
  if (invalid.length) { showToast(`⚠ ${invalid.length} order(s) missing weight or dims`); return; }

  const btn     = document.getElementById('batch-rate-btn');
  const list    = document.getElementById('batch-rates-list');
  const summary = document.getElementById('batch-rates-summary');
  btn.disabled  = true;
  btn.textContent = 'Shopping…';
  list.innerHTML = orders.map(o =>
    `<div id="br-${o.orderId}" style="padding:6px 10px;font-size:11px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
      <span style="font-family:monospace;color:var(--ss-blue);min-width:100px">${escHtml((o.orderNumber||'').slice(-8))}</span>
      <span style="color:var(--text3)">${escHtml(o.shipTo?.state||'')} ${escHtml((o.shipTo?.postalCode||'').substring(0,5))}</span>
      <span style="color:var(--text4);font-size:10px">⏳ shopping…</span>
    </div>`
  ).join('');

  let totalCost = 0, rated = 0, failed = 0;

  // Group orders by (weight|zip|dims|storeId) to use bulk cache efficiently
  const groups = {};
  orders.forEach(o => {
    const p   = getOrderParams(o);
    const zip = (o.shipTo?.postalCode || '').replace(/\D/g,'').slice(0,5);
    const storeId = getOrderStoreId(o);
    const key = `${Math.round(p.wt)}|${zip}|${p.l}x${p.w}x${p.h}|${storeId}`;
    if (!groups[key]) groups[key] = { key, wt: Math.round(p.wt), zip, dims: { length: p.l, width: p.w, height: p.h }, storeId, ids: [] };
    groups[key].ids.push(o.orderId);
  });

  // Try bulk cache first — returns { results: { [key]: { cached, rates } }, missing: [...] }
  try {
    const data = await fetchValidatedJson('/api/rates/cached/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.values(groups).map(g => ({ key: g.key, wt: g.wt, zip: g.zip, dims: g.dims, ids: g.ids, storeId: g.storeId }))),
    }, parseBulkCachedRatesResponse);

    for (const [key, item] of Object.entries(data.results || {})) {
      if (item.cached && item.rates?.length) {
        const group = groups[key];
        if (!group) continue;
        group.ids.forEach(id => {
          const ord     = state.allOrders.find(o => o.orderId === id);
          const spid    = getOrderBillingProviderId(ord);
          const storeId = getOrderStoreId(ord);
          const best    = pickBestRate(item.rates, spid, storeId);
          if (best) {
            state.orderBestRate[id] = best;
            const el   = document.getElementById(`br-${id}`);
            const cc   = CARRIER_NAMES[best.carrierCode] || best.carrierCode;
            const sc   = SERVICE_NAMES[best.serviceCode] || best.serviceName || best.serviceCode;
            const cost = applyCarrierMarkup(best, spid, storeId);
            if (el) el.innerHTML = `
              <span style="font-family:monospace;color:var(--ss-blue);min-width:100px">${escHtml((ord?.orderNumber||'').slice(-8))}</span>
              <span style="font-size:10px;color:var(--text2)">${escHtml(cc)} · ${escHtml((sc+'').substring(0,18))}</span>
              <strong style="color:var(--green-dark)">$${cost.toFixed(2)}</strong>`;
            totalCost += cost;
            rated++;
          }
        });
      }
    }
  } catch {}

  // Live fetch for any orders not resolved from cache
  const uncached = orders.filter(o => !state.orderBestRate[o.orderId]);
  for (const o of uncached) {
    const p   = getOrderParams(o);
    const zip = (o.shipTo?.postalCode || '').replace(/\D/g,'').slice(0,5);
    const storeId = getOrderStoreId(o);
    try {
      const rates = await fetchValidatedJson('/api/rates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPostalCode: '90248', toPostalCode: zip, weight: { value: p.wt, units: 'ounces' }, dimensions: { length: p.l, width: p.w, height: p.h }, storeId }),
      }, parseLiveRatesResponse);
      const spid  = getOrderBillingProviderId(o);
      const best  = pickBestRate(rates, spid, storeId);
      const el    = document.getElementById(`br-${o.orderId}`);
      if (best) {
        // FIX: persist best rate to state so batchCreateLabels can read carrier/service
        state.orderBestRate[o.orderId] = best;
        const cc   = CARRIER_NAMES[best.carrierCode] || best.carrierCode;
        const sc   = SERVICE_NAMES[best.serviceCode] || best.serviceName || best.serviceCode;
        const cost = applyCarrierMarkup(best, spid, storeId);
        if (el) el.innerHTML = `
          <span style="font-family:monospace;color:var(--ss-blue);min-width:100px">${escHtml((o.orderNumber||'').slice(-8))}</span>
          <span style="font-size:10px;color:var(--text2)">${escHtml(cc)} · ${escHtml((sc+'').substring(0,18))}</span>
          <strong style="color:var(--green-dark)">$${cost.toFixed(2)}</strong>`;
        totalCost += cost;
        rated++;
      } else {
        if (el) el.innerHTML = `
          <span style="font-family:monospace;color:var(--ss-blue);min-width:100px">${escHtml((o.orderNumber||'').slice(-8))}</span>
          <span style="color:var(--text3)">${escHtml(o.shipTo?.state||'')} ${escHtml(zip)}</span>
          <span style="color:var(--red);font-size:10px">❌ no rates</span>`;
        failed++;
      }
    } catch {
      failed++;
    }
  }

  btn.disabled = false;
  btn.textContent = 'Rate Shop All';
  summary.style.display = '';
  summary.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-weight:700">
      <span>${rated} of ${orders.length} rated${failed ? ` · <span style="color:var(--red)">${failed} failed</span>` : ''}</span>
      <span style="color:var(--green-dark);font-size:14px">Total: $${totalCost.toFixed(2)}</span>
    </div>
    <div style="color:var(--text3);font-size:11px;margin-top:2px">Avg: $${rated ? (totalCost/rated).toFixed(2) : '0.00'}/order</div>`;
  if (rated > 0) {
    const createBtn = document.getElementById('batch-create-btn');
    if (createBtn) { createBtn.style.opacity = '1'; createBtn.style.pointerEvents = 'auto'; }
  }
}

export async function batchCreateLabels() {
  const ids    = [...state.selectedOrders];
  const orders = ids.map(id => state.allOrders.find(o => o.orderId === id)).filter(Boolean);

  if (!orders.length) {
    showToast('⚠ No orders selected');
    return;
  }

  // All orders must have a best rate stored (from batchRateShop) — rate provides both
  // serviceCode AND carrierCode, both required by the backend.
  const missingRate = orders.find(o => !state.orderBestRate[o.orderId]);
  if (missingRate) {
    showToast(`⚠ Rate Shop first — order ${missingRate.orderNumber} has no rate selected`);
    return;
  }

  const btn = document.getElementById('batch-create-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  // Read panel weight/dims — sent to backend as authoritative values.
  // Backend auto-resolves from DB if these are 0, so no harm in always sending.
  const panelWt = parseFloat(document.getElementById('batch-weight')?.value) || 0;
  const panelL  = parseFloat(document.getElementById('batch-l')?.value) || 0;
  const panelW  = parseFloat(document.getElementById('batch-w')?.value) || 0;
  const panelH  = parseFloat(document.getElementById('batch-h')?.value) || 0;
  const hasPanelDims = panelL > 0 && panelW > 0 && panelH > 0;

  let created = 0, failed = 0;
  const failures  = [];
  const labelDownloads = []; // collect { orderNumber, tracking, labelUrl } for auto-download

  for (const o of orders) {
    try {
      const bestRate = state.orderBestRate[o.orderId];

      // Both serviceCode AND carrierCode are required — the guard above ensures bestRate exists
      const serviceCode = bestRate.serviceCode;
      const carrierCode = bestRate.carrierCode;

      if (!serviceCode || !carrierCode) {
        console.warn(`[Batch] Order ${o.orderNumber} best rate missing serviceCode or carrierCode`, bestRate);
        failed++;
        failures.push(o.orderNumber);
        continue;
      }

      const labelReq = {
        orderId:     o.orderId,
        serviceCode,
        carrierCode,
        packageCode: 'package',
        ...(panelWt       ? { weightOz: panelWt }                              : {}),
        ...(hasPanelDims  ? { length: panelL, width: panelW, height: panelH }  : {}),
      };

      const data = await fetchValidatedJson('/api/labels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labelReq),
      }, parseCreateLabelResponse);

      created++;
      console.log(`[Batch] ✓ Created label for ${o.orderNumber}`, data);
      if (data.labelUrl) {
        labelDownloads.push({ orderNumber: o.orderNumber, tracking: data.trackingNumber, labelUrl: data.labelUrl });
      }
    } catch (e) {
      console.error(`[Batch] Exception for ${o.orderNumber}:`, e.message);
      failed++;
      failures.push(`${o.orderNumber} (${e.message || 'unknown'})`);
    }
  }

  btn.disabled = false;
  btn.textContent = `🖨️ Create ${orders.length} Labels`;

  if (failed === 0) {
    showToast(`✅ Created ${created}/${orders.length} labels successfully`);
  } else if (created === 0) {
    showToast(`❌ Failed to create ${failed}/${orders.length} labels: ${failures.slice(0,3).join(', ')}${failures.length > 3 ? '…' : ''}`);
  } else {
    showToast(`⚠️ Created ${created}/${orders.length} labels · ${failed} failed: ${failures.slice(0,2).join(', ')}${failures.length > 2 ? '…' : ''}`);
  }

  // Auto-download all label PDFs — use <a download> to avoid popup blocking
  if (labelDownloads.length > 0) {
    for (const { orderNumber, tracking, labelUrl } of labelDownloads) {
      try {
        const a      = document.createElement('a');
        a.href       = labelUrl;
        a.download   = `label-${tracking || orderNumber}.pdf`;
        a.target     = '_blank';
        a.rel        = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Brief pause between downloads to avoid browser rate-limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (pdfErr) {
        console.warn(`[Batch] Could not download PDF for ${orderNumber}:`, pdfErr.message);
      }
    }
    if (labelDownloads.length < created) {
      showToast(`⚠ ${created - labelDownloads.length} label(s) created but no PDF returned — check ShipStation`);
    }
  }

  // Refresh orders to show updated tracking numbers
  if (created > 0) {
    const { fetchOrders } = await import('./orders.js');
    fetchOrders(state.currentPage, true);
  }

  // Clear selection and close panel
  state.selectedOrders.clear();
  updateBatchBar();
  if (typeof window.closePanel === 'function') {
    window.closePanel();
  }
}

// ─── Batch Send to Queue (create labels + queue them without PDF download) ──────
export async function batchSendToQueue() {
  const ids    = [...state.selectedOrders];
  const orders = ids.map(id => state.allOrders.find(o => o.orderId === id)).filter(Boolean);

  if (!orders.length) {
    showToast('⚠ No orders selected');
    return;
  }

  // All orders must have a best rate (from batchRateShop)
  const missingRate = orders.find(o => !state.orderBestRate[o.orderId]);
  if (missingRate) {
    showToast(`⚠ Rate Shop first — order ${missingRate.orderNumber} has no rate selected`);
    return;
  }

  const btn = document.getElementById('batch-queue-btn');
  btn.disabled = true;
  btn.textContent = 'Queuing…';

  // Read panel weight/dims
  const panelWt = parseFloat(document.getElementById('batch-weight')?.value) || 0;
  const panelL  = parseFloat(document.getElementById('batch-l')?.value) || 0;
  const panelW  = parseFloat(document.getElementById('batch-w')?.value) || 0;
  const panelH  = parseFloat(document.getElementById('batch-h')?.value) || 0;
  const hasPanelDims = panelL > 0 && panelW > 0 && panelH > 0;

  let queued = 0, failed = 0;
  const failures = [];

  for (const o of orders) {
    try {
      const bestRate = state.orderBestRate[o.orderId];
      const serviceCode = bestRate.serviceCode;
      const carrierCode = bestRate.carrierCode;

      if (!serviceCode || !carrierCode) {
        throw new Error('Missing serviceCode or carrierCode in best rate');
      }

      // Resolve weight/dimensions
      const wtOz = hasPanelDims
        ? panelWt > 0 ? panelWt * 16 : ((o._enrichedWeight || o.weight)?.value || 0)
        : (o._enrichedWeight || o.weight)?.value || 0;

      const dims = hasPanelDims
        ? { length: panelL, width: panelW, height: panelH }
        : o._enrichedDims || getOrderDimensions(o) || {};

      // Create label using best rate's carrier/service
      const labelResp = await fetch('/api/labels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: o.orderId,
          carrierCode: carrierCode,
          serviceCode: serviceCode,
          weight: wtOz,
          length: dims.length || 0,
          width: dims.width || 0,
          height: dims.height || 0,
        }),
      });

      if (!labelResp.ok) {
        const err = await parseErrorResponse(labelResp);
        throw new Error(err || 'Label creation failed');
      }

      const labelData = await labelResp.json();

      // Queue the label (add to print queue)
      const queueResp = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: o.orderId,
          labelId: labelData.labelId,
        }),
      });

      if (!queueResp.ok) {
        const err = await parseErrorResponse(queueResp);
        throw new Error(err || 'Queue add failed');
      }

      queued++;
    } catch (e) {
      console.error(`[Batch Queue] Order ${o.orderNumber} failed:`, e.message);
      failed++;
      failures.push({ orderNumber: o.orderNumber, error: e.message });
    }
  }

  // Re-fetch queue to update UI
  await fetchQueue(state.currentStoreId);
  await loadOrders();

  btn.disabled = false;
  btn.textContent = `📥 Queue ${orders.length}`;

  if (failed === 0) {
    showToast(`✅ Queued ${queued} orders`);
    closeBatchPanel();
  } else {
    const msg = failures.map(f => `${f.orderNumber}: ${f.error}`).join(' | ');
    showToast(`⚠ ${queued} queued, ${failed} failed: ${msg}`);
  }
}

// Save per-SKU dimensions for multi-SKU batches
export async function saveBatchSkuDims(sku, orderCount) {
  const wtInput = document.querySelector(`.sku-weight[data-sku="${sku}"]`);
  const pkgInput = document.querySelector(`.sku-package[data-sku="${sku}"]`);
  const lInput = document.querySelector(`.sku-length[data-sku="${sku}"]`);
  const wInput = document.querySelector(`.sku-width[data-sku="${sku}"]`);
  const hInput = document.querySelector(`.sku-height[data-sku="${sku}"]`);

  const wt = parseFloat(wtInput?.value) || 0;
  const pkg = pkgInput?.value || null;
  const l = parseFloat(lInput?.value) || 0;
  const w = parseFloat(wInput?.value) || 0;
  const h = parseFloat(hInput?.value) || 0;

  if (!wt && !l && !w && !h) {
    showToast(`⚠ Enter at least weight or dimensions for ${sku}`);
    return;
  }

  try {
    // Save to product defaults (weight + dims)
    const r = await fetch(`/api/products/${encodeURIComponent(sku)}/defaults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weight: wt || null,
        length: l || null,
        width: w || null,
        height: h || null,
        packageId: pkg || null,
      }),
    });

    if (r.ok) {
      showToast(`✅ Saved defaults for ${sku} (applies to all future orders)`);
      console.log(`[Batch] Saved SKU defaults:`, { sku, wt, l, w, h, pkg });
    } else {
      showToast(`❌ Error saving defaults: ${await parseErrorResponse(r)}`);
    }
  } catch (e) {
    console.error('[Batch] Error saving SKU defaults:', e.message);
    showToast(`❌ Error saving defaults: ${e.message}`);
  }
}

// Expose for inline HTML handlers
window.getRates               = getRates;
window.updateProfitEstimate   = updateProfitEstimate;
window.showBatchPanel         = showBatchPanel;
window.batchApplyToAll        = batchApplyToAll;
window.batchRateShop          = batchRateShop;
window.autoMatchPackageByDims = autoMatchPackageByDims;
window.batchCreateLabels      = batchCreateLabels;
window.batchSendToQueue       = batchSendToQueue;
window.saveBatchSkuDims       = saveBatchSkuDims;
