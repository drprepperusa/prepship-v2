import { state } from './state.js';
import { escHtml, trunc, fmtWeight, showToast } from './utils.js';
import { CARRIER_SERVICES, SERVICE_NAMES, CARRIER_NAMES, carrierLogo, formatCarrierDisplay } from './constants.js';
import { applyCarrierMarkup, pickBestRate, priceDisplay, isResidential, applyRbMarkup, isOrionRate, formatOrionRateDisplay } from './markups.js';
import { updateServiceDropdown, getShipAcct } from './stores.js';
import { fetchValidatedJson } from './api-client.js';
import {
  parseAutoCreatePackageResponse,
  parseCachedRatesResponse,
  parseCarrierLookupResponse,
  parseLiveRatesResponse,
  parseOrderStatusMutationResponse,
  parsePackageDto,
  parseProductDefaults,
  parseSaveProductDefaultsResult,
} from './api-contracts.js';
import {
  getOrderBillingProviderId,
  getOrderConfirmation,
  getOrderCustomerUsername,
  getOrderDimensions,
  getOrderRequestedService,
  getOrderSelectedRate,
  getSelectedRateProviderId,
  getSelectedRateCost,
  getOrderShipTo,
  getOrderStoreId,
  getOrderWarehouseId,
  isExternallyFulfilledOrder,
} from './order-data.js';

// ─── Panel state ─────────────────────────────────────────────────────────────
const productDefaultsCache = {}; // sku → product object (or null if not found)
let _panelRateTimer = null;
let _dimsAutoTimer  = null;
let _panelStoreId = null; // set from openPanel(); used to fetch per-store carriers

// Preset dimensions
const PRESETS = {
  'Small':         { lb:0, oz:8,  len:8,  wid:6,  hgt:2  },
  'Medium':        { lb:1, oz:0,  len:12, wid:9,  hgt:4  },
  'Large':         { lb:2, oz:0,  len:16, wid:12, hgt:6  },
  'Poly Mailer S': { lb:0, oz:8,  len:10, wid:13, hgt:0  },
  'Poly Mailer L': { lb:1, oz:0,  len:14, wid:17, hgt:0  },
};

// ─── Helper: Get display carriers for current panel order ─────────────────────
function getPanelDisplayCarriers() {
  return state.panelStoreCarriers || state.carriersList;
}

// ─── Open / Close ─────────────────────────────────────────────────────────────
export async function openPanel(id) {
  const { allOrders, packagesList, locationsList, selectedOrders } = state;
  const o = allOrders.find(o => o.orderId === id);
  if (!o) return;

  // Ensure packages + locations are loaded before building panel
  if (!packagesList.length) {
    const { loadPackages } = await import('./packages-ui.js');
    await loadPackages();
  }
  if (!locationsList.length) {
    const { loadLocations } = await import('./locations-ui.js');
    await loadLocations();
  }

  state.currentPanelOrder = o;
  _panelStoreId = getOrderStoreId(o);
  
  // Fetch per-store carriers if this order belongs to a multi-tenant client (e.g., KF Goods)
  if (_panelStoreId) {
    try {
      const { carriers: storeCarriers } = await fetchValidatedJson(`/api/carriers-for-store?storeId=${_panelStoreId}`, undefined, parseCarrierLookupResponse);
      state.panelStoreCarriers = storeCarriers;
    } catch (e) {
      console.warn('[panel] Error fetching store carriers:', e.message);
      state.panelStoreCarriers = null;
    }
  } else {
    state.panelStoreCarriers = null;
  }

  // Single-select mode: clear all other selections unless multi-select (>1 already checked)
  if (selectedOrders.size <= 1) {
    selectedOrders.forEach(prevId => {
      if (prevId === id) return;
      const prevRow = document.getElementById(`row-${prevId}`);
      if (prevRow) prevRow.classList.remove('row-selected', 'row-panel-open');
      const prevCb = document.querySelector(`#row-${prevId} input[type=checkbox]`);
      if (prevCb) prevCb.checked = false;
    });
    selectedOrders.clear();
  }

  // Highlight current row
  document.querySelectorAll('.row-panel-open').forEach(r => r.classList.remove('row-panel-open'));
  const rowEl = document.getElementById(`row-${id}`);
  if (rowEl) rowEl.classList.add('row-selected', 'row-panel-open');
  selectedOrders.add(id);
  const rowCb = document.querySelector(`#row-${id} input[type=checkbox]`);
  if (rowCb) rowCb.checked = true;
  if (window.updateBatchBar) window.updateBatchBar();

  // Build panel HTML
  document.getElementById('panelInner').innerHTML = buildPanelHTML(o);
  const confirmEl = document.getElementById('p-confirm');
  if (confirmEl) {
    const rawConfirmation = getOrderConfirmation(o);
    confirmEl.value = rawConfirmation && rawConfirmation !== 'none' ? rawConfirmation : 'delivery';
  }

  // Shipped/cancelled: make all shipping fields read-only
  if (o.orderStatus !== 'awaiting_shipment') {
    document.querySelectorAll('#sec-shipping select, #sec-shipping input').forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.7';
      el.style.cursor = 'default';
    });
  }

  // Initialize rate display with loading state to prevent stale cached rates from flashing
  const panelRateEl = document.getElementById('panel-rate-val');
  if (panelRateEl) {
    panelRateEl.innerHTML = '<span style="color:var(--text3);font-size:11px">Loading rates…</span>';
  }
  
  syncPanelFromBestRate(id);       // pre-select ship acct + service from table's best rate
  await maybeApplySkuDefaults(o);  // silently fill missing weight/dims from product DB
  await maybeAutoMatchPackage(o);  // try to find + pre-select package matching the current dimensions

  // Show ✓ badges next to Weight / Size / Package if this SKU has saved defaults
  {
    const skuItems = (o.items || []).filter(i => !i.adjustment && i.sku);
    const skus = [...new Set(skuItems.map(i => i.sku))];
    const prod = skus.length === 1 ? productDefaultsCache[skus[0]] : null;
    const hasSavedWt   = !!(prod && prod.weightOz > 0);
    const hasSavedDims = !!(prod && prod.length > 0 && prod.width > 0 && prod.height > 0);
    
    // BUG FIX: defaultPackageCode is a STRING code (like "package"), not a numeric packageId
    // Must look up the actual packageId from the packages list
    let savedPkgId = null;
    if (prod && (prod.defaultPackageCode || prod.packageCode)) {
      const pkgCode = prod.defaultPackageCode || prod.packageCode;
      const pkgMatch = state.packagesList.find(p => p.packageCode === pkgCode);
      savedPkgId = pkgMatch ? String(pkgMatch.packageId) : null;
    }
    
    // If product doesn't have a default package, check if this ORDER has a saved package selection
    const show = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? 'inline' : 'none'; };
    show('p-wt-badge',      hasSavedWt);
    show('p-dims-badge',    hasSavedDims);
    show('sku-saved-badge', !!(savedPkgId && savedPkgId !== '__custom__'));
    // Set the package dropdown and show dims if a package is saved for this SKU or order
    if (savedPkgId && savedPkgId !== '__custom__') {
      await applyPackagePreset(savedPkgId);  // Pre-flight checks + set value safely
    }
  }

  document.getElementById('orderPanel').classList.add('open');
  // Backdrop only on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('panelBackdrop').classList.add('show');
  }

  // Start rate fetch — only for awaiting_shipment orders
  if (o.orderStatus === 'awaiting_shipment') {
    fetchPanelRate(o);
  }
}

