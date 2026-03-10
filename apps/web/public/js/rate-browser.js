import { state } from './state.js';
import { escHtml, trunc } from './utils.js';
import { fetchValidatedJson } from './api-client.js';
import {
  parseBrowseRatesResponse,
  parseCachedRatesResponse,
  parseCarrierLookupResponse,
} from './api-contracts.js';
import { isBlockedRate, SERVICE_NAMES, CARRIER_NAMES, carrierLogo, formatCarrierDisplay } from './constants.js';
import { applyCarrierMarkup, applyRbMarkup, pickBestRate, priceDisplay, isResidential, isOrionRate } from './markups.js';
import { updateServiceDropdown } from './stores.js';
import { getOrderDimensions, getOrderStoreId, getOrderWarehouseId } from './order-data.js';

// ─── Rate Browser functions ────────────────────────────────────────────────────
let _rbStoreId = null; // set from openRateBrowser(); used for per-store service unblocking

function rbSetVal(id, v) {
  const el = document.getElementById(id);
  if (el && v != null) el.value = v;
}

function rbUpdateBadges() {
  const lb  = parseFloat(document.getElementById('rb-wtlb')?.value) || 0;
  const oz  = parseFloat(document.getElementById('rb-wtoz')?.value) || 0;
  const len = parseFloat(document.getElementById('rb-len')?.value)  || 0;
  const wid = parseFloat(document.getElementById('rb-wid')?.value)  || 0;
  const hgt = parseFloat(document.getElementById('rb-hgt')?.value)  || 0;
  const wtBadge   = document.getElementById('rb-wt-badge');
  const dimsBadge = document.getElementById('rb-dims-badge');
  if (wtBadge)   wtBadge.style.display   = (lb > 0 || oz > 0)              ? 'inline' : 'none';
  if (dimsBadge) dimsBadge.style.display = (len > 0 && wid > 0 && hgt > 0) ? 'inline' : 'none';
}

function rbSetRatesPane(html, scrollTop = true) {
  const el = document.getElementById('rb-rates');
  if (!el) return;
  el.innerHTML = html;
  if (scrollTop) el.scrollTop = 0;
}

