import { state } from './state.js';
import { escHtml, showToast } from './utils.js';
import { isBlockedRate } from './constants.js';

// ═══════════════════════════════════════════════
//  MARKUP LOADING & SAVING
// ═══════════════════════════════════════════════
export async function loadRbMarkups() {
  try {
    const data = await fetch('/api/settings/rbMarkups').then(r => r.json());
    if (data && typeof data === 'object') state.rbMarkups = data;
  } catch {
    try {
      const s = localStorage.getItem('prepship_rb_markups');
      if (s) state.rbMarkups = JSON.parse(s);
    } catch {}
  }
}

export function saveRbMarkup(pid, type, value) {
  if (!state.rbMarkups[pid]) state.rbMarkups[pid] = {};
  state.rbMarkups[pid] = { type, value: parseFloat(value) || 0 };
  fetch('/api/settings/rbMarkups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.rbMarkups)
  }).catch(() => {});
  try { localStorage.setItem('prepship_rb_markups', JSON.stringify(state.rbMarkups)); } catch {}
  clearTimeout(state._markupRefreshTimer);
  state._markupRefreshTimer = setTimeout(() => {
    Object.keys(state.rateCache).forEach(k => delete state.rateCache[k]);
    // Use window.renderOrders to avoid circular dep at import time
    if (state.currentStatus === 'awaiting_shipment' && state.filteredOrders.length) {
      if (typeof window.renderOrders === 'function') window.renderOrders();
    }
    showToast('✅ Markup saved — rates refreshed', 5000);
  }, 600);
}

export function applyRbMarkup(pid, basePrice) {
  const m = state.rbMarkups[pid];
  if (!m || !m.value) return basePrice;
  return m.type === 'pct' ? basePrice * (1 + m.value / 100) : basePrice + m.value;
}

export function getCarrierMarkup(carrierCode, shippingProviderId) {
  if (shippingProviderId && state.rbMarkups[shippingProviderId]) return state.rbMarkups[shippingProviderId];
  if (state.rbMarkups[carrierCode]) return state.rbMarkups[carrierCode];
  return { type: 'flat', value: 0 };
}

export function applyCarrierMarkup(rate, shippingProviderId) {
  const base = (rate.shipmentCost || 0) + (rate.otherCost || 0);
  const effectiveSpid = rate.shippingProviderId || shippingProviderId;
  const m = getCarrierMarkup(rate.carrierCode || '', effectiveSpid);
  if (!m || !m.value) return base;
  return m.type === 'pct' ? base * (1 + m.value / 100) : base + m.value;
}

// Helper: format rate display for ORION/ORI rates (always show markup + cost even if no markup configured)
export function formatOrionRateDisplay(rate, opts = {}) {
  if (!isOrionRate(rate)) return null;
  const rawCost = (rate.shipmentCost || 0) + (rate.otherCost || 0);
  const markedCost = applyCarrierMarkup(rate);
  const mainSize  = opts.mainSize  || '13px';
  const subSize   = opts.subSize   || '10px';
  const mainColor = opts.mainColor || 'var(--green)';
  
  // For ORION rates, ALWAYS show both marked price (top) and cost (bottom)
  // This ensures transparency on custom account pricing
  const showPrice = markedCost > 0.005 || rawCost > 0.005;
  if (!showPrice) return `<span style="color:var(--text3);font-size:${mainSize}">N/A</span>`;
  
  return `<div style="line-height:1.3">
    <strong style="color:${mainColor};font-size:${mainSize}">$${markedCost.toFixed(2)}</strong>
    <div style="font-size:${subSize};color:var(--text3)">$${rawCost.toFixed(2)} cost</div>
  </div>`;
}

export function priceDisplay(rawCost, markedCost, opts = {}) {
  const hasMarkup = markedCost > rawCost + 0.005;
  const mainSize  = opts.mainSize  || '13px';
  const subSize   = opts.subSize   || '10px';
  const mainColor = opts.mainColor || 'var(--green)';
  const showPrice = markedCost > 0.005 || rawCost > 0.005;
  if (!showPrice) return `<span style="color:var(--text3);font-size:${mainSize}">N/A</span>`;
  return `<div style="line-height:1.3">
    <strong style="color:${mainColor};font-size:${mainSize}">$${(hasMarkup ? markedCost : rawCost).toFixed(2)}</strong>
    ${hasMarkup ? `<div style="font-size:${subSize};color:var(--text3)">$${rawCost.toFixed(2)} cost</div>` : ''}
  </div>`;
}

export function isResidential(o) {
  // Priority 1: manual override stored in order_local
  if (o._residential === 1) return true;
  if (o._residential === 0) return false;
  // Priority 2: ShipStation's own residential determination (from shipTo.residential)
  if (o._ssResidential === 1) return true;
  if (o._ssResidential === 0) return false;
  // Priority 3: no company name = residential (common industry fallback)
  return !o._shipCompany;
}

export function isOrionRate(rate) {
  // Identify ORION/ORI rates by:
  // 1. shippingProviderId = 596001 (ORION account)
  // 2. OR account nickname contains 'ORI' (ORION, ORION_CUSTOM, etc.)
  if (!rate) return false;
  if (rate.shippingProviderId === 596001) return true;
  const nickname = (rate.carrierNickname || '').toUpperCase();
  return nickname.includes('ORI');
}

