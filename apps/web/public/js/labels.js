import { state } from './state.js';
import { showToast } from './utils.js';
import { applyCarrierMarkup } from './markups.js';
import { fetchValidatedJson } from './api-client.js';
import {
  parseCreateLabelResponse,
  parseRetrieveLabelResponse,
  parseReturnLabelResponse,
  parseVoidLabelResponse,
} from './api-contracts.js';
import { getOrderShipTo } from './order-data.js';

// ═══════════════════════════════════════════════
//  LABEL CREATION
// ═══════════════════════════════════════════════

export async function createLabel(testLabel = false) {
  const o = state.currentPanelOrder;
  if (!o) return showToast('⚠ No order selected');

  // Gather fields
  const wtLb    = parseFloat(document.getElementById('p-wtlb')?.value) || 0;
  const wtOz    = parseFloat(document.getElementById('p-wtoz')?.value) || 0;
  const totalOz = (wtLb * 16) + wtOz;
  const pid     = parseInt(document.getElementById('p-shipacct')?.value) || null;
  const service = document.getElementById('p-service')?.value || '';
  const pkgVal  = document.getElementById('p-package')?.value || '';
  const length  = parseFloat(document.getElementById('p-len')?.value) || 0;
  const width   = parseFloat(document.getElementById('p-wid')?.value) || 0;
  const height  = parseFloat(document.getElementById('p-hgt')?.value) || 0;
  // Delivery confirmation is the panel default; explicit "None" downgrades to delivery for parity.
  const confirmationOption = document.getElementById('p-confirm')?.value || 'delivery';
  const confirm = confirmationOption === 'none' ? 'delivery' : confirmationOption;
  const locId   = parseInt(document.getElementById('p-location')?.value) || null;

  // Validate: package required
  if (!pkgVal || pkgVal === '') {
    return showToast('⚠ Select a package before creating a label');
  }

  // Validate: carrier + service required
  if (!pid)     return showToast('⚠ Select a carrier account');
  if (!service) return showToast('⚠ Select a shipping service');
  if (!totalOz) return showToast('⚠ Enter shipment weight');

  // Determine packageCode and customPackageId
  const selectedPkg = state.packagesList.find(p => String(p.packageId) === String(pkgVal));
  let packageCode     = 'package';
  let customPackageId = null;
  if (selectedPkg) {
    if (selectedPkg.source === 'ss_carrier') {
      packageCode = selectedPkg.packageCode || 'package';
    } else {
      packageCode     = 'package';
      customPackageId = selectedPkg.packageId;
    }
  } else if (pkgVal !== '__custom__') {
    packageCode = pkgVal; // fallback: use as-is
  }

  // Determine ship-from location
  const shipFromLoc = locId ? state.locationsList.find(l => l.locationId === locId) : null;
  const shipFrom = shipFromLoc
    ? {
        name:       shipFromLoc.name,
        company:    shipFromLoc.company    || '',
        street1:    shipFromLoc.street1    || '',
        street2:    shipFromLoc.street2    || '',
        city:       shipFromLoc.city       || '',
        state:      shipFromLoc.state      || '',
        postalCode: shipFromLoc.postalCode || '',
        country:    shipFromLoc.country    || 'US',
        phone:      shipFromLoc.phone      || '',
      }
    : null;

  // Get carrier account code from the carriers list
  const acct = state.carriersList.find(c => c.shippingProviderId === pid);
  const carrierCode = acct?.code || '';
  if (!carrierCode) return showToast('⚠ Could not resolve carrier code — select a valid account');
  const shipTo = getOrderShipTo(o);

  const payload = {
    orderId:     o.orderId,
    orderNumber: o.orderNumber,
    carrierCode,
    serviceCode: service,
    packageCode,
    customPackageId,
    weightOz:    totalOz,
    length, width, height,
    confirmation: confirm,
    testLabel:   !!testLabel,
    shippingProviderId: pid,
    shipTo: {
      name:       shipTo.name       || '',
      company:    shipTo.company    || '',
      street1:    shipTo.street1    || '',
      street2:    shipTo.street2    || '',
      city:       shipTo.city       || '',
      state:      shipTo.state      || '',
      postalCode: shipTo.postalCode || '',
      country:    shipTo.country    || 'US',
      phone:      shipTo.phone      || '',
    },
    ...(shipFrom ? { shipFrom } : {}),
  };

  const btn = document.getElementById('createLabelBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Creating…'; }

  try {
    const data = await fetchValidatedJson('/api/labels/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, parseCreateLabelResponse);

    const tracking = data.trackingNumber || '';
    showToast(
      testLabel
        ? `🧪 Test label created${tracking ? ': ' + tracking : ''}`
        : `✅ Label created${tracking ? ': ' + tracking : ''}`
    );

    console.log('[Labels] API Response:', {
      labelUrl: data.labelUrl || 'MISSING',
      trackingNumber: data.trackingNumber,
      shipmentId: data.shipmentId,
    });

    if (data.labelUrl) {
      console.log('[Labels] Opening PDF URL:', data.labelUrl);
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow || pdfWindow.closed || typeof pdfWindow.closed === 'undefined') {
        console.warn('[Labels] Popup may have been blocked. Showing manual download option.');
        showToast(`📄 Popup blocked. PDF: <a href="${data.labelUrl}" target="_blank">Click here to download label</a>`, 5000);
      } else {
        pdfWindow.location.href = data.labelUrl;
      }
    } else {
      console.error('[Labels] No labelUrl returned from server', data);
      showToast('⚠ Label created but no PDF returned — check ShipStation dashboard');
    }

    // NOTE: PRINT button does NOT auto-add to queue (spec: Workflow A)
    // Use the "Send to Queue" button in the panel for Workflow B

    // Re-render panel to show shipped state + Send to Queue button
    if (!testLabel) {
      // Clear shipped orders cache so the fresh order appears in shipped view
      if (typeof window.clearShippedOrdersCache === 'function') {
        window.clearShippedOrdersCache();
      }
      if (typeof window.fetchOrders === 'function') {
        await window.fetchOrders(state.currentPage, true);
      }
      // Re-open panel to show updated label + Send to Queue button
      if (typeof window.openPanel === 'function' && o?.orderId) {
        window.openPanel(o.orderId);
      }
    }
  } catch (e) {
    showToast('❌ ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🖨️ Create + Print Label <span class="create-label-caret">▾</span>';
    }
  }
}

