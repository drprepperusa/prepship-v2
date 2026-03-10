import { state } from './state.js';
import { escHtml } from './utils.js';
import { CARRIER_SERVICES, CARRIER_NAMES } from './constants.js';
import { fetchValidatedJson } from './api-client.js';
import { parseCarrierAccountDtoList, parseInitStoreDtoList } from './api-contracts.js';
import { getOrderBillingProviderId, getOrderStoreId } from './order-data.js';

// ═══════════════════════════════════════════════
//  STORES
// ═══════════════════════════════════════════════
export async function loadStores() {
  try {
    const data = await fetchValidatedJson('/api/stores', undefined, parseInitStoreDtoList);
    (data || []).forEach(s => { state.storeMap[s.storeId] = s.storeName; });
  } catch (e) { console.warn('loadStores:', e); }
}

export function getStoreName(o) {
  if (!o) return '—';
  const sid = getOrderStoreId(o);
  return (sid && state.storeMap[sid]) || o.internalNotes || 'Untagged';
}

// ═══════════════════════════════════════════════
//  CARRIER ACCOUNTS
// ═══════════════════════════════════════════════
export async function loadCarrierAccounts() {
  try {
    // Use v2 carrier-accounts config (has shippingProviderId + nickname) instead of
    // SS v1 /carriers (only has generic {code, name} — no spid, no account nicknames)
    const data = await fetchValidatedJson('/api/carrier-accounts', undefined, parseCarrierAccountDtoList);
    // Normalize: add `code` alias for `carrierCode` so existing lookups still work
    state.carriersList = data.map(c => ({
      ...c,
      code: c.code || c.carrierCode,
      _label: c._label || c.nickname || c.accountNumber || c.name,
    }));
    state.carrierAccountMap = {};
    state.carriersList.forEach(c => {
      if (c.shippingProviderId) {
        state.carrierAccountMap[c.shippingProviderId] = c._label || c.nickname;
      }
    });
    refreshShipAcctDropdown();
  } catch (e) { console.warn('loadCarrierAccounts:', e); }
}

export function refreshShipAcctDropdown() {
  const sel = document.getElementById('p-shipacct');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select Account —</option>' +
    state.carriersList.map(c =>
      `<option value="${c.shippingProviderId}">${escHtml(c._label || c.nickname || c.accountNumber || c.name)}</option>`
    ).join('');
}

export function getShipAcct(o) {
  if (!o) return null;
  const pid = getOrderBillingProviderId(o);
  if (!pid) return null;
  const acct = state.carriersList.find(c => c.shippingProviderId === pid);
  return acct ? (acct._label || acct.nickname || acct.accountNumber || acct.name) : null;
}

export function onShipAcctChange() {
  const sel  = document.getElementById('p-shipacct');
  const pid  = parseInt(sel?.value) || null;
  const acct = pid ? state.carriersList.find(c => c.shippingProviderId === pid) : null;
  if (acct) updateServiceDropdown(acct.code);
  // Trigger rate refresh
  if (typeof window.debouncePanelRate === 'function') window.debouncePanelRate();
}

export function updateServiceDropdown(carrierCode, preselect) {
  const svcSel = document.getElementById('p-service');
  if (!svcSel) return;
  const svcs = CARRIER_SERVICES[carrierCode] || [];
  svcSel.innerHTML = '<option value="">Select Service</option>' +
    svcs.map(s => `<option value="${s.code}"${s.code === preselect ? ' selected' : ''}>${s.label}</option>`).join('');
  if (preselect) svcSel.value = preselect;
}

// Expose to window for inline HTML calls
window.onShipAcctChange = onShipAcctChange;