export function pickBestRate(rates, spid, storeId = null) {
  if (!rates?.length) return null;
  
  // Debug: log all rates for storeId 376759 (Media Mail allowed)
  let hasMediaMail = false;
  let mediaMailBlocked = false;
  
  const available = rates.filter(r => {
    const blocked = isBlockedRate(r, storeId);
    const cost = (r.shipmentCost || 0) + (r.otherCost || 0);
    
    if (r.serviceCode === 'usps_media_mail') {
      hasMediaMail = true;
      if (blocked) mediaMailBlocked = true;
      console.log(`[pickBestRate] Media Mail: storeId=${storeId}, blocked=${blocked}, cost=$${cost.toFixed(2)}`);
    }
    
    return !blocked && cost > 0;
  });
  
  // Debug: show all available rates for storeId 376759
  if (storeId === 376759 && hasMediaMail) {
    const cheapest = available.reduce((a, b) => (a.shipmentCost + a.otherCost) <= (b.shipmentCost + b.otherCost) ? a : b);
    console.log(`[pickBestRate] Available after filtering: ${available.length} rates`);
    console.log(`[pickBestRate] Cheapest by cost: ${cheapest.serviceName} $${(cheapest.shipmentCost + cheapest.otherCost).toFixed(2)}`);
  }
  
  if (!available.length) {
    if (storeId === 376759 && mediaMailBlocked) {
      console.warn(`[pickBestRate] NO RATES AVAILABLE - Media Mail was blocked!`);
    }
    return null;
  }
  
  const best = available.reduce((a, b) => applyCarrierMarkup(a) <= applyCarrierMarkup(b) ? a : b);
  
  if (storeId === 376759) {
    console.log(`[pickBestRate] FINAL SELECTION for storeId=${storeId}: ${best.serviceName} at $${applyCarrierMarkup(best).toFixed(2)}`);
  }
  
  return best;
}

// ═══════════════════════════════════════════════
//  SETTINGS: RENDER MARKUP ROWS
// ═══════════════════════════════════════════════
export function renderSettingsRbMarkups() {
  const div = document.getElementById('settings-rb-markups');
  if (!div) return;
  if (!state.carriersList.length) {
    div.innerHTML = '<span style="font-size:12px;color:var(--text3)">Open Rate Browser once to load accounts.</span>';
    return;
  }
  div.innerHTML = state.carriersList.map(c => {
    const m   = state.rbMarkups[c.shippingProviderId] || { type:'flat', value:0 };
    const pid = c.shippingProviderId;
    const preview = m.type === 'pct' ? `+${m.value || 0}%` : `+$${parseFloat(m.value || 0).toFixed(2)}`;
    return `<div class="markup-row">
      <span class="markup-label">${escHtml(c._label || c.nickname || c.accountNumber || c.name)}</span>
      <select onchange="saveRbMarkup(${pid},this.value,this.nextElementSibling.value)" style="width:52px;margin-right:4px;border:1px solid var(--border);border-radius:3px;padding:3px 2px;background:var(--surface);font-size:12px;color:var(--text)">
        <option value="flat" ${m.type === 'flat' ? 'selected' : ''}>$</option>
        <option value="pct"  ${m.type === 'pct'  ? 'selected' : ''}>%</option>
      </select>
      <input class="markup-input-lg" type="number" min="0" step="0.25" value="${m.value != null && m.value !== '' ? m.value : ''}"
        placeholder="0"
        oninput="saveRbMarkup(${pid},this.previousElementSibling.value,this.value);this.closest('.markup-row').querySelector('.mu-preview').textContent=(this.previousElementSibling.value==='pct'?'+'+(this.value||0)+'%':'+$'+parseFloat(this.value||0).toFixed(2))">
      <span class="markup-preview mu-preview">${preview}</span>
    </div>`;
  }).join('');
}

export function rbRerender() {
  if (state.rbViewMode === 'all') {
    if (typeof window.renderRbAllRates === 'function') window.renderRbAllRates();
  } else if (state.rbSelectedPid != null && state.rbRatesData[state.rbSelectedPid]) {
    if (typeof window.renderRbRates === 'function') window.renderRbRates(state.rbSelectedPid);
  }
}

export function updateProfitEstimate() {
  const el = document.getElementById('profitEstimate');
  if (!el) return;
  const daily = state.totalOrders || 0;
  const vals = Object.values(state.rbMarkups).map(m => m.type === 'pct' ? 8 * (m.value / 100) : (m.value || 0));
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  el.innerHTML = `
    <div>Avg markup/label: <strong style="color:var(--orange)">$${avg.toFixed(2)}</strong></div>
    <div>Daily orders: <strong>${daily.toLocaleString()}</strong></div>
    <div>Est. daily profit: <strong style="color:var(--green)">$${(daily * avg).toFixed(0)}</strong></div>
    <div>Est. monthly profit: <strong style="color:var(--green)">$${(daily * avg * 30).toFixed(0)}/mo</strong></div>`;
}

// Expose to window for inline HTML calls
window.saveRbMarkup              = saveRbMarkup;
window.renderSettingsRbMarkups   = renderSettingsRbMarkups;
window.rbRerender                = rbRerender;
window.formatOrionRateDisplay    = formatOrionRateDisplay;
window.isOrionRate               = isOrionRate;