// ═══════════════════════════════════════════════
//  SEND TO QUEUE (Workflow B)
//  Called by "Send to Queue" button in order panel.
//  Creates label (if missing), ships order, adds to print queue.
//  DOES NOT open the PDF in a new tab (unlike createLabel).
// ═══════════════════════════════════════════════

export async function sendToQueueFromOrder(orderId) {
  const { allOrders } = state;
  const o = allOrders.find(o => o.orderId === orderId);
  if (!o) return showToast('⚠ Order not found');

  // Gather label creation fields (same as createLabel)
  const wtLb    = parseFloat(document.getElementById('p-wtlb')?.value) || 0;
  const wtOz    = parseFloat(document.getElementById('p-wtoz')?.value) || 0;
  const totalOz = (wtLb * 16) + wtOz;
  const pid     = parseInt(document.getElementById('p-shipacct')?.value) || null;
  const service = document.getElementById('p-service')?.value || '';
  const pkgVal  = document.getElementById('p-package')?.value || '';
  const length  = parseFloat(document.getElementById('p-len')?.value) || 0;
  const width   = parseFloat(document.getElementById('p-wid')?.value) || 0;
  const height  = parseFloat(document.getElementById('p-hgt')?.value) || 0;
  const confirmationOption = document.getElementById('p-confirm')?.value || 'delivery';
  const confirm = confirmationOption === 'none' ? 'delivery' : confirmationOption;
  const locId   = parseInt(document.getElementById('p-location')?.value) || null;

  // Validate: package required
  if (!pkgVal || pkgVal === '') {
    return showToast('⚠ Select a package before creating a label');
  }

  // Validate: carrier + service required
  if (!pid)     return showToast('⚠ Select a carrier account');
  if (!service) return showToast('⚠ Select a shipping service');
  if (!totalOz) return showToast('⚠ Enter shipment weight');

  // Determine packageCode and customPackageId
  const selectedPkg = state.packagesList.find(p => String(p.packageId) === String(pkgVal));
  let packageCode     = 'package';
  let customPackageId = null;
  if (selectedPkg) {
    if (selectedPkg.source === 'ss_carrier') {
      packageCode = selectedPkg.packageCode || 'package';
    } else {
      packageCode     = 'package';
      customPackageId = selectedPkg.packageId;
    }
  } else if (pkgVal !== '__custom__') {
    packageCode = pkgVal;
  }

  // Determine ship-from location
  const shipFromLoc = locId ? state.locationsList.find(l => l.locationId === locId) : null;
  const shipFrom = shipFromLoc
    ? {
        name:       shipFromLoc.name,
        company:    shipFromLoc.company    || '',
        street1:    shipFromLoc.street1    || '',
        street2:    shipFromLoc.street2    || '',
        city:       shipFromLoc.city       || '',
        state:      shipFromLoc.state      || '',
        postalCode: shipFromLoc.postalCode || '',
        country:    shipFromLoc.country    || 'US',
        phone:      shipFromLoc.phone      || '',
      }
    : null;

  // Get carrier account code
  const acct = state.carriersList.find(c => c.shippingProviderId === pid);
  const carrierCode = acct?.code || '';
  if (!carrierCode) return showToast('⚠ Could not resolve carrier code — select a valid account');
  
  const { getOrderShipTo } = await import('./order-data.js');
  const shipTo = getOrderShipTo(o);

  const payload = {
    orderId:     o.orderId,
    orderNumber: o.orderNumber,
    carrierCode,
    serviceCode: service,
    packageCode,
    customPackageId,
    weightOz:    totalOz,
    length, width, height,
    confirmation: confirm,
    testLabel:   false,
    shippingProviderId: pid,
    shipTo: {
      name:       shipTo.name       || '',
      company:    shipTo.company    || '',
      street1:    shipTo.street1    || '',
      street2:    shipTo.street2    || '',
      city:       shipTo.city       || '',
      state:      shipTo.state      || '',
      postalCode: shipTo.postalCode || '',
      country:    shipTo.country    || 'US',
      phone:      shipTo.phone      || '',
    },
    ...(shipFrom ? { shipFrom } : {}),
  };

  const btn = document.getElementById('sendToQueueBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Creating…'; }

  try {
    // Create label
    const data = await fetchValidatedJson('/api/labels/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, parseCreateLabelResponse);

    const tracking = data.trackingNumber || '';
    const labelUrl = data.labelUrl;

    console.log('[SendToQueue] Label created:', {
      labelUrl: labelUrl || 'MISSING',
      trackingNumber: tracking,
    });

    if (!labelUrl) {
      showToast('⚠ Label created but no PDF returned — check ShipStation dashboard');
      return;
    }

    // Add to print queue (do NOT open PDF tab, unlike createLabel)
    const items = o.items || [];
    const sku = items.length === 1 ? items[0].sku : null;
    const desc = items.length === 1 ? items[0].name : null;
    const qty = items.reduce((s, i) => s + (i.quantity || 1), 0);
    const multiSkus = items.length > 1 ? items.map(i => ({ sku: i.sku, description: i.name, qty: i.quantity || 1 })) : null;
    const skuGroupId = sku ? `SKU:${sku}` : `ORDER:${o.orderId}`;
    const clientId = window._queueClientId || o.clientId || 1;

    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: String(o.orderId),
        order_number: o.orderNumber,
        client_id: clientId,
        label_url: labelUrl,
        sku_group_id: skuGroupId,
        primary_sku: sku,
        item_description: desc,
        order_qty: qty,
        multi_sku_data: multiSkus,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const queueData = await res.json();
    showToast(`✅ Label created & queued${tracking ? ': ' + tracking : ''}`);

    // Refresh queue panel
    if (typeof window.hydrateQueueFromDB === 'function') {
      await window.hydrateQueueFromDB(clientId);
    }

    // Refresh orders list
    if (typeof window.fetchOrders === 'function') {
      await window.fetchOrders(state.currentPage, true);
    }

  } catch (err) {
    showToast(`❌ ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '📥 Send to Queue'; }
  }
}

// Expose to window
window.sendToQueueFromOrder = sendToQueueFromOrder;

// ═══════════════════════════════════════════════
//  MARK SHIPPED EXTERNALLY
// ═══════════════════════════════════════════════

let _extShipMenu = null;

export function showExtShipMenu(e, orderId) {
  e.stopPropagation();
  // Remove any existing menu
  if (_extShipMenu) { _extShipMenu.remove(); _extShipMenu = null; }

  const sources = ['Amazon', 'Walmart', 'eBay', 'Etsy', 'Other'];
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:8000;background:var(--surface);border:1px solid var(--border2);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:150px;overflow:hidden;font-size:12.5px';
  menu.innerHTML = `
    <div style="padding:6px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);border-bottom:1px solid var(--border)">Shipped via…</div>
    ${sources.map(s => `<div onclick="markShippedExternal(${orderId},'${s}')" style="padding:8px 14px;cursor:pointer;color:var(--text)" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">${s}</div>`).join('')}`;

  // Position near the button
  const rect = e.target.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  document.body.appendChild(menu);
  _extShipMenu = menu;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _close() {
      if (_extShipMenu) { _extShipMenu.remove(); _extShipMenu = null; }
      document.removeEventListener('click', _close);
    });
  }, 0);
}

export async function markShippedExternal(orderId, source) {
  if (_extShipMenu) { _extShipMenu.remove(); _extShipMenu = null; }
  try {
    const res = await fetch(`/api/orders/${orderId}/shipped-external`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ flag: 1, source }),
    });
    if (!res.ok) throw new Error(await res.text());
    // Animate row out
    const row = document.getElementById(`row-${orderId}`);
    if (row) {
      row.style.transition = 'opacity .3s, transform .3s';
      row.style.opacity    = '0';
      row.style.transform  = 'translateX(20px)';
      setTimeout(() => row.remove(), 320);
    }
    showToast(`✅ Marked shipped via ${source}`);
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

export async function toggleResidential(orderId) {
  const o = state.allOrders.find(x => x.orderId === orderId);
  if (!o) return;
  // Cycle: auto → manual-residential → manual-commercial → auto
  let next;
  if (o.residential === null || o.residential == null) next = 1;
  else if (o.residential === true) next = 0;
  else next = null;
  try {
    await fetch(`/api/orders/${orderId}/residential`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ residential: next }),
    });
    // Clear cached rates for this order so they re-fetch with the new flag
    Object.keys(state.rateCache).forEach(k => delete state.rateCache[k]);
    if (typeof window.fetchOrders === 'function') await window.fetchOrders();
    if (typeof window.openPanel  === 'function') window.openPanel(orderId);
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

/**
 * Void a label and request refund from carrier.
 * ShipStation initiates automatic refund (2-7 days).
 */
export async function voidLabel() {
  const o = state.currentPanelOrder;
  if (!o) return showToast('⚠ No order selected');
  
  // Find the shipment record
  const shipmentId = o.label?.shipmentId || o.shipmentId;
  if (!shipmentId) return showToast('⚠ No label found to void');

  // Confirm action
  if (!confirm(`Void label for order ${o.orderNumber}?\n\nRefund will be requested from the carrier (${o.label?.carrierCode || 'Unknown'}).\n\nRefund timeline: 2-7 business days.`)) {
    return;
  }

  showToast('⏳ Voiding label...');

  try {
    const data = await fetchValidatedJson(`/api/labels/${shipmentId}/void`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    }, parseVoidLabelResponse);

    showToast(`✓ Label voided!\n💰 Refund initiated (${data.refundEstimate})\nOrder reset to "Awaiting Shipment" — you can create a new label.`);

    // Refresh panel to show new state
    if (typeof window.fetchOrders === 'function') await window.fetchOrders();
    if (typeof window.openPanel === 'function') window.openPanel(o.orderId);

  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

// Expose to window for inline HTML calls
export async function generateReturnLabel() {
  const o = state.currentPanelOrder;
  if (!o) return showToast('⚠ No order selected');
  
  const shipmentId = o.label?.shipmentId;
  if (!shipmentId) return showToast('⚠ No shipment found for this order');

  const btn = document.querySelector('[onclick="generateReturnLabel()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generating…'; }

  try {
    const data = await fetchValidatedJson(`/api/labels/${shipmentId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Customer Return' }),
    }, parseReturnLabelResponse);
    showToast(`✅ Return label generated: ${data.returnTrackingNumber}`);
    
    // Re-render panel to show return label info
    if (typeof window.fetchOrders === 'function') {
      await window.fetchOrders(state.currentPage || 1);
      window.openPanel(o.orderId);
    }
  } catch (e) {
    showToast('❌ ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '↩️ Return Label'; }
  }
}

/**
 * Retrieve and print (download) a label for an order that has already been shipped.
 * Fetches the cached label URL or requests a fresh one from ShipStation.
 * 
 * IMPORTANT: Opens window BEFORE fetch to preserve user gesture context
 * (prevents popup blocker from triggering).
 */
export async function reprintLabel(orderId) {
  console.log('[reprintLabel] called with orderId:', orderId);
  if (!orderId) return showToast('⚠ No order ID');
  
  // Open window IMMEDIATELY to preserve user gesture context (prevents popup blocker)
  const pdfWindow = window.open('about:blank', '_blank');
  if (!pdfWindow || pdfWindow.closed || typeof pdfWindow.closed === 'undefined') {
    console.warn('[reprintLabel] Popup was blocked immediately');
    showToast('❌ Popup blocker prevented opening new tab. Allow popups for this site.');
    return;
  }
  
  try {
    console.log('[reprintLabel] fetching label from /api/labels/' + orderId + '/retrieve');
    const data = await fetchValidatedJson(`/api/labels/${orderId}/retrieve`, undefined, parseRetrieveLabelResponse);
    console.log('[reprintLabel] got data:', data);

    console.log('[reprintLabel] navigating to PDF:', data.labelUrl);
    pdfWindow.location.href = data.labelUrl;
    showToast(`📄 Label opened for ${data.trackingNumber || 'printing'}`);
  } catch (e) {
    console.error('[reprintLabel] error:', e);
    pdfWindow.close();
    showToast('❌ ' + e.message);
  }
}

window.createLabel           = createLabel;
window.generateReturnLabel   = generateReturnLabel;
window.showExtShipMenu     = showExtShipMenu;
window.markShippedExternal = markShippedExternal;
window.toggleResidential   = toggleResidential;
window.voidLabel           = voidLabel;
window.reprintLabel        = reprintLabel;