export function closePanel() {
  console.log('[closePanel] Closing panel');
  document.getElementById('orderPanel').classList.remove('open');
  document.getElementById('panelBackdrop').classList.remove('show');
  document.querySelectorAll('.row-panel-open').forEach(r => r.classList.remove('row-panel-open'));
  state.currentPanelOrder = null;
  // Desktop: panel stays visible — show empty state with shortcuts guide
  document.getElementById('panelInner').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:100%;padding:40px 20px;text-align:center;color:var(--text3)">
      <div style="font-size:36px;margin-bottom:14px;opacity:.5">📋</div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text2)">No order selected</div>
      <div style="font-size:12px;line-height:1.5;margin-bottom:20px">Click any row to view details</div>
      <div style="text-align:left;font-size:11px;line-height:2;color:var(--text4);border-top:1px solid var(--border);padding-top:14px;width:100%;max-width:180px">
        <div><kbd style="background:var(--surface3);padding:1px 5px;border-radius:3px;font-size:10px;border:1px solid var(--border2)">↑↓</kbd> Navigate rows</div>
        <div><kbd style="background:var(--surface3);padding:1px 5px;border-radius:3px;font-size:10px;border:1px solid var(--border2)">Enter</kbd> Select / deselect</div>
        <div><kbd style="background:var(--surface3);padding:1px 5px;border-radius:3px;font-size:10px;border:1px solid var(--border2)">Esc</kbd> Deselect &amp; close</div>
        <div><kbd style="background:var(--surface3);padding:1px 5px;border-radius:3px;font-size:10px;border:1px solid var(--border2)">⌘C</kbd> Copy order #</div>
      </div>
    </div>`;
}

// ─── Panel HTML ────────────────────────────────────────────────────────────────
export function buildPanelHTML(o) {
  const { filteredOrders, locationsList, packagesList } = state;
  const displayCarriers = getPanelDisplayCarriers();
  const isShipped = o.orderStatus !== 'awaiting_shipment';
  const items     = o.items.filter(i => !i.adjustment);
  const dimensions = getOrderDimensions(o);
  const shipTo = getOrderShipTo(o);
  const requestedService = getOrderRequestedService(o);
  const rawConfirmation = getOrderConfirmation(o);
  const confirmation = rawConfirmation && rawConfirmation !== 'none' ? rawConfirmation : 'delivery';
  const wt        = o.weight?.value || 0;
  const wtLb      = Math.floor(wt / 16);
  const wtOz      = (wt % 16).toFixed(0);
  const len       = dimensions.length || 0;
  const wid       = dimensions.width  || 0;
  const hgt       = dimensions.height || 0;
  const zip       = shipTo.postalCode || '';
  const addr      = shipTo && Object.keys(shipTo).length
    ? [shipTo.street1, shipTo.street2, `${shipTo.city||''}, ${shipTo.state||''} ${zip}`, shipTo.country||'US']
        .filter(Boolean).join('\n')
    : '—';

  // Panel prev/next navigation
  const curIdx = filteredOrders.findIndex(fo => fo.orderId === o.orderId);
  const prevId = curIdx > 0 ? filteredOrders[curIdx - 1].orderId : null;
  const nextId = curIdx < filteredOrders.length - 1 ? filteredOrders[curIdx + 1].orderId : null;

  return `
  
  <div class="panel-topbar">
    <button onclick="${prevId ? `openPanel(${prevId})` : ''}" style="background:none;border:none;cursor:${prevId?'pointer':'default'};color:${prevId?'var(--text2)':'var(--text4)'};font-size:14px;padding:2px 4px;border-radius:4px" title="Previous order" ${prevId?'':'disabled'}>‹</button>
    <button onclick="${nextId ? `openPanel(${nextId})` : ''}" style="background:none;border:none;cursor:${nextId?'pointer':'default'};color:${nextId?'var(--text2)':'var(--text4)'};font-size:14px;padding:2px 4px;border-radius:4px" title="Next order" ${nextId?'':'disabled'}>›</button>
    <div class="panel-ordnum"><span class="od-order-link" onclick="openOrderDetail(${o.orderId})" title="Open full detail view">${o.orderNumber}</span> <span style="font-size:10px;font-weight:500;color:var(--text3)">${curIdx >= 0 ? `${curIdx+1}/${filteredOrders.length}` : ''}</span></div>
    <button class="panel-topbar-btn" onclick="showBatchMenu(event, ${o.orderId})">Batch ▾</button>
    <button class="panel-topbar-btn" onclick="showPrintMenu(event, ${o.orderId})">Print ▾</button>
    <a class="panel-topbar-btn" href="https://ship.shipstation.com/orders/${o.orderId}" target="_blank" style="text-decoration:none;font-size:10px;color:var(--text3)" title="Open in ShipStation">↗ SS</a>
    ${isShipped ? '' : `<button class="panel-topbar-btn" style="color:#b45309;border-color:#fbbf24" onclick="showExtShipMenu(event,${o.orderId})" title="Mark as shipped via Amazon, eBay, Walmart, etc.">✈ Mark as Shipped</button>`}
    <button class="panel-close" onclick="closePanel()">✕</button>
  </div>

  
  <div class="panel-body">

    
    <div class="panel-section" id="sec-shipping">
      <div class="panel-section-header" onclick="togglePanelSection('shipping')">
        <span class="panel-section-arrow">▶</span>
        <span class="panel-section-title">Shipping</span>
        <div class="panel-section-icons">
          <span class="panel-section-icon" title="Settings">⚙</span>
          <span class="panel-section-icon" title="Grid">⊞</span>
        </div>
      </div>

      
      <div class="ship-req">
        Requested: <span class="ship-req-link">${(requestedService || 'Standard').replace(/_/g,' ')}</span>
        ${!o.carrierCode?'<span style="margin-left:4px">(unmapped)</span>':''}
      </div>

      <div class="panel-section-body">

        
        <div class="ship-field-row">
          <span class="ship-field-label">Ship From</span>
          <div class="ship-field-value">
            <select class="ship-select" id="p-location" style="flex:1">
              ${(()=>{
                const whId = getOrderWarehouseId(o);
                return locationsList.map(l=>`<option value="${l.locationId}"${(whId ? l.locationId===whId : l.isDefault)?' selected':''}>${escHtml(l.name)}</option>`).join('') || '<option value="">Loading…</option>';
              })()}
            </select>
            <button class="ship-icon-btn" onclick="showView('locations')" title="Manage locations">📍</button>
          </div>
        </div>

        
        <div class="ship-field-row">
          <span class="ship-field-label">Ship Acct</span>
          <div class="ship-field-value">
            <select class="ship-select" id="p-shipacct" onchange="onShipAcctChange()" style="flex:1">
              <option value="">— Select Account —</option>
              ${displayCarriers.map(c=>`<option value="${c.shippingProviderId}"${c.shippingProviderId===getOrderBillingProviderId(o)?'selected':''}>${escHtml(c._label||c.nickname||c.accountNumber||c.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        
        <div class="ship-field-row">
          <span class="ship-field-label">Service</span>
          <div class="ship-field-value">
            <select class="ship-select" id="p-service" style="flex:1" onchange="debouncePanelRate()">
              ${(()=>{
                const pid  = getOrderBillingProviderId(o);
                const acct = displayCarriers.find(c=>c.shippingProviderId===pid);
                const svcs = (acct && CARRIER_SERVICES[acct.code])
                  || [...(CARRIER_SERVICES.stamps_com||[]),...(CARRIER_SERVICES.ups||[])];
                return '<option value="">Select Service</option>' +
                  svcs.map(s=>`<option value="${s.code}">${s.label}</option>`).join('');
              })()}
            </select>
          </div>
        </div>

        
        <div class="ship-field-row">
          <span class="ship-field-label">Weight <span id="p-wt-badge" title="Weight saved for this SKU" style="font-size:10px;font-weight:700;color:var(--green,#16a34a);margin-left:3px;display:none">✓</span></span>
          <div class="ship-field-value">
            <input type="number" class="ship-input ship-input-sm" id="p-wtlb" value="${wtLb}" min="0" step="1"
              oninput="debouncePanelRate()">
            <span class="ship-input-unit">lb</span>
            <input type="number" class="ship-input ship-input-sm" id="p-wtoz" value="${wtOz}" min="0" max="15" step="1"
              oninput="debouncePanelRate()">
            <span class="ship-input-unit">oz</span>
          </div>
        </div>

        
        <div class="ship-field-row">
          <span class="ship-field-label">Size <span id="p-dims-badge" title="Dims saved for this SKU" style="font-size:10px;font-weight:700;color:var(--green,#16a34a);margin-left:3px;display:none">✓</span></span>
          <div class="ship-field-value" style="gap:3px;flex-wrap:wrap">
            <input type="number" class="ship-input ship-input-sm" id="p-len" value="${len||''}" min="0" step="0.1" placeholder="0"
              oninput="onDimsInput()">
            <span class="ship-input-unit">L</span>
            <input type="number" class="ship-input ship-input-sm" id="p-wid" value="${wid||''}" min="0" step="0.1" placeholder="0"
              oninput="onDimsInput()">
            <span class="ship-input-unit">W</span>
            <input type="number" class="ship-input ship-input-sm" id="p-hgt" value="${hgt||''}" min="0" step="0.1" placeholder="0"
              oninput="onDimsInput()">
            <span class="ship-input-unit">H (in)</span>
          </div>
        </div>

        
        <div class="ship-field-row" style="border-bottom:none;padding-bottom:2px">
          <span class="ship-field-label">Package <span id="sku-saved-badge" title="Package saved for this SKU" style="font-size:10px;font-weight:700;color:var(--green,#16a34a);margin-left:3px;display:none">✓</span></span>
          <div class="ship-field-value">
            <select class="ship-select" id="p-package" onchange="applyPackagePreset(this.value)" style="flex:1">
              <option value="">— Select Package —</option>
              ${(() => {
                const custom  = packagesList.filter(p => p.source !== 'ss_carrier');
                const carrier = packagesList.filter(p => p.source === 'ss_carrier');
                const CLABEL  = { stamps_com:'USPS', ups:'UPS', fedex:'FedEx' };
                const opt = p => `<option value="${p.packageId}">${escHtml(p.name.replace(/^\[USPS\] |\[UPS\] |\[FedEx\] /,''))}</option>`;
                let html = '';
                if (custom.length)  html += `<optgroup label="Custom Packages">${custom.map(opt).join('')}</optgroup>`;
                const carriers = [...new Set(carrier.map(p => p.carrierCode))];
                carriers.forEach(cc => {
                  const cPkgs = carrier.filter(p => p.carrierCode === cc);
                  html += `<optgroup label="${CLABEL[cc]||cc.toUpperCase()} Packages">${cPkgs.map(opt).join('')}</optgroup>`;
                });
                return html || '<option value="" disabled>No packages — add in Packages tab</option>';
              })()}
              <option value="__custom__">Custom dims…</option>
            </select>
            <button class="ship-icon-btn" onclick="showView('packages')" title="Manage packages">📐</button>
          </div>
        </div>
        <div id="p-package-dims" style="padding:0 0 6px 98px;font-size:10px;font-weight:600;color:var(--green,#16a34a);border-bottom:1px solid var(--border);display:none"></div>
        ${isShipped ? '' : `
        
        <div style="padding:4px 0">
          <button class="btn btn-primary btn-sm" onclick="openRateBrowser()" style="font-size:11.5px;gap:4px">🔍 Browse Rates</button>
        </div>

        
        <div class="ship-field-row">
          <span class="ship-field-label">Confirmation</span>
          <div class="ship-field-value">
            <select class="ship-select" id="p-confirm">
              <option value="none"${confirmation === 'none' ? ' selected' : ''}>None</option>
              <option value="delivery"${confirmation === 'delivery' ? ' selected' : ''}>Delivery</option>
              <option value="signature"${confirmation === 'signature' ? ' selected' : ''}>Signature</option>
              <option value="adult_signature"${confirmation === 'adult_signature' ? ' selected' : ''}>Adult Signature</option>
              <option value="direct_signature"${confirmation === 'direct_signature' ? ' selected' : ''}>Direct Signature</option>
            </select>
          </div>
        </div>

        
        <div class="ship-field-row">
          <span class="ship-field-label">Insurance</span>
          <div class="ship-field-value" style="gap:5px;flex-wrap:wrap">
            <select class="ship-select" id="p-insure" onchange="toggleInsureVal()" style="flex:1">
              <option value="none">None</option>
              <option value="carrier">Carrier (up to $100)</option>
              <option value="shipsurance">Shipsurance</option>
            </select>
            <input type="number" class="ship-input ship-input-sm" id="p-insure-val"
              value="${(o.orderTotal||0).toFixed(2)}" min="0" step="0.01"
              placeholder="$0.00" style="width:68px;display:none" title="Insured value">
          </div>
        </div>
        `}

        
        <div class="ship-rate-row">
          <span style="font-size:11.5px;color:var(--text2);font-weight:500;width:90px;flex-shrink:0">Rate</span>
          ${isShipped ? (() => {
            // CHECK FOR EXTERNAL FULFILLMENT FIRST - if externally fulfilled, show badge regardless of other data
            if (isExternallyFulfilledOrder(o)) {
              return '<span style="font-size:11px;color:var(--text3);background:var(--surface3);border:1px solid var(--border2);border-radius:4px;padding:3px 8px" title="Label purchased outside ShipStation (eBay/Walmart/Amazon/etc.)">📦 Ext. label — purchased externally</span>';
            }
            
            const hasLabel = o.label?.cost != null;
            let cost = 0;
            let cc = '';
            let sc = '';
            let shippingProviderId = null;
            
            // Priority 1: Use label cost if label exists
            if (hasLabel) {
              cost = parseFloat(o.label?.cost) || 0;
              const ccRaw = o.label?.carrierCode || o.carrierCode || '';
              shippingProviderId = o.label?.shippingProviderId;
              
              // Get carrier account nickname from the persisted label provider id
              if (shippingProviderId && state.carriersList) {
                const acct = state.carriersList.find(c => c.shippingProviderId === shippingProviderId);
                if (acct) cc = acct._label || acct.nickname || acct.accountNumber || acct.name || '';
              }
              // Fallback to generic carrier code
              if (!cc) {
                cc = CARRIER_NAMES[ccRaw] || ccRaw.replace('stamps_com','USPS').replace('ups_walleted','UPS').replace('fedex_walleted','FedEx').replace('ups','UPS').replace('fedex','FedEx').toUpperCase();
              }
              sc = SERVICE_NAMES[o.label?.serviceCode || o.serviceCode] || (o.label?.serviceCode || o.serviceCode || '').replace(/_/g,' ');
            } 
            // Priority 2: Use the persisted selected rate (actual rate used at label creation)
            else if (o.selectedRate) {
              const selectedRate = getOrderSelectedRate(o);
              cost = getSelectedRateCost(o) || 0;
              cc = selectedRate?.providerAccountNickname || CARRIER_NAMES[selectedRate?.carrierCode] || selectedRate?.carrierCode || '';
              sc = selectedRate?.serviceName || selectedRate?.serviceCode || '';
              shippingProviderId = getSelectedRateProviderId(o);
            }
            // Priority 3: Fallback to order shipping amount
            else {
              cost = parseFloat(o.shippingAmount) || 0;
              cc = CARRIER_NAMES[o.carrierCode] || (o.carrierCode || '').replace('stamps_com','USPS').replace('ups','UPS').replace('fedex','FedEx').toUpperCase();
              sc = SERVICE_NAMES[o.serviceCode] || (o.serviceCode || '').replace(/_/g,' ');
            }
            
            // If still no rate data at all
            if (!hasLabel && !o.selectedRate && !cost) {
              // If NOT externally fulfilled but still no rate data, something's wrong (shouldn't happen)
              return '<span style="font-size:11px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:3px 8px" title="Order marked shipped but no shipment/rate data found. Check ShipStation.">⚠️ No shipment data</span>';
            }
            
            // Check if this is an ORION rate (shippingProviderId 596001 or carrierNickname contains 'ORI')
            const isOrion = shippingProviderId === 596001 || (cc && cc.includes('ORI'));
            
            // For ORION rates with markup, use priceDisplay() to show marked price on top, cost below
            let costStr = '';
            if (isOrion && hasLabel && o.label?.rawCost) {
              const rawCost = parseFloat(o.label.rawCost);
              costStr = priceDisplay(rawCost, cost, { mainSize: '13px', subSize: '10px' });
            } else {
              costStr = cost > 0
                ? '<span style="font-size:14px;font-weight:700;color:var(--green-dark)">$' + cost.toFixed(2) + '</span>'
                : '<span style="font-size:12px;color:var(--text3)">Cost N/A</span>';
            }
            
            const carrierDisplay = shippingProviderId && state.carrierAccountMap
              ? state.carrierAccountMap[shippingProviderId] || cc 
              : cc;
            const carrierStr = (carrierDisplay || sc) ? '<span style="font-size:10.5px;color:var(--text3);margin-left:6px">' + escHtml(carrierDisplay) + (sc ? ' · ' + escHtml(trunc(sc,22)) : '') + '</span>' : '';
            return costStr + carrierStr;
          })() : `
          <span class="ship-rate-val" id="panel-rate-val">—</span>
          <span style="flex:1"></span>
          <span class="ship-scout" onclick="fetchPanelRate()" title="Refresh rates">
            🔄 <span id="panel-scout-label">Scout Review</span>
          </span>
          `}
        </div>

        ${isShipped ? '' : `
        
        <button class="save-sku-btn" id="saveSkuBtn" onclick="saveSkuDefaults()" title="Save weight, dims &amp; package as defaults for this SKU (carrier and service not saved)">
          💾 Save weights and dims as SKU defaults
        </button>
        `}

      </div>
    </div>

    ${isShipped ? '' : `
    
    <div class="create-label-wrap">
      <button class="create-label-btn" id="createLabelBtn" onclick="createLabel()">
        🖨️ Create + Print Label <span class="create-label-caret">▾</span>
      </button>
      <button class="btn btn-ghost btn-sm" onclick="createLabel(true)" title="Create test label (no charge)"
        style="font-size:10.5px;color:var(--text3);padding:4px 7px">Test</button>
    </div>
    `}
    ${isShipped && o.label?.trackingNumber ? `
    <div class="delivery-row" style="display:flex;align-items:center;gap:6px">
      <span>📦 Tracking:</span>
      <span style="font-family:monospace;font-size:11px;color:var(--text);font-weight:600;cursor:pointer" onclick="navigator.clipboard.writeText('${o.label.trackingNumber}');showToast('📋 Tracking copied')" title="Click to copy">${o.label.trackingNumber}</span>
      <button class="btn btn-sm btn-ghost" onclick="reprintLabel(${o.orderId})" title="Download label PDF for printing" style="margin-left:auto;font-size:10.5px">🖨️ Reprint</button>
    </div>
    ` : ''}
    ${isShipped && o.label?.shipDate ? `
    <div class="delivery-row">Shipped: ${new Date(o.label.shipDate).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'})}</div>
    ` : `<div class="delivery-row" id="panel-delivery-row">Delivery: —</div>`}

    
    <div class="panel-section" id="sec-items">
      <div class="panel-section-header" onclick="togglePanelSection('items')">
        <span class="panel-section-arrow">▶</span>
        <span class="panel-section-title">Items</span>
        <div class="panel-section-icons">
          <span class="panel-section-icon">★</span>
          <span class="panel-section-icon">⊞</span>
        </div>
      </div>
      <div class="panel-section-body">
        ${items.map(item => `
          <div class="item-row">
            <div class="item-img">${item.imageUrl ? `<img src="${escHtml(item.imageUrl)}" style="width:42px;height:42px;border-radius:5px;object-fit:cover;cursor:zoom-in" onmouseenter="showThumbPreview(this, event)" onmouseleave="hideThumbPreview()">` : '📦'}</div>
            <div class="item-info">
              <div class="item-name">${item.name||'Unknown Item'}</div>
              <div class="item-sku">SKU: ${item.sku||'—'}</div>
              <div class="item-price-row">$${(+(item.unitPrice||0)).toFixed(2)}&nbsp;&times;&nbsp;${item.quantity||1}&nbsp;=&nbsp;<strong>$${((+(item.unitPrice||0))*(item.quantity||1)).toFixed(2)}</strong></div>
            </div>
            <div class="item-qty">${item.quantity||1}</div>
          </div>`).join('')}
      </div>
    </div>

    
    <div class="panel-section" id="sec-recipient">
      <div class="panel-section-header" onclick="togglePanelSection('recipient')">
        <span class="panel-section-arrow">▶</span>
        <span class="panel-section-title">Recipient</span>
        <div class="panel-section-icons">
          <span class="panel-section-icon">⊞</span>
        </div>
      </div>
      <div class="panel-section-body">
        <div class="recip-header">
          <span class="recip-title">Ship To</span>
          <span class="recip-edit" onclick="copyAddr(\`${addr.replace(/`/g,"'")}\`)" title="Copy address">📋</span>
          <span class="recip-edit" onclick="showToast('Edit recipient — Phase 3')">Edit</span>
        </div>
      <div class="recip-name">${shipTo.name||'—'}</div>
      <div class="recip-addr">${addr}</div>
        ${shipTo.phone?`<div style="font-size:12px;color:var(--text2);margin-top:3px">${shipTo.phone}</div>`:''}
        <div id="panel-addr-type" style="font-size:11px;color:var(--text3);margin-top:5px;margin-bottom:2px">
          ${isResidential(o) ? '🏠 Residential' : '🏢 Commercial'}
          ${o.residential != null ? ' (manual)' : ' (auto)'}
          — <a href="#" onclick="toggleResidential(${o.orderId});return false" style="color:var(--ss-blue)">change</a>
        </div>
        <div class="recip-validated">
          🏠 Address Validated
          <span class="recip-revert" onclick="showToast('Address reverted')">Revert</span>
        </div>
        <div class="recip-tax">
          Tax Information: <span style="color:var(--text3)">0 Tax IDs added</span>
          <span class="recip-tax-add" onclick="showToast('Add tax ID — Phase 3')">Add</span>
        </div>
        <div class="recip-sold" style="margin-top:7px;padding-top:7px;border-top:1px solid var(--border)">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);margin-bottom:4px">Sold To</div>
          <div class="recip-sold-name">${getOrderCustomerUsername(o)||shipTo.name||'—'}</div>
          ${o.customerEmail?`<div style="font-size:11.5px;color:var(--text2)">${o.customerEmail}</div>`:''}
        </div>
      </div>
    </div>

  </div>
  `;
}