export async function openRateBrowser(o) {
  console.log('[openRateBrowser] Called with:', o, 'currentPanelOrder:', state.currentPanelOrder);
  o = o || state.currentPanelOrder || null;
  if (!o) {
    console.warn('[openRateBrowser] No order provided and currentPanelOrder not set');
    if (window.showToast) window.showToast('⚠️ No order selected');
    return;
  }
  state.rbCurrentOrder = o;
  _rbStoreId           = getOrderStoreId(o);
  state.rbSelectedPid  = null;
  state.rbRatesData    = {};
  state.rbViewMode     = 'all';

  // CRITICAL: Fetch store-specific carriers FIRST and WAIT for completion
  // If this is a multi-tenant order, we MUST load the correct carriers before browseRates()
  let carriersLoaded = false;
  if (_rbStoreId) {
    try {
      console.log(`[openRateBrowser] Fetching carriers for storeId=${_rbStoreId}`);
      const { carriers: storeCarriers } = await fetchValidatedJson(`/api/carriers-for-store?storeId=${_rbStoreId}`, undefined, parseCarrierLookupResponse);
      state.rbStoreCarriers = Array.isArray(storeCarriers) ? storeCarriers : null;
      carriersLoaded = state.rbStoreCarriers?.length > 0;
      console.log(`[openRateBrowser] Got ${state.rbStoreCarriers?.length || 0} store-specific carriers`);
    } catch (e) {
      console.error('[openRateBrowser] Failed to fetch store-specific carriers:', e.message);
      state.rbStoreCarriers = null;
    }
  } else {
    console.log('[openRateBrowser] No storeId found (main account)');
    state.rbStoreCarriers = null;
    carriersLoaded = true;
  }

  const wtOz = o?.weight?.value || 0;
  const lb   = Math.floor(wtOz / 16);
  const oz   = Math.round(wtOz % 16);
  const panelLen = parseFloat(document.getElementById('p-len')?.value) || 0;
  const panelWid = parseFloat(document.getElementById('p-wid')?.value) || 0;
  const panelHgt = parseFloat(document.getElementById('p-hgt')?.value) || 0;
  const orderDims = getOrderDimensions(o);
  const orderLen = orderDims.length || 0;
  const orderWid = orderDims.width  || 0;
  const orderHgt = orderDims.height || 0;
  rbSetVal('rb-wtlb', lb);
  rbSetVal('rb-wtoz', oz);
  rbSetVal('rb-zip',  o?.shipTo?.postalCode?.slice(0,5) || '');
  rbSetVal('rb-len',  panelLen || orderLen || 0);
  rbSetVal('rb-wid',  panelWid || orderWid || 0);
  rbSetVal('rb-hgt',  panelHgt || orderHgt || 0);
  rbSetVal('rb-signature', 'none');
  rbSetVal('rb-svcclass', '');
  rbSetVal('rb-viewby', 'all');

  // Populate Ship From dropdown
  const locSel = document.getElementById('rb-location');
  if (locSel) {
    const locId = getOrderWarehouseId(o);
    locSel.innerHTML = state.locationsList.length
      ? state.locationsList.map(l=>`<option value="${l.locationId}"${l.locationId===locId||(!locId&&l.isDefault)?' selected':''}>${escHtml(l.name)}</option>`).join('')
      : '<option value="">No locations loaded</option>';
  }

  // Populate Package dropdown
  const pkgSel = document.getElementById('rb-package');
  if (pkgSel) {
    const CLABEL = { stamps_com:'USPS', ups:'UPS', fedex:'FedEx' };
    const opt    = p => `<option value="${p.packageId}">${escHtml(p.name.replace(/^\[USPS\] |\[UPS\] |\[FedEx\] /,''))}</option>`;
    const custom  = state.packagesList.filter(p => p.source !== 'ss_carrier');
    const carrier = state.packagesList.filter(p => p.source === 'ss_carrier');
    let pkgHtml = '<option value="">Select Package</option>';
    if (custom.length) pkgHtml += `<optgroup label="Custom">${custom.map(opt).join('')}</optgroup>`;
    [...new Set(carrier.map(p => p.carrierCode))].forEach(cc => {
      pkgHtml += `<optgroup label="${CLABEL[cc]||cc.toUpperCase()}">${carrier.filter(p=>p.carrierCode===cc).map(opt).join('')}</optgroup>`;
    });
    pkgSel.innerHTML = pkgHtml;
  }

  renderRbCarriers();
  const modal = document.getElementById('rateBrowserModal');
  if (!modal) {
    console.error('[openRateBrowser] rateBrowserModal element not found in DOM');
    if (window.showToast) window.showToast('⚠️ Rate browser modal not found');
    return;
  }
  modal.style.display = 'flex';
  console.log('[openRateBrowser] Modal displayed');

  // Update ✓ badges and either prompt or auto-fetch
  rbUpdateBadges();
  const hasWt   = (parseFloat(document.getElementById('rb-wtlb')?.value)||0) > 0 ||
                  (parseFloat(document.getElementById('rb-wtoz')?.value)||0) > 0;
  const hasDims = (parseFloat(document.getElementById('rb-len')?.value)||0) > 0 &&
                  (parseFloat(document.getElementById('rb-wid')?.value)||0) > 0 &&
                  (parseFloat(document.getElementById('rb-hgt')?.value)||0) > 0;
  if (!hasWt || !hasDims) {
    rbSetRatesPane('<div style="color:var(--text3);font-size:13px;text-align:center;margin-top:80px;line-height:1.8">📏<br>Enter weight and dims<br>to fetch rates</div>');
  } else {
    // Only auto-fetch rates if carriers are loaded (prevents race condition)
    if (carriersLoaded) {
      rbSetRatesPane('<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">⏳ Fetching rates…</div>');
      browseRates();
    } else {
      rbSetRatesPane('<div style="color:var(--text3);font-size:13px;text-align:center;margin-top:80px;line-height:1.8">⏳ Loading carriers...<br>Click Browse Rates to continue</div>');
    }
  }
}

export function closeRateBrowser() {
  document.getElementById('rateBrowserModal').style.display = 'none';
}

export function rbViewChange() {
  state.rbViewMode = document.getElementById('rb-viewby')?.value || 'all';
  if (state.rbViewMode === 'all') {
    renderRbAllRates();
  } else {
    if (state.rbSelectedPid != null) renderRbRates(state.rbSelectedPid);
    else rbSetRatesPane('<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">Select a carrier account</div>');
  }
}

function rbToggleHideUnavail() {
  state.rbHideUnavailable = document.getElementById('rb-hide-unavail')?.checked ?? true;
  if (state.rbViewMode === 'all') renderRbAllRates();
  else if (state.rbSelectedPid != null) renderRbRates(state.rbSelectedPid);
}

function rbGetSvcClass() {
  return document.getElementById('rb-svcclass')?.value || '';
}