// ─── Panel Sections ────────────────────────────────────────────────────────────
export function togglePanelSection(name) {
  document.getElementById(`sec-${name}`)?.classList.toggle('collapsed');
}

// ─── Pre-select Ship Acct + Service from table's best rate ────────────────────
function syncPanelFromBestRate(id) {
  const best = state.orderBestRate[id];
  if (!best?.carrierCode) return;

  const acctSel = document.getElementById('p-shipacct');
  const svcSel  = document.getElementById('p-service');
  if (!acctSel || !svcSel) return;

  // Use the exact shippingProviderId from the best rate object — avoids picking
  // a different UPS account (e.g. GG6381) when the best rate is from ORION.
  const pid = best.shippingProviderId;
  const carriers = getPanelDisplayCarriers();
  let bestAcct = pid ? carriers.find(c => c.shippingProviderId === pid) : null;

  // Fallback: if pid missing or not in carrier list, find account by carrierCode
  // with lowest markup (legacy behaviour)
  if (!bestAcct) {
    const accounts = carriers.filter(c => c.code === best.carrierCode);
    if (!accounts.length) return;
    const mFlat = p => { const m = state.rbMarkups[p]; return m?.type === 'pct' ? 8*(m.value/100) : (m?.value||0); };
    bestAcct = accounts.reduce((a, b) => mFlat(b.shippingProviderId) < mFlat(a.shippingProviderId) ? b : a, accounts[0]);
  }

  const pidStr = String(bestAcct.shippingProviderId);
  if ([...acctSel.options].some(o => o.value === pidStr)) acctSel.value = pidStr;

  updateServiceDropdown(bestAcct.code, best.serviceCode);
}

// ─── Fetch rate for open panel order ─────────────────────────────────────────
export async function fetchPanelRate(o) {
  o = o || state.currentPanelOrder;
  if (!o) return;
  const el = document.getElementById('panel-rate-val');
  const lb = document.getElementById('panel-scout-label');
  if (!el) return;

  const wtLb  = parseFloat(document.getElementById('p-wtlb')?.value) || 0;
  const wtOz  = parseFloat(document.getElementById('p-wtoz')?.value) || 0;
  const totalOz = (wtLb * 16) + wtOz;
  const len   = parseFloat(document.getElementById('p-len')?.value) || 0;
  const wid   = parseFloat(document.getElementById('p-wid')?.value) || 0;
  const hgt   = parseFloat(document.getElementById('p-hgt')?.value) || 0;
  const zip   = (o.shipTo?.postalCode||'').slice(0,5);
  const hasDims = len > 0 && wid > 0 && hgt > 0;

  // HARD STOP: Missing weight or dimensions
  console.log(`[fetchPanelRate] Order ${o.orderId}: totalOz=${totalOz}, hasDims=${hasDims}, hasBestRate=${!!o.bestRate}`);
  if (!zip)      { if(el) el.textContent='No ZIP';    if(lb) lb.textContent='Scout Review'; return; }
  if (!totalOz)  { if(el) el.innerHTML=`<span style="color:var(--text3);font-size:11px">— add weight</span>`; if(lb) lb.textContent='Scout Review'; return; }
  if (!hasDims)  { if(el) el.innerHTML=`<span style="color:var(--text3);font-size:11px">— add dims</span>`;   if(lb) lb.textContent='Scout Review'; return; }

  // We have weight AND dims. Display cached bestRate if available, otherwise fetch new rates
  if (o.bestRate) {
    try {
      console.log(`[fetchPanelRate] Displaying cached bestRate for order ${o.orderId}`, { best: o.bestRate });
      const best = o.bestRate;
      
      const carrier = formatCarrierDisplay(best);
      const svc = SERVICE_NAMES[best.serviceCode] || best.serviceName || '';
      const rawCost = (best.shipmentCost || 0) + (best.otherCost || 0);
      const selPid = parseInt(document.getElementById('p-shipacct')?.value) || null;
      const markupCost = selPid ? applyRbMarkup(selPid, rawCost) : applyCarrierMarkup(best);
      
      const html = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${priceDisplay(rawCost, markupCost)}
        <span style="font-size:10.5px;color:var(--text3)">${carrier} · ${trunc(svc,22)}</span>
      </div>`;
      el.innerHTML = html;
      if (lb) lb.textContent = 'Scout Review';
      console.log(`[fetchPanelRate] ✅ Cached rate displayed`);
      return;
    } catch (err) {
      console.error(`[fetchPanelRate] ERROR displaying cached bestRate:`, err.message, err.stack);
      // Fall through to fetch new rates
    }
  }

  el.textContent = '…';
  if (lb) lb.textContent = 'Loading…';

  // Check SQLite rate cache before making a live ShipStation call
  let rates;
  try {
    const cacheData = await fetchValidatedJson(`/api/rates/cached?wt=${Math.round(totalOz)}&zip=${zip}&l=${len}&w=${wid}&h=${hgt}&residential=${isResidential(o)?1:0}`, undefined, parseCachedRatesResponse);
    if (cacheData?.cached && Array.isArray(cacheData.rates) && cacheData.rates.length) {
      rates = cacheData.rates;
    }
  } catch { /* cache miss — fall through to live call */ }

  try {
    if (!rates) {
      const storeId = getOrderStoreId(o);
      rates = await fetchValidatedJson('/api/rates', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          fromPostalCode:'90248', toPostalCode:zip, toCountry:'US',
          weight:{value:totalOz, units:'ounces'},
          dimensions:{units:'inches',length:len,width:wid,height:hgt},
          residential: isResidential(o),
          orderId: state.currentPanelOrder?.orderId || undefined,
          storeId: storeId,
        }),
      }, parseLiveRatesResponse);
    }
    if (Array.isArray(rates) && rates.length) {
      const selectedSvc = document.getElementById('p-service')?.value || '';
      const _panelStoreId = getOrderStoreId(state.currentPanelOrder);
      const nonBlocked  = rates.filter(r => { const { isBlockedRate } = window; return typeof isBlockedRate === 'function' ? !isBlockedRate(r, _panelStoreId) : true; });

      let best;
      if (selectedSvc) {
        best = rates.find(r => r.serviceCode === selectedSvc) || null;
        if (!best) {
          el.innerHTML = `<span style="color:var(--text3);font-size:11px">Rate unavailable for selected service</span>`;
          if(lb) lb.textContent = 'Scout Review';
          return;
        }
      } else {
        best = pickBestRate(rates, null, _panelStoreId) || nonBlocked[0] || rates[0];
        // Auto-suggest: update account + service dropdowns to match best rate
        if (best) {
          const acctSel = document.getElementById('p-shipacct');
          const svcSel  = document.getElementById('p-service');
          const bestPid = best.shippingProviderId;
          // Switch carrier account if best rate is from a different account
          if (acctSel && bestPid && String(acctSel.value) !== String(bestPid)) {
            acctSel.value = String(bestPid);
            const bestAcct = getPanelDisplayCarriers().find(c => c.shippingProviderId === bestPid);
            if (bestAcct) updateServiceDropdown(bestAcct.code, best.serviceCode);
          }
          // Pre-select service in (now-correct) dropdown
          if (svcSel) {
            const matchOpt = Array.from(svcSel.options).find(opt => opt.value === best.serviceCode);
            if (matchOpt) {
              svcSel.value = matchOpt.value;
              svcSel.style.borderColor = 'var(--green)';
              setTimeout(() => { if(svcSel) svcSel.style.borderColor=''; }, 3000);
            }
          }
        }
      }

      const cc      = best.carrierCode || '';
      const carrier = formatCarrierDisplay(best);
      const svc     = SERVICE_NAMES[best.serviceCode] || best.serviceName || '';
      const rawCost = (best.shipmentCost || 0) + (best.otherCost || 0);
      const selPid    = parseInt(document.getElementById('p-shipacct')?.value) || null;
      const markupCost = selPid ? applyRbMarkup(selPid, rawCost) : applyCarrierMarkup(best);
      el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${priceDisplay(rawCost, markupCost)}
        <span style="font-size:10.5px;color:var(--text3)">${carrier} · ${trunc(svc,22)}</span>
      </div>`;

      // Update delivery ETA row
      const deliveryEl = document.getElementById('panel-delivery-row');
      if (deliveryEl) {
        let etaStr = '';
        if (best.estimatedDelivery) {
          const d = new Date(best.estimatedDelivery);
          etaStr = d.toLocaleDateString('en-US', { weekday:'short', month:'numeric', day:'numeric' });
        } else if (best.deliveryDays) {
          etaStr = `${best.deliveryDays} day${best.deliveryDays > 1 ? 's' : ''}`;
        }
        deliveryEl.textContent = etaStr ? `Delivery: ${etaStr}` : 'Delivery: —';
      }

      // Keep table in sync
      if (state.currentPanelOrder) {
        state.orderBestRate[state.currentPanelOrder.orderId] = best;
        if (window.renderRateCell) window.renderRateCell(state.currentPanelOrder.orderId, best);
      }
    } else {
      if(el) el.textContent='No rates';
    }
  } catch(e) { if(el) el.textContent='Error'; }
  if(lb) lb.textContent = 'Scout Review';
}