function rbFilterRates(rates) {
  const cls = rbGetSvcClass();
  if (!cls) return rates;
  return rates.filter(r => {
    const n = (r.serviceName || r.serviceCode || '').toLowerCase();
    if (cls === 'ground')  return n.includes('ground') || n.includes('surepost') || n.includes('parcel') || n.includes('media');
    if (cls === 'express') return n.includes('express') || n.includes('priority') || n.includes('2 day') || n.includes('2day') || n.includes('overnight') || n.includes('next day') || n.includes('3 day') || n.includes('select');
    return true;
  });
}

export function renderRbCarriers() {
  const div = document.getElementById('rb-carriers');
  if (!div) return;
  const { carriersList, rbRatesData, rbSelectedPid, rbHideUnavailable, rbStoreCarriers } = state;
  
  // Use store-specific carriers if available (multi-tenant), otherwise fall back to main account
  const displayCarriers = rbStoreCarriers || carriersList;

  const withRates = displayCarriers.filter(c => (rbRatesData[c.shippingProviderId]||[]).length > 0).length;
  const total     = displayCarriers.length;
  const countEl   = document.getElementById('rb-avail-count');
  if (countEl) countEl.textContent = Object.keys(rbRatesData).length
    ? `${withRates} out of ${total} carriers available`
    : '';

  div.innerHTML = '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:8px 12px 6px">Carrier Accounts</div>' +
    displayCarriers.map(c => {
      const isSel     = c.shippingProviderId === rbSelectedPid;
      const rawRates  = rbRatesData[c.shippingProviderId];
      const rateCount = rawRates != null
        ? (rbHideUnavailable ? rawRates.filter(r => !isBlockedRate(r, _rbStoreId)).length : rawRates.length)
        : null;
      const badge     = rateCount != null
        ? `<span style="background:${isSel?'rgba(255,255,255,.3)':'var(--ss-blue)'};color:#fff;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;min-width:22px;text-align:center">${rateCount}</span>`
        : `<span style="border-radius:10px;padding:1px 8px;font-size:10px;color:var(--text3)">…</span>`;
      return `<div onclick="rbSelectCarrier(${c.shippingProviderId})"
        style="display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;
               background:${isSel?'var(--ss-blue)':'transparent'};
               color:${isSel?'#fff':'var(--text)'};
               border-left:3px solid ${isSel?'var(--ss-blue)':'transparent'};
               transition:background .1s">
        ${carrierLogo(c.code, 16)}
        <span style="font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c._label||c.nickname||c.accountNumber||c.name)}</span>
        ${badge}
      </div>`;
    }).join('');
}

export function rbSelectRate(e, carrierCode, serviceName, serviceCode, pid, shipmentCost, otherCost, carrierNickname) {
  e && e.stopPropagation && e.stopPropagation();
  if (isBlockedRate({ serviceCode, serviceName }, _rbStoreId)) return;

  // 1. Set Shipping Account dropdown
  const acctSel = document.getElementById('p-shipacct');
  if (acctSel) acctSel.value = String(pid);

  // 2. Rebuild Service dropdown for this carrier, then inject + select exact serviceCode
  const acct   = state.carriersList.find(c => c.shippingProviderId == pid);
  const svcSel = document.getElementById('p-service');
  if (svcSel && acct) {
    updateServiceDropdown(acct.code, serviceCode);
    const found = Array.from(svcSel.options).find(o => o.value === serviceCode);
    if (!found) {
      const label = serviceName || serviceCode.replace(/_/g,' ');
      svcSel.add(new Option(label, serviceCode));
    }
    svcSel.value = serviceCode;
  }

  // 3. Push Rate Browser weight + dims back to panel
  const rbLb  = parseFloat(document.getElementById('rb-wtlb')?.value) || 0;
  const rbOz  = parseFloat(document.getElementById('rb-wtoz')?.value) || 0;
  const rbLen = parseFloat(document.getElementById('rb-len')?.value)  || 0;
  const rbWid = parseFloat(document.getElementById('rb-wid')?.value)  || 0;
  const rbHgt = parseFloat(document.getElementById('rb-hgt')?.value)  || 0;

  if (rbLb || rbOz) {
    const pLb = document.getElementById('p-wtlb'); if (pLb) pLb.value = rbLb;
    const pOz = document.getElementById('p-wtoz'); if (pOz) pOz.value = rbOz;
  }
  if (rbLen > 0 && rbWid > 0 && rbHgt > 0) {
    const pLen = document.getElementById('p-len'); if (pLen) pLen.value = rbLen;
    const pWid = document.getElementById('p-wid'); if (pWid) pWid.value = rbWid;
    const pHgt = document.getElementById('p-hgt'); if (pHgt) pHgt.value = rbHgt;
  }

  closeRateBrowser();
  if (window.showToast) window.showToast(`✅ ${serviceName || serviceCode.replace(/_/g,' ')} selected`);
  if (window.checkSkuSaveDirty) window.checkSkuSaveDirty();

  // Persist selected carrier account (shippingProviderId) to DB so markup applies after order ships
  if (pid && state.currentPanelOrder?.orderId) {
    fetch(`/api/orders/${state.currentPanelOrder.orderId}/selected-pid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPid: pid })
    }).catch(() => {});
  }

  // Render panel rate directly from the rate we already have
  const el = document.getElementById('panel-rate-val');
  const lb = document.getElementById('panel-scout-label');
  if (el && shipmentCost != null) {
    const rawCost    = (shipmentCost||0) + (otherCost||0);
    const markupCost = pid ? applyRbMarkup(pid, rawCost) : applyCarrierMarkup({ carrierCode, shipmentCost, otherCost });
    const cc  = carrierCode || '';
    const carrier = carrierNickname || (cc === 'stamps_com' ? 'USPS' : cc.startsWith('fedex') ? 'FedEx' : 'UPS');
    el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      ${priceDisplay(rawCost, markupCost)}
      <span style="font-size:10.5px;color:var(--text3)">${carrier} · ${trunc(serviceName||serviceCode,22)}</span>
    </div>`;
    if (lb) lb.textContent = 'Scout Review';
    if (state.currentPanelOrder) {
      const syntheticBest = { carrierCode, serviceCode, serviceName, shipmentCost, otherCost, carrierNickname, shippingProviderId: pid };
      state.orderBestRate[state.currentPanelOrder.orderId] = syntheticBest;
      if (window.renderRateCell) window.renderRateCell(state.currentPanelOrder.orderId, syntheticBest);
    }
  } else {
    if (window.debouncePanelRate) window.debouncePanelRate();
  }
}

function rbApplyPackage(packageId) {
  if (!packageId) return;
  const pkg = state.packagesList.find(p => String(p.packageId) === String(packageId));
  if (!pkg) return;
  if (pkg.length) rbSetVal('rb-len', pkg.length);
  if (pkg.width)  rbSetVal('rb-wid', pkg.width);
  if (pkg.height) rbSetVal('rb-hgt', pkg.height);
  rbUpdateBadges();
}

function rbUpdateBadgesAndAutoSelect() {
  // Update visual badges first
  rbUpdateBadges();

  // Try to auto-select a matching package based on entered dimensions
  const len = parseFloat(document.getElementById('rb-len')?.value) || 0;
  const wid = parseFloat(document.getElementById('rb-wid')?.value) || 0;
  const hgt = parseFloat(document.getElementById('rb-hgt')?.value) || 0;

  // Only proceed if all dimensions are entered
  if (len <= 0 || wid <= 0 || hgt <= 0) return;

  const tolerance = 0.15;
  const fuzzyMatch = state.packagesList.find(p => {
    if (!p.length || !p.width || !p.height) return false;
    return Math.abs(p.length - len) <= tolerance &&
           Math.abs(p.width - wid) <= tolerance &&
           Math.abs(p.height - hgt) <= tolerance;
  });

  // If match found, auto-select it in the dropdown
  if (fuzzyMatch) {
    const pkgSel = document.getElementById('rb-package');
    if (pkgSel) {
      pkgSel.value = fuzzyMatch.packageId;
    }
  }
}

function rbSelectCarrier(pid) {
  state.rbSelectedPid = pid;
  state.rbViewMode    = 'carriers';
  rbSetVal('rb-viewby', 'carriers');
  renderRbCarriers();
  if (state.rbRatesData[pid] != null) renderRbRates(pid);
  else rbSetRatesPane('<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">Click Browse Rates to fetch rates for this account</div>');
}

export async function browseRates() {
  const lb          = parseFloat(document.getElementById('rb-wtlb')?.value) || 0;
  const oz          = parseFloat(document.getElementById('rb-wtoz')?.value) || 0;
  const wtOz        = lb * 16 + oz;
  const zip         = (document.getElementById('rb-zip')?.value || '').replace(/\D/g,'').slice(0,5);
  const len         = parseFloat(document.getElementById('rb-len')?.value) || 0;
  const wid         = parseFloat(document.getElementById('rb-wid')?.value) || 0;
  const hgt         = parseFloat(document.getElementById('rb-hgt')?.value) || 0;
  const hasDims     = len > 0 && wid > 0 && hgt > 0;
  const rbResidential = state.rbCurrentOrder ? isResidential(state.rbCurrentOrder) : true;

  if (!zip || zip.length < 5) { if(window.showToast) window.showToast('⚠️ Enter a 5-digit zip code'); return; }
  if (!wtOz || !hasDims) {
    const missing = !wtOz && !hasDims ? 'weight and dims'
                  : !wtOz            ? 'weight'
                  :                    'dims (L × W × H)';
    rbSetRatesPane(`<div style="text-align:center;padding:50px 20px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:12px">📏</div>
      <div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:6px">Enter ${missing} to fetch rates</div>
      <div style="font-size:12px">Fill in the fields on the left panel, then click Browse Rates.</div>
    </div>`);
    return;
  }

  state.rbRatesData = {};
  renderRbCarriers();
  rbSetRatesPane('<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">⏳ Fetching rates…</div>');

  // Use store-specific carriers if available (multi-tenant), otherwise fall back to main account
  const displayCarriers = state.rbStoreCarriers || state.carriersList;
  console.log(`[Rate Browser] displayCarriers source: ${state.rbStoreCarriers ? 'store-specific' : 'main'}, count: ${displayCarriers.length}, storeId: ${_rbStoreId}`);

  // Check rate cache first — include storeId so server resolves correct clientId for cache key
  const signatureOption = document.getElementById('rb-signature')?.value || 'none';
  const resFlag = rbResidential ? 'R' : 'C';
  const storeParam = _rbStoreId ? `&storeId=${_rbStoreId}` : '';
  const sigParam = signatureOption && signatureOption !== 'none' ? `&signature=${signatureOption}` : '';
  const cachedRbData = await fetchValidatedJson(`/api/rates/cached?wt=${Math.round(wtOz)}&zip=${zip}&l=${len}&w=${wid}&h=${hgt}&residential=${rbResidential?1:0}${storeParam}${sigParam}`, undefined, parseCachedRatesResponse)
    .catch(()=>null);
  const cachedCodes = new Set();
  if (cachedRbData?.cached && Array.isArray(cachedRbData.rates) && cachedRbData.rates.length) {
    displayCarriers.forEach(a => {
      const acctRates = cachedRbData.rates.filter(r =>
        r.shippingProviderId ? r.shippingProviderId === a.shippingProviderId : r.carrierCode === a.code
      );
      if (acctRates.length) {
        const list = acctRates.map(r => ({
          ...r,
          shippingProviderId: r.shippingProviderId ?? a.shippingProviderId,
          carrierNickname: r.carrierNickname || a._label || a.nickname || a.accountNumber || a.name,
        }));
        list.sort((x,y)=>(x.shipmentCost+x.otherCost)-(y.shipmentCost+y.otherCost));
        state.rbRatesData[a.shippingProviderId] = list;
        cachedCodes.add(a.shippingProviderId);
      }
    });
    if (cachedCodes.size > 0) {
      renderRbCarriers();
      if (state.rbViewMode === 'all') renderRbAllRates();
      else if (state.rbSelectedPid != null && state.rbRatesData[state.rbSelectedPid] != null) renderRbRates(state.rbSelectedPid);
    }
  }

  const accountsToFetch = displayCarriers.filter(a =>
    a.code !== 'voucher-generic' && !cachedCodes.has(a.shippingProviderId)
  );
  console.log('[Rate Browser] browsRates() called');
  console.log('[Rate Browser] displayCarriers:', displayCarriers.length, 'cached:', cachedCodes.size, 'toFetch:', accountsToFetch.length);
  console.log('[Rate Browser] All carriers:', displayCarriers.map(a => ({code: a.code, pid: a.shippingProviderId, label: a._label||a.nickname})));
  console.log('[Rate Browser] Carriers to fetch:', accountsToFetch.map(a => ({code: a.code, pid: a.shippingProviderId, label: a._label||a.nickname})));
  let fetchErrors = 0;
  for (const acct of accountsToFetch) {
    try {
      const signatureOption = document.getElementById('rb-signature')?.value || 'none';
      const rateObj = await fetchValidatedJson('/api/rates/browse', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          carrierCode: acct.code,
          shippingProviderId: acct.shippingProviderId,
          toPostalCode: zip, weightOz: wtOz,
          dimensions: { length:len, width:wid, height:hgt },
          residential: rbResidential,
          storeId: _rbStoreId,
          signatureOption: signatureOption,
        })
      }, parseBrowseRatesResponse);
      const raw = rateObj.rates || [];
      console.log(`[Rate Browse] spid=${acct.shippingProviderId}: ${raw.length} rates`);
      if (!raw.length) {
        console.warn(`[Rate Browse] No rates for spid=${acct.shippingProviderId}`);
        fetchErrors++;
      }
      const a = acct;
      const list = raw.map(r => ({
        ...r,
        shippingProviderId: r.shippingProviderId ?? a.shippingProviderId,
        carrierNickname: r.carrierNickname || a._label || a.nickname || a.accountNumber || a.name,
      }));
      list.sort((x,y)=>(x.shipmentCost+x.otherCost)-(y.shipmentCost+y.otherCost));
      state.rbRatesData[a.shippingProviderId] = list;
    } catch {
      fetchErrors++;
      state.rbRatesData[acct.shippingProviderId] = [];
    }
    renderRbCarriers();
    if (state.rbViewMode === 'all') renderRbAllRates();
    else if (state.rbSelectedPid != null && state.rbRatesData[state.rbSelectedPid] != null) renderRbRates(state.rbSelectedPid);
    await new Promise(r => setTimeout(r, 200));
  }

  if (fetchErrors > 0 && fetchErrors === accountsToFetch.length) {
    rbSetRatesPane(`<div style="text-align:center;padding:40px 20px">
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">⚠️ Rate fetch failed (API rate limit). Wait a moment and try again.</div>
      <button class="btn btn-primary btn-sm" onclick="browseRates()">↻ Retry</button>
    </div>`);
  }

  // Auto-select first carrier with rates
  if (state.rbSelectedPid == null) {
    const first = displayCarriers.find(c => (state.rbRatesData[c.shippingProviderId]||[]).length > 0);
    if (first) { state.rbSelectedPid = first.shippingProviderId; renderRbCarriers(); }
  }
  if (state.rbViewMode === 'all') renderRbAllRates();
  else if (state.rbSelectedPid != null) renderRbRates(state.rbSelectedPid);
}