// ─── Debounced rate fetch ──────────────────────────────────────────────────────
export function debouncePanelRate() {
  clearTimeout(_panelRateTimer);
  const el = document.getElementById('panel-rate-val');
  if (el) el.innerHTML = '<span style="color:var(--text3);font-size:11px">typing…</span>';
  checkSkuSaveDirty();
  _panelRateTimer = setTimeout(() => {
    if (state.currentPanelOrder) fetchPanelRate(state.currentPanelOrder);
  }, 600);
}

// ─── Dims input handler: debounced rate fetch + auto-match + auto-save ────────
export function onDimsInput() {
  debouncePanelRate();
  clearTimeout(_dimsAutoTimer);
  _dimsAutoTimer = setTimeout(_autoMatchAndSave, 800);
}

async function _autoMatchAndSave() {  // async because we await applyPackagePreset()
  const len = parseFloat(document.getElementById('p-len')?.value) || 0;
  const wid = parseFloat(document.getElementById('p-wid')?.value) || 0;
  const hgt = parseFloat(document.getElementById('p-hgt')?.value) || 0;
  if (!len || !wid || !hgt) return; // need all three filled

  // 1. Auto-match package from packagesList (±0.15 in tolerance)
  let pkg = (state.packagesList || []).find(p =>
    Math.abs((p.length || 0) - len) < 0.15 &&
    Math.abs((p.width  || 0) - wid) < 0.15 &&
    Math.abs((p.height || 0) - hgt) < 0.15
  );

  // 2. If not found, auto-create custom package with exact dimensions
  if (!pkg) {
    try {
      const createResult = await fetchValidatedJson('/api/packages/auto-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length: len, width: wid, height: hgt }),
      }, parseAutoCreatePackageResponse);
      if (createResult.ok && createResult.package) {
        pkg = createResult.package;
        // Add to state for future matches
        state.packagesList.push(createResult.package);
      }
    } catch (e) {
      console.warn('[Panel] Auto-create package failed:', e.message);
    }
  }

  // 3. Apply package to dropdown and dimensions
  if (pkg) {
    await applyPackagePreset(String(pkg.packageId)); // pre-flight check + set value safely
  }

  // 2. Auto-save SKU defaults (single-SKU orders only)
  if (!state.currentPanelOrder) return;
  const items = (state.currentPanelOrder.items || []).filter(i => !i.adjustment && (i.productId || i.sku));
  const uniqueSkus = [...new Set(items.map(i => i.sku).filter(Boolean))];
  if (uniqueSkus.length !== 1) return; // multi-SKU: skip auto-save

  const sku  = uniqueSkus[0];
  const item = items.find(i => i.sku === sku) || items[0];
  const qty  = items.filter(i => i.sku === sku).reduce((s, i) => s + (i.quantity || 1), 0);
  const totalOz   = (parseFloat(document.getElementById('p-wtlb')?.value) || 0) * 16
                  + (parseFloat(document.getElementById('p-wtoz')?.value) || 0);
  const perUnitOz = qty > 1 ? +(totalOz / qty).toFixed(2) : totalOz;
  const pkgSel = document.getElementById('p-package');
  const packageCode = pkg ? String(pkg.packageId)
                          : (pkgSel?.value && pkgSel.value !== '__custom__' ? pkgSel.value : '');

  const payload = { weightOz: perUnitOz, length: len, width: wid, height: hgt };
  if (packageCode) payload.packageCode = packageCode;
  if (item.productId) payload.productId = item.productId;
  else                payload.sku       = sku;

  try {
    await fetchValidatedJson('/api/products/save-defaults', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, parseSaveProductDefaultsResult);

    // Update local cache
    productDefaultsCache[sku] = { weightOz: perUnitOz, length: len, width: wid, height: hgt, packageCode };

    // Update badges
    const _show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? 'inline' : 'none'; };
    _show('p-dims-badge',    true);
    _show('p-wt-badge',      perUnitOz > 0);
    _show('sku-saved-badge', !!packageCode);

    // Banner
    showToast('✅ SKU Defaults Saved');
  } catch { /* silent */ }
}