export function rbCarrierLogo(code) {
  const styles = {
    ups:           'background:#351c15;color:#ffb500',
    ups_walleted:  'background:#351c15;color:#ffb500',
    stamps_com:    'background:#215eb6;color:#fff',
    fedex:         'background:#4d148c;color:#ff6200',
    fedex_walleted:'background:#4d148c;color:#ff6200',
  };
  const labels = {
    ups:'UPS', ups_walleted:'UPS', stamps_com:'USPS', fedex:'FedEx', fedex_walleted:'FedEx'
  };
  const s = styles[code] || 'background:var(--border2);color:var(--text2)';
  const l = labels[code] || (code||'?').toUpperCase().slice(0,4);
  return `<div style="width:40px;height:40px;border-radius:6px;${s};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;flex-shrink:0;letter-spacing:-.3px">${l}</div>`;
}

const SERVICE_TRANSIT = {
  ups_ground:                    '1–5 days',
  ups_ground_saver:              '2–5 days',
  ups_surepost_less_than_1_lb:   '2–7 days',
  ups_surepost_1_lb_or_greater:  '2–7 days',
  ups_3_day_select:              '3 days',
  ups_2nd_day_air:               '2 days',
  ups_2nd_day_air_am:            '2 days (AM)',
  ups_next_day_air_saver:        '1 day',
  ups_next_day_air:              '1 day',
  ups_next_day_air_early_am:     '1 day (early)',
  usps_media_mail:               '2–8 days',
  usps_first_class_mail:         '1–3 days',
  usps_ground_advantage:         '2–5 days',
  usps_priority_mail:            '1–3 days',
  usps_priority_mail_express:    '1–2 days',
  usps_parcel_select:            '2–9 days',
  fedex_ground:                  '1–5 days',
  fedex_home_delivery:           '1–5 days',
  fedex_2day:                    '2 days',
  fedex_2day_am:                 '2 days (AM)',
  fedex_express_saver:           '3 days',
  fedex_standard_overnight:      '1 day',
  fedex_priority_overnight:      '1 day (early)',
  fedex_first_overnight:         '1 day (earliest)',
};

function rbFormatEta(r) {
  if (r.estimatedDelivery) {
    const d = new Date(r.estimatedDelivery);
    const dayStr = d.toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'});
    const timeStr = d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    return `${dayStr} By ${timeStr}`;
  }
  if (r.deliveryDays) return `${r.deliveryDays} Day${r.deliveryDays>1?'s':''}`;
  return '—';
}

export function rbRateRow(r, i, showCarrier, isRecommended = false) {
  const { carriersList, rbSelectedPid, rbMarkups } = state;
  const blocked    = isBlockedRate(r, _rbStoreId);
  const base       = (r.shipmentCost||0) + (r.otherCost||0);
  const pid        = r.shippingProviderId || rbSelectedPid;
  const marked     = applyRbMarkup(pid, base);
  const total      = marked.toFixed(2);
  const svcName    = r.serviceName || SERVICE_NAMES[r.serviceCode] || (r.serviceCode||'').replace(/_/g,' ') || '—';
  const acctName   = formatCarrierDisplay(r);
  const eta        = rbFormatEta(r);
  const logo       = rbCarrierLogo(r.carrierCode || '');
  const svcLabel   = (svcName||'').replace(/['"]/g,'');
  const recommended = (!blocked && isRecommended) ? `<div style="display:inline-block;background:#1a5c29;color:#fff;font-size:10px;font-weight:700;padding:1px 8px;border-radius:3px;margin-bottom:4px;letter-spacing:.3px">Recommended</div><br>` : '';

  const clickAttr  = blocked
    ? `title="Not available for current clients"`
    : `onclick="rbSelectRate(event,'${r.carrierCode||''}','${svcLabel}','${r.serviceCode||''}',${pid},${r.shipmentCost||0},${r.otherCost||0},'${(r.carrierNickname||'').replace(/'/g, "\\'")}')"
       onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"`;
  const rowStyle   = blocked
    ? `display:flex;align-items:center;gap:14px;padding:10px 18px;border-bottom:1px solid var(--border);cursor:not-allowed;opacity:.45;`
    : `display:flex;align-items:center;gap:14px;padding:10px 18px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:0;transition:background .1s`;
  const textStyle  = blocked ? 'text-decoration:line-through;' : '';

  // Surcharge breakdown from rate_details (exclude base shipping line)
  const surcharges = (r.rateDetails || []).filter(d => d.rate_detail_type !== 'shipping' && (d.amount?.amount || 0) > 0);
  const surchargeHtml = surcharges.length ? `
    <div style="font-size:10px;color:var(--text3);margin-top:2px;line-height:1.5;">
      ${surcharges.map(d => `<span style="margin-right:8px">+$${(d.amount.amount).toFixed(2)} ${escHtml(d.carrier_description)}</span>`).join('')}
    </div>` : '';

  // In single-carrier view (showCarrier=false): primary=service name, secondary=empty
  // In All Rates view (showCarrier=true): primary=account name, secondary=service name
  // ETA shown on right side between carrier name and price in all views
  const primaryText  = showCarrier ? escHtml(acctName) : escHtml(svcName);
  const secondaryText = showCarrier ? escHtml(svcName) : '';
  const etaHtml = eta ? `<div style="font-size:12px;font-weight:700;color:#000;white-space:nowrap;text-align:right;margin-right:15px">${escHtml(eta)}</div>` : '';
  return `${recommended}<div ${clickAttr} style="${rowStyle}">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700;color:var(--text);line-height:1.3;${textStyle}">${primaryText}${blocked?` <span style="font-size:10px;color:var(--text3);font-weight:400;text-decoration:none">(unavailable)</span>`:''}</div>
      ${secondaryText ? `<div style="font-size:11.5px;color:var(--text3);line-height:1.4">${secondaryText}</div>` : ''}
      ${surchargeHtml}
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;${textStyle}">
      ${etaHtml}
      ${logo}
      <div style="text-align:right;min-width:65px;">
        ${priceDisplay(base, marked, { mainSize:'13px', mainColor: blocked ? 'var(--text3)' : 'var(--green)' })}
      </div>
    </div>
  </div>`;
}

export function renderRbRates(pid) {
  const { carriersList, rbRatesData, rbHideUnavailable, rbStoreCarriers } = state;
  
  // Use store-specific carriers if available (multi-tenant), otherwise fall back to main account
  const displayCarriers = rbStoreCarriers || carriersList;
  
  const acct  = displayCarriers.find(c => c.shippingProviderId === pid);
  const all   = rbRatesData[pid] || [];
  const rates = rbFilterRates(all);

  if (!all.length) {
    rbSetRatesPane(`<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">No rates available for <b>${escHtml(acct?.nickname||'this account')}</b></div>`);
    return;
  }

  const allRates    = rates;
  const displayed   = rbHideUnavailable ? allRates.filter(r => !isBlockedRate(r, _rbStoreId)) : allRates;
  const hiddenCount = allRates.length - displayed.length;
  const countLabel  = rbHideUnavailable && hiddenCount > 0
    ? `${displayed.length} shown, ${hiddenCount} hidden`
    : `${allRates.length} rate${allRates.length!==1?'s':''} available`;

  const header = `<div style="padding:14px 18px 10px;border-bottom:2px solid var(--border);background:var(--surface2);flex-shrink:0">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:700;color:var(--text)">${escHtml(acct?._label||acct?.nickname||acct?.accountNumber||'Account')}</span>
      <span style="font-size:11px;color:var(--text3)">${countLabel}</span>
    </div>
  </div>
  <div style="overflow-y:auto;flex:1;padding-bottom:16px">`;

  const firstOk = displayed.findIndex(r => !isBlockedRate(r, _rbStoreId));
  rbSetRatesPane(header + displayed.map((r,i) => rbRateRow(r,i,false, i===firstOk)).join('') + '</div>');
}

export function renderRbAllRates() {
  const { carriersList, rbRatesData, rbHideUnavailable, rbStoreCarriers } = state;
  
  // Use store-specific carriers if available (multi-tenant), otherwise fall back to main account
  const displayCarriers = rbStoreCarriers || carriersList;
  
  let combined = [];
  displayCarriers.forEach(c => {
    const rates = rbRatesData[c.shippingProviderId] || [];
    rates.forEach(r => combined.push({
      ...r,
      shippingProviderId: r.shippingProviderId ?? c.shippingProviderId,
      carrierNickname: r.carrierNickname || c._label || c.nickname || c.accountNumber || c.name,
    }));
  });
  combined = rbFilterRates(combined).sort((a,b) =>
    applyRbMarkup(a.shippingProviderId,(a.shipmentCost+a.otherCost)) - applyRbMarkup(b.shippingProviderId,(b.shipmentCost+b.otherCost)));

  if (!combined.length) {
    rbSetRatesPane('<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">No rates available — click Browse Rates</div>');
    return;
  }

  const allCount      = combined.length;
  const displayed     = rbHideUnavailable ? combined.filter(r => !isBlockedRate(r, _rbStoreId)) : combined;
  const hiddenCount   = allCount - displayed.length;
  const countLabel    = rbHideUnavailable && hiddenCount > 0
    ? `${displayed.length} shown, ${hiddenCount} hidden`
    : `${allCount} total, sorted cheapest first`;

  if (!displayed.length) {
    rbSetRatesPane('<div style="color:var(--text3);font-size:12.5px;text-align:center;margin-top:80px">No rates available — click Browse Rates</div>');
    return;
  }

  const header = `<div style="padding:14px 18px 10px;border-bottom:2px solid var(--border);background:var(--surface2);flex-shrink:0">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:700;color:var(--text)">All Rates</span>
      <span style="font-size:11px;color:var(--text3)">${countLabel}</span>
    </div>
  </div>
  <div style="overflow-y:auto;flex:1;padding-bottom:16px">`;

  const firstOkAll = displayed.findIndex(r => !isBlockedRate(r, _rbStoreId));
  rbSetRatesPane(header + displayed.map((r,i) => rbRateRow(r,i,true, i===firstOkAll)).join('') + '</div>');
}

function rbRerender() {
  if (state.rbViewMode === 'all') renderRbAllRates();
  else if (state.rbSelectedPid != null && state.rbRatesData[state.rbSelectedPid]) renderRbRates(state.rbSelectedPid);
}

// ─── Window exports ────────────────────────────────────────────────────────────
// Note: saveRbMarkup and renderSettingsRbMarkups are owned by markups.js
// (window.saveRbMarkup / window.renderSettingsRbMarkups exported there)
window.openRateBrowser       = openRateBrowser;
window.rbUpdateBadges        = rbUpdateBadges;
window.rbUpdateBadgesAndAutoSelect = rbUpdateBadgesAndAutoSelect;
window.closeRateBrowser      = closeRateBrowser;
window.rbViewChange          = rbViewChange;
window.rbSelectRate          = rbSelectRate;
window.browseRates           = browseRates;
window.rbSelectCarrier       = rbSelectCarrier;
window.rbApplyPackage        = rbApplyPackage;
window.rbToggleHideUnavail   = rbToggleHideUnavail;
window.renderRbCarriers      = renderRbCarriers;
window.renderRbAllRates      = renderRbAllRates;
window.renderRbRates         = renderRbRates;
window.rbRateRow             = rbRateRow;
window.rbCarrierLogo         = rbCarrierLogo;
// renderSettingsRbMarkups and saveRbMarkup are exported by markups.js