// ─── Determine Dimension Source ────────────────────────────────────────────────
// Returns: 'inventory', 'shipstation', 'package', or null
function getDimensionSource(order) {
  const dims = getOrderDimensions(order);
  if (dims.length > 0 && dims.width > 0 && dims.height > 0) {
    return 'shipstation';
  }
  return null;
}

// ─── Apply Package Preset (from Package dropdown) ─────────────────────────────
export async function applyPackagePreset(packageId) {
  const dimsEl  = document.getElementById('p-package-dims');
  const badge   = document.getElementById('sku-saved-badge');
  const pkgSel  = document.getElementById('p-package');
  
  if (!packageId || packageId === '__custom__') {
    if (dimsEl) { dimsEl.textContent = ''; dimsEl.style.display = 'none'; }
    if (badge)  badge.style.display = 'none';
    return;
  }
  
  // Pre-flight check: Ensure package exists in state
  let pkg = state.packagesList.find(p => String(p.packageId) === String(packageId));
  
  // If not in state, fetch from backend and add to state
  if (!pkg) {
    try {
      pkg = await fetchValidatedJson(`/api/packages/${packageId}`, undefined, parsePackageDto);
      state.packagesList.push(pkg);
    } catch (err) {
      console.warn(`[Panel] Error fetching package ${packageId}:`, err.message);
      return;
    }
  }
  
  if (!pkg) {
    console.warn(`[Panel] No package found for ID ${packageId}`);
    return;
  }
  
  // Ensure <option> exists in dropdown DOM
  if (pkgSel) {
    let option = Array.from(pkgSel.options).find(o => o.value === String(packageId));
    if (!option) {
      // Create option in "Custom Packages" optgroup (or create the group if needed)
      let customGroup = pkgSel.querySelector('optgroup[label="Custom Packages"]');
      if (!customGroup) {
        customGroup = document.createElement('optgroup');
        customGroup.label = 'Custom Packages';
        pkgSel.appendChild(customGroup);
      }
      option = document.createElement('option');
      option.value = String(packageId);
      option.textContent = pkg.name || `Package ${packageId}`;
      customGroup.appendChild(option);
    }
    // Now set dropdown value (guaranteed to exist)
    pkgSel.value = String(packageId);
  }
  
  // Set dimension fields
  const setField = (id, val) => { const el = document.getElementById(id); if (el && val > 0) el.value = val; };
  setField('p-len', pkg.length);
  setField('p-wid', pkg.width);
  setField('p-hgt', pkg.height);
  
  // Show dims under the dropdown with source badge
  if (dimsEl && pkg.length > 0 && pkg.width > 0 && pkg.height > 0) {
    const sourceBadge = '(From package)';
    dimsEl.innerHTML = `${pkg.length} × ${pkg.width} × ${pkg.height} in <span style="margin-left:8px;font-size:9px;color:var(--text4);font-weight:400">${sourceBadge}</span>`;
    dimsEl.style.display = 'block';
  }
  debouncePanelRate();
}

// ─── Apply Preset Dims ────────────────────────────────────────────────────────
export function applyPreset(e) {
  const keys = Object.keys(PRESETS);
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;background:#fff;border:1px solid #ccc;border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:999;min-width:160px;padding:5px 0;font-size:12.5px';
  const btn  = e.target.closest('button');
  const rect = btn.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';

  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) {
      if (document.body.contains(menu)) document.body.removeChild(menu);
      document.removeEventListener('click', closeMenu);
    }
  };

  keys.forEach(k => {
    const item = document.createElement('div');
    item.textContent = k;
    item.style.cssText = 'padding:6px 14px;cursor:pointer;color:#1a1f2e';
    item.onmouseenter = () => item.style.background='#eef2ff';
    item.onmouseleave = () => item.style.background='';
    item.onclick = () => {
      const p = PRESETS[k];
      const lb = document.getElementById('p-wtlb'); if(lb) lb.value = p.lb;
      const oz = document.getElementById('p-wtoz'); if(oz) oz.value = p.oz;
      const ln = document.getElementById('p-len');  if(ln) ln.value = p.len;
      const wd = document.getElementById('p-wid');  if(wd) wd.value = p.wid;
      const ht = document.getElementById('p-hgt');  if(ht) ht.value = p.hgt;
      document.removeEventListener('click', closeMenu);
      document.body.removeChild(menu);
      if (state.currentPanelOrder) fetchPanelRate(state.currentPanelOrder);
    };
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

// ─── Save SKU Defaults ────────────────────────────────────────────────────────
export async function saveSkuDefaults() {
  if (!state.currentPanelOrder) return;

  // Guard: shipped orders are locked — confirm before changing SKU defaults
  if (state.currentPanelOrder.orderStatus === 'shipped') {
    const ok = window.confirm(
      `⚠️ This order (${state.currentPanelOrder.orderNumber}) has already shipped.\n\nSaving SKU defaults will update the weight/dims template for future orders with this SKU — it will NOT change any data on this shipped order.\n\nContinue?`
    );
    if (!ok) return;
  }

  const weightLb = parseFloat(document.getElementById('p-wtlb')?.value) || 0;
  const weightOz = parseFloat(document.getElementById('p-wtoz')?.value) || 0;
  const totalOz  = (weightLb * 16) + weightOz;
  const length   = parseFloat(document.getElementById('p-len')?.value)  || 0;
  const width    = parseFloat(document.getElementById('p-wid')?.value)  || 0;
  const height   = parseFloat(document.getElementById('p-hgt')?.value)  || 0;
  const pkgVal   = document.getElementById('p-package')?.value || '';
  const packageCode = (pkgVal && pkgVal !== '__custom__') ? pkgVal : '';

  if (!totalOz && !length) { showToast('⚠️ Enter weight or dims first'); return; }

  const items = (state.currentPanelOrder.items || []).filter(i => !i.adjustment && (i.productId || i.sku));
  const uniqueSkus = [...new Set(items.map(i => i.sku).filter(Boolean))];

  if (!uniqueSkus.length) { showToast('⚠️ No products found on this order'); return; }
  if (uniqueSkus.length > 1) {
    showToast('⚠️ Multi-SKU order — edit each product\'s defaults in the Products tab');
    return;
  }

  const sku = uniqueSkus[0];
  const item = items.find(i => i.sku === sku) || items[0];
  const qty  = items.filter(i => i.sku === sku).reduce((s, i) => s + (i.quantity || 1), 0);
  const perUnitOz = qty > 1 ? +(totalOz / qty).toFixed(2) : totalOz;

  const payload = { weightOz: perUnitOz, length, width, height };
  if (packageCode) payload.packageCode = packageCode;
  if (item.productId) payload.productId = item.productId;
  else                payload.sku       = sku;

  const btn = document.getElementById('saveSkuBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

  try {
    const data = await fetchValidatedJson('/api/products/save-defaults', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, parseSaveProductDefaultsResult);

    showToast(`✅ Saved dims & weight for ${item.sku || 'product'}`);

    // Auto-package: server resolved a package from dims
    if (data.resolvedPackageId) {
      const pkgSel = document.getElementById('p-package');
      if (pkgSel) {
        if (data.newPackageCreated && data.packageData) {
          // Add new package to state.packagesList so it survives re-renders
          state.packagesList.push({ ...data.packageData, source: 'custom', carrierCode: null, packageCode: null });
          // Add option to the Custom Packages optgroup (or create one)
          let optgroup = pkgSel.querySelector('optgroup[label="Custom Packages"]');
          if (!optgroup) {
            optgroup = document.createElement('optgroup');
            optgroup.label = 'Custom Packages';
            pkgSel.insertBefore(optgroup, pkgSel.firstChild);
          }
          const opt = new Option(data.packageData.name, String(data.resolvedPackageId));
          optgroup.appendChild(opt);
          showToast(`📦 Created new package "${data.packageData.name}"`);
        } else {
          showToast(`📦 Matched to package "${data.packageData?.name || data.resolvedPackageId}"`);
        }
        // Select the package in the dropdown and show dims
        pkgSel.value = String(data.resolvedPackageId);
        applyPackagePreset(String(data.resolvedPackageId));
        // Show sku-saved-badge since package is now saved
        const savedBadge = document.getElementById('sku-saved-badge');
        if (savedBadge) savedBadge.style.display = 'inline';
      }
    }

    const _wtOz  = (parseFloat(document.getElementById('p-wtlb')?.value)||0)*16 + (parseFloat(document.getElementById('p-wtoz')?.value)||0);
    const _len   = parseFloat(document.getElementById('p-len')?.value)||0;
    const _wid   = parseFloat(document.getElementById('p-wid')?.value)||0;
    const _hgt   = parseFloat(document.getElementById('p-hgt')?.value)||0;
    const _showWt   = _wtOz > 0;
    const _showDims = _len > 0 && _wid > 0 && _hgt > 0;
    const _hasPkg   = !!(packageCode && packageCode !== '__custom__');
    const _show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? 'inline' : 'none'; };
    _show('p-wt-badge',      _showWt);
    _show('p-dims-badge',    _showDims);
    _show('sku-saved-badge', _hasPkg);

    // Update local product cache so future panels get the new defaults immediately
    productDefaultsCache[sku] = { weightOz: perUnitOz, length, width, height, packageCode };

    // Kick off rate recalculation for all awaiting-shipment orders with this SKU on the current page
    if (_wtOz > 0 && _len > 0 && _wid > 0 && _hgt > 0 && typeof window.fetchCheapestRates === 'function') {
      const matchingOrders = state.filteredOrders.filter(o =>
        o.orderStatus === 'awaiting_shipment' &&
        (o.items || []).some(i => !i.adjustment && i.sku === sku)
      );
      if (matchingOrders.length) {
        for (const o of matchingOrders) {
          const itemQty = (o.items||[]).filter(i=>!i.adjustment&&i.sku===sku).reduce((s,i)=>s+(i.quantity||1),0);
          o._enrichedWeight = { value: +(perUnitOz * itemQty).toFixed(2), units: 'ounces' };
          o._enrichedDims   = { length: _len, width: _wid, height: _hgt };
        }
        window.fetchCheapestRates(matchingOrders);
      }
    }

    if (btn) {
      btn.style.background = 'var(--green)'; btn.style.color = '#fff';
      btn.textContent = '✅ Saved';
      setTimeout(() => {
        btn.style.background = ''; btn.style.color = '';
        btn.textContent = '💾 Save weights and dims as SKU defaults';
        btn.disabled = false;
      }, 3000);
    }
  } catch (e) {
    showToast(`❌ Save failed: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save weights and dims as SKU defaults'; }
  }
}

// ─── Auto-fill panel weight/dims from products DB ────────────────────────────
export async function maybeApplySkuDefaults(order) {
  const orderDims = getOrderDimensions(order);
  const hasDims   = orderDims.length > 0 && orderDims.width > 0 && orderDims.height > 0;
  const hasWeight = order.weight?.value > 0;

  const skus = [...new Set((order.items||[]).filter(i=>!i.adjustment&&i.sku).map(i=>i.sku))];
  if (skus.length !== 1) return;
  const sku = skus[0];

  try {
    let product;
    if (sku in productDefaultsCache) {
      product = productDefaultsCache[sku];
    } else {
      product = await fetchValidatedJson(`/api/products/by-sku/${encodeURIComponent(sku)}`, undefined, parseProductDefaults);
      productDefaultsCache[sku] = product;
    }
    if (!product) return;
    // Always fetch into cache first (badges need it) — only skip applying if already have both
    if (hasDims && hasWeight) return;

    const qty = (order.items||[]).filter(i=>i.sku===sku).reduce((s,i)=>s+(i.quantity||1),0);
    let applied = false;

    if (!hasWeight && product.weightOz > 0) {
      const totalOz = +(product.weightOz * qty).toFixed(2);
      const lb = Math.floor(totalOz / 16);
      const oz = +(totalOz % 16).toFixed(2);
      const lbEl = document.getElementById('p-wtlb');
      const ozEl = document.getElementById('p-wtoz');
      if (lbEl) lbEl.value = lb;
      if (ozEl) ozEl.value = oz;
      applied = true;
    }
    if (!hasDims && product.length > 0) {
      const lEl = document.getElementById('p-len');
      const wEl = document.getElementById('p-wid');
      const hEl = document.getElementById('p-hgt');
      if (lEl) lEl.value = product.length;
      if (wEl) wEl.value = product.width;
      if (hEl) hEl.value = product.height;
      applied = true;
    }
    if (applied) {
      const wtRow = document.getElementById('p-wtlb')?.closest('.ship-field-row');
      const wtLabel = wtRow?.querySelector('.ship-field-label');
      if (wtLabel && !document.getElementById('sku-default-indicator')) {
        const indicator = document.createElement('span');
        indicator.id = 'sku-default-indicator';
        indicator.style.cssText = 'font-size:9.5px;color:var(--green);margin-left:6px;font-weight:500';
        indicator.textContent = '(from SKU default)';
        wtLabel.appendChild(indicator);
      }
      if (state.currentPanelOrder) debouncePanelRate();
    }
  } catch { /* silent fail */ }
}

// ─── Auto-Match Package by Dimensions ──────────────────────────────────────────
export async function maybeAutoMatchPackage(order) {
  // Read current dimension field values
  const lenEl = document.getElementById('p-len');
  const widEl = document.getElementById('p-wid');
  const hgtEl = document.getElementById('p-hgt');
  
  const len = parseInt(lenEl?.value || 0, 10);
  const wid = parseInt(widEl?.value || 0, 10);
  const hgt = parseInt(hgtEl?.value || 0, 10);
  
  // Skip if no complete dimensions
  if (!len || !wid || !hgt) return;
  
  // Search for matching package in state.packagesList
  const matchingPkg = state.packagesList.find(p => 
    p.length === len && p.width === wid && p.height === hgt
  );
  
  if (!matchingPkg) {
    // No package match found, but we have dims — show source badge for current dims
    const source = getDimensionSource(order);
    const dimsEl = document.getElementById('p-package-dims');
    if (dimsEl && len > 0 && wid > 0 && hgt > 0) {
      const sourceLabel = source === 'inventory' ? '(From inventory)' : 
                         source === 'shipstation' ? '(From ShipStation)' : 
                         '';
      if (sourceLabel) {
        dimsEl.innerHTML = `${len} × ${wid} × ${hgt} in <span style="margin-left:8px;font-size:9px;color:var(--text4);font-weight:400">${sourceLabel}</span>`;
        dimsEl.style.display = 'block';
      }
    }
    return;
  }
  
  // Pre-select the matching package
  await applyPackagePreset(String(matchingPkg.packageId));
  
  // Save the selection to backend
  try {
    await fetch(`/api/orders/${order.orderId}/selected-package-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': window.__APP_TOKEN || '' },
      body: JSON.stringify({ packageId: matchingPkg.packageId })
    });
  } catch (err) {
    console.warn(`[Panel] Error saving package selection: ${err.message}`);
  }
}

// ─── Highlight save button when values differ from original ───────────────────
export function checkSkuSaveDirty() {
  const btn = document.getElementById('saveSkuBtn');
  if (!btn || !state.currentPanelOrder) return;
  const o = state.currentPanelOrder;
  const currentOz = (parseFloat(document.getElementById('p-wtlb')?.value)||0)*16
                  + (parseFloat(document.getElementById('p-wtoz')?.value)||0);
  const origOz = o.weight?.value || 0;
  const dimsChanged = ['p-len','p-wid','p-hgt'].some((id, i) => {
    const keys = ['length','width','height'];
    const dims = getOrderDimensions(o);
    return parseFloat(document.getElementById(id)?.value||0) !== (dims[keys[i]]||0);
  });
  btn.classList.toggle('sku-save-dirty', Math.abs(currentOz - origOz) > 0.5 || dimsChanged);
}

// ─── Insurance toggle helper ───────────────────────────────────────────────────
function toggleInsureVal() {
  const sel = document.getElementById('p-insure');
  const val = document.getElementById('p-insure-val');
  if (val) val.style.display = (sel?.value !== 'none') ? '' : 'none';
}

// ─── External shipping menu ────────────────────────────────────────────────────
let _extShipMenu = null;

export function showExtShipMenu(e, orderId) {
  e.stopPropagation();
  e.preventDefault();
  
  if (_extShipMenu) { 
    _extShipMenu.remove(); 
    _extShipMenu = null; 
  }

  const sources = ['Shopify', 'Amazon', 'Walmart', 'eBay', 'Etsy', 'Other'];
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:8000;background:var(--surface);border:1px solid var(--border2);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:150px;overflow:hidden;font-size:12.5px';
  
  const header = document.createElement('div');
  header.style.cssText = 'padding:6px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);border-bottom:1px solid var(--border)';
  header.textContent = 'Shipped via…';
  menu.appendChild(header);
  
  sources.forEach(s => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 14px;cursor:pointer;color:var(--text);transition:background .15s';
    item.textContent = s;
    item.onclick = (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      markShippedExternal(orderId, s);
    };
    item.onmouseenter = () => item.style.background = 'var(--surface2)';
    item.onmouseleave = () => item.style.background = '';
    menu.appendChild(item);
  });

  const rect = e.target.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  document.body.appendChild(menu);
  _extShipMenu = menu;

  // Position: center horizontally on screen
  const menuWidth = menu.offsetWidth || 160;
  menu.style.left = Math.round((window.innerWidth - menuWidth) / 2) + 'px';

  // Close menu when clicking outside
  const closeHandler = (ev) => {
    if (_extShipMenu && !_extShipMenu.contains(ev.target) && ev.target !== e.target) {
      _extShipMenu.remove();
      _extShipMenu = null;
      document.removeEventListener('click', closeHandler, true); // must match capture=true
    }
  };
  
  // Use setTimeout to allow click event to fully propagate before installing close handler
  setTimeout(() => {
    document.addEventListener('click', closeHandler, true); // Use capture phase
  }, 50);
}

export async function markShippedExternal(orderId, source) {
  if (_extShipMenu) { _extShipMenu.remove(); _extShipMenu = null; }
  
  try {
    console.log(`[Panel] Marking order ${orderId} as shipped via ${source}`);
    
    const data = await fetchValidatedJson(`/api/orders/${orderId}/shipped-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag: 1, source })
    }, parseOrderStatusMutationResponse);
    console.log(`[Panel] Order marked as shipped successfully:`, data);
    
    // Remove row from table with animation
    const row = document.getElementById(`row-${orderId}`);
    if (row) {
      row.style.transition = 'opacity .3s, transform .3s';
      row.style.opacity = '0';
      row.style.transform = 'translateX(20px)';
      setTimeout(() => { if (row.parentNode) row.remove(); }, 320);
    } else {
      console.log(`[Panel] Row element not found for orderId ${orderId}`);
    }
    
    // Close panel if this order is open
    if (state.currentPanelOrder && state.currentPanelOrder.orderId === orderId) {
      closePanel();
    }
    
    showToast(`✅ Marked shipped via ${source}`);
  } catch (err) {
    console.error(`[Panel] Error marking order as shipped:`, err);
    showToast(`❌ Error: ${err.message}`);
  }
}

// ─── Print Menu ────────────────────────────────────────────────────────────────
export function showPrintMenu(event, orderId) {
  event.stopPropagation();
  console.log('[showPrintMenu] CALLED - orderId:', orderId);
  console.log('[showPrintMenu] state.currentPanelOrder:', !!state.currentPanelOrder, state.currentPanelOrder?.orderId);
  console.log('[showPrintMenu] state.allOrders length:', state.allOrders?.length);
  console.log('[showPrintMenu] state.filteredOrders length:', state.filteredOrders?.length);
  console.log('[showPrintMenu] state.currentOrderStatus:', state.currentOrderStatus);
  
  // Search in multiple places: current panel order, filtered orders, or all orders
  let o = state.currentPanelOrder && state.currentPanelOrder.orderId === orderId ? state.currentPanelOrder : null;
  console.log('[showPrintMenu] found in currentPanelOrder:', !!o);
  
  if (!o) o = (state.filteredOrders || []).find(ord => ord.orderId === orderId);
  console.log('[showPrintMenu] found in filteredOrders:', !!o);
  
  if (!o) o = (state.allOrders || []).find(ord => ord.orderId === orderId);
  console.log('[showPrintMenu] found in allOrders:', !!o);
  
  console.log('[showPrintMenu] final order found:', !!o, 'status:', o?.orderStatus, 'tracking:', o?.label?.trackingNumber);
  if (!o) {
    console.log('[showPrintMenu] Order not found! Cannot create menu.');
    console.log('[showPrintMenu] allOrders sample:', state.allOrders?.slice(0, 2));
    return;
  }
  
  const btn = event.target.closest('button');
  const rect = btn.getBoundingClientRect();
  
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;background:var(--surface2);border:1px solid var(--border);border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:999;min-width:180px;padding:4px 0;font-size:12.5px';
  menu.style.top  = (rect.bottom + 6) + 'px';
  menu.style.left = rect.left + 'px';

  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) {
      if (document.body.contains(menu)) document.body.removeChild(menu);
      document.removeEventListener('click', closeMenu);
    }
  };

  const addItem = (label, fn, enabled = true) => {
    const item = document.createElement('div');
    item.textContent = label;
    item.style.cssText = `padding:7px 14px;cursor:${enabled?'pointer':'default'};color:${enabled?'var(--text2)':'var(--text4)'};`;
    if (enabled) {
      item.onmouseenter = () => item.style.background = 'var(--surface3)';
      item.onmouseleave = () => item.style.background = '';
      item.onclick = () => { fn(); document.removeEventListener('click', closeMenu); document.body.removeChild(menu); };
    }
    menu.appendChild(item);
  };

  if (o.orderStatus === 'awaiting_shipment') {
    addItem('📄 Create Test Label', () => {
      if (window.createLabel) window.createLabel(true);
    });
  } else if (o.label?.trackingNumber) {
    addItem('🖨️ Reprint Label', () => {
      if (window.reprintLabel) window.reprintLabel(orderId);
    });
  } else {
    addItem('(No label to print)', () => {}, false);
  }

  console.log('[showPrintMenu] appending menu to body, menu.children:', menu.children.length);
  document.body.appendChild(menu);
  console.log('[showPrintMenu] menu appended, checking DOM:', document.body.contains(menu));
  setTimeout(() => {
    console.log('[showPrintMenu] Installing close handler');
    document.addEventListener('click', closeMenu);
  }, 50);
}

// ─── Batch Menu ────────────────────────────────────────────────────────────────
export function showBatchMenu(event, orderId) {
  event.stopPropagation();
  const btn = event.target.closest('button');
  const rect = btn.getBoundingClientRect();
  
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;background:var(--surface2);border:1px solid var(--border);border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:999;min-width:200px;padding:4px 0;font-size:12.5px';
  menu.style.top  = (rect.bottom + 6) + 'px';
  menu.style.left = rect.left + 'px';

  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) {
      if (document.body.contains(menu)) document.body.removeChild(menu);
      document.removeEventListener('click', closeMenu);
    }
  };

  const addItem = (label, fn) => {
    const item = document.createElement('div');
    item.textContent = label;
    item.style.cssText = 'padding:7px 14px;cursor:pointer;color:var(--text2);';
    item.onmouseenter = () => item.style.background = 'var(--surface3)';
    item.onmouseleave = () => item.style.background = '';
    item.onclick = () => { fn(); document.removeEventListener('click', closeMenu); document.body.removeChild(menu); };
    menu.appendChild(item);
  };

  addItem('📦 Add to Batch Queue', () => showToast('⏳ Batch queue coming soon'));
  addItem('🔄 Quick Reprint (Batch)', () => showToast('⏳ Batch reprint coming soon'));

  document.body.appendChild(menu);
  document.addEventListener('click', closeMenu);
}

// ─── Window exports ────────────────────────────────────────────────────────────
window.openPanel            = openPanel;
window.closePanel           = closePanel;
window.togglePanelSection   = togglePanelSection;
window.applyPreset          = applyPreset;
window.saveSkuDefaults      = saveSkuDefaults;
window.fetchPanelRate       = fetchPanelRate;
window.debouncePanelRate    = debouncePanelRate;
window.onDimsInput          = onDimsInput;
window.applyPackagePreset   = applyPackagePreset;
window.checkSkuSaveDirty    = checkSkuSaveDirty;
window.maybeApplySkuDefaults = maybeApplySkuDefaults;
window.showExtShipMenu      = showExtShipMenu;
window.markShippedExternal  = markShippedExternal;
window.toggleInsureVal      = toggleInsureVal;
window.buildPanelHTML       = buildPanelHTML;
window.showPrintMenu        = showPrintMenu;
window.showBatchMenu        = showBatchMenu;
