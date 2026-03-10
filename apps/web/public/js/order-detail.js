import { state } from './state.js';
import { escHtml, fmtDateFull, fmtDollar, fmtWeight, trunc } from './utils.js';
import { CARRIER_NAMES, SERVICE_NAMES, carrierLogo } from './constants.js';
import { getStoreName } from './stores.js';
import { fetchValidatedJson } from './api-client.js';
import { parseOrderFullResponse } from './api-contracts.js';
import {
  getOrderAdvancedOptions,
  getOrderConfirmation,
  getOrderDimensions,
  getOrderInsuranceOptions,
  getOrderPackageCode,
  getOrderRequestedService,
} from './order-data.js';

// ─── Order Detail Drawer ───────────────────────────────────────────────────────

export function closeOrderDetail() {
  document.getElementById('od-backdrop')?.classList.remove('open');
  document.getElementById('od-drawer')?.classList.remove('open');
}

export async function openOrderDetail(orderId) {
  const container = document.getElementById('od-container');
  container.innerHTML = '<div style="color:var(--text3);text-align:center;padding:60px;font-size:14px">Loading order #' + orderId + '…</div>';
  document.getElementById('od-backdrop')?.classList.add('open');
  document.getElementById('od-drawer')?.classList.add('open');

  let o;
  let shipments = [];
  let local = null;
  let shippingAccount = '';
  try {
    const payload = await fetchValidatedJson(`/api/orders/${orderId}/full`, undefined, parseOrderFullResponse);
    o = payload.raw || {};
    shipments = payload.shipments || [];
    local = payload.local || null;
    if (local && typeof local === 'object' && local.selected_pid != null) {
      const account = (state.carriersList || []).find(c => c.shippingProviderId === local.selected_pid);
      if (account) shippingAccount = account._label || account.nickname || account.accountNumber || account.name || '';
    }
  } catch(e) {
    container.innerHTML = `<div style="color:var(--red);text-align:center;padding:60px">Error loading order: ${escHtml(e.message)}</div>`;
    return;
  }

  const shipTo     = o.shipTo || {};
  const advOpts    = getOrderAdvancedOptions(o);
  const insurance  = getOrderInsuranceOptions(o);
  const dims       = getOrderDimensions(o);
  const wt         = o.weight || {};
  const items      = (o.items || []).filter(i => !i.adjustment);
  const storeName  = getStoreName(o);

  function addrLines(addr) {
    const lines = [];
    if (addr.name)       lines.push('<strong>' + escHtml(addr.name) + '</strong>');
    if (addr.company)    lines.push(escHtml(addr.company));
    if (addr.street1)    lines.push(escHtml(addr.street1));
    if (addr.street2)    lines.push(escHtml(addr.street2));
    if (addr.street3)    lines.push(escHtml(addr.street3));
    const cityLine = [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ');
    if (cityLine)        lines.push(escHtml(cityLine));
    if (addr.country && addr.country !== 'US') lines.push(escHtml(addr.country));
    return lines.join('<br>');
  }

  const addrVerified = shipTo.addressVerified;
  const addrBadge = (addrVerified === 'Address validated successfully' || addrVerified === 'Verified')
    ? `<div class="od-addr-badge od-addr-valid">✓ Address Validated</div>`
    : addrVerified
    ? `<div class="od-addr-badge od-addr-invalid">⚠ ${escHtml(addrVerified)}</div>`
    : `<div class="od-addr-badge od-addr-invalid">⚠ Not Validated</div>`;

  const productTotal = (o.orderTotal||0) - (o.shippingAmount||0) - (o.taxAmount||0);
  const costSummary = `
    <div class="od-cost-row"><span>Product Total</span><span>${fmtDollar(productTotal)}</span></div>
    <div class="od-cost-row"><span>Shipping</span><span>${fmtDollar(o.shippingAmount)}</span></div>
    <div class="od-cost-row"><span>Tax</span><span>${fmtDollar(o.taxAmount)}</span></div>
    <div class="od-cost-row total"><span>Total Paid</span><span>${fmtDollar(o.amountPaid ?? o.orderTotal)}</span></div>
  `;

  const itemsHtml = items.length ? `
    <table class="od-items-table">
      <thead><tr>
        <th>Item</th>
        <th>SKU</th>
        <th style="text-align:right">Unit</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>
        ${items.map(it => {
          const opts = (it.options||[]).map(op =>
            `<span class="od-option-chip">${escHtml(op.name||'')}: ${escHtml(op.value||'')}</span>`
          ).join('');
          const imgHtml = it.imageUrl
            ? `<img class="od-item-img" src="${escHtml(it.imageUrl)}" alt="" loading="lazy" style="cursor:zoom-in" onmouseenter="showThumbPreview(this, event)" onmouseleave="hideThumbPreview()" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            + `<div class="od-item-img-placeholder" style="display:none">📦</div>`
            : `<div class="od-item-img-placeholder">📦</div>`;
          return `<tr>
            <td>
              <div style="display:flex;align-items:flex-start;gap:10px">
                <div style="flex:0 0 auto">${imgHtml}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12.5px;font-weight:600;color:var(--text)">${escHtml(it.name||'—')}</div>
                  ${opts ? `<div style="margin-top:3px">${opts}</div>` : ''}
                </div>
              </div>
            </td>
            <td style="font-family:monospace;font-size:11.5px;color:var(--text2)">${escHtml(it.sku||'—')}</td>
            <td style="text-align:right">${fmtDollar(it.unitPrice)}</td>
            <td style="text-align:center;font-weight:700">${it.quantity||1}</td>
            <td style="text-align:right;font-weight:700">${fmtDollar((it.unitPrice||0)*(it.quantity||1))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  ` : '<div style="color:var(--text3);font-size:12px">No items found.</div>';

  const notesHtml = (o.customerNotes || o.internalNotes) ? `
    <div class="od-card">
      <div class="od-card-title">📝 Notes</div>
      ${o.customerNotes ? `
        <div class="od-field">
          <div class="od-field-label">Customer Notes</div>
          <div class="od-field-value" style="white-space:pre-wrap;font-style:italic;color:var(--text2)">${escHtml(o.customerNotes)}</div>
        </div>
      ` : ''}
      ${o.internalNotes ? `
        <div class="od-field">
          <div class="od-field-label">Internal Notes</div>
          <div class="od-field-value" style="white-space:pre-wrap;color:var(--orange)">${escHtml(o.internalNotes)}</div>
        </div>
      ` : ''}
    </div>
  ` : '';

  const histHtml = shipments.length ? `
    <div class="od-card">
      <div class="od-card-title">📬 Shipment History</div>
      <div style="overflow-x:auto">
        <table class="od-shipment-table">
          <thead><tr>
            <th>ID</th>
            <th>Date</th>
            <th>Carrier</th>
            <th>Service</th>
            <th style="text-align:right">Cost</th>
            <th>Tracking #</th>
          </tr></thead>
          <tbody>
            ${shipments.map(sh => {
              const trackHtml = sh.trackingNumber
                ? `<span class="od-tracking-link" onclick="navigator.clipboard.writeText('${escHtml(sh.trackingNumber)}').then(()=>showToast('Tracking # copied!'))" title="Click to copy">${escHtml(sh.trackingNumber)}</span>`
                : '—';
              const svcName = SERVICE_NAMES[sh.serviceCode] || (sh.serviceCode||'').replace(/_/g,' ') || '—';
              const carrName = CARRIER_NAMES[sh.carrierCode] || (sh.carrierCode||'').toUpperCase() || '—';
              return `<tr ${sh.voided ? 'style="opacity:0.5"' : ''}>
                <td style="font-family:monospace;font-size:11px">${sh.shipmentId}</td>
                <td style="font-size:11.5px;color:var(--text2)">${sh.shipDate ? fmtDateFull(sh.shipDate) : '—'}</td>
                <td style="font-size:11.5px">${escHtml(carrName)}</td>
                <td style="font-size:11px;color:var(--text2)">${escHtml(svcName)}</td>
                <td style="text-align:right;font-weight:700">${fmtDollar(sh.shipmentCost)}</td>
                <td>${trackHtml}${sh.voided ? ' <span style="font-size:9px;background:var(--red-bg);color:var(--red);padding:1px 5px;border-radius:3px;font-weight:700">VOIDED</span>' : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  const weightDisplay = wt.value ? fmtWeight(wt.value) : '—';
  const dimsDisplay = (dims.length && dims.width && dims.height)
    ? `${dims.length} × ${dims.width} × ${dims.height} ${dims.units||'inches'}`
    : '—';

  const insureHtml = insurance.insureShipment
    ? `<span class="od-status-badge od-status-awaiting">Insured — ${fmtDollar(insurance.insuredValue)}</span>`
    : `<span style="color:var(--text3);font-size:12px">None</span>`;

  const warehouseId = advOpts.warehouseId;
  const warehouseName = warehouseId === 226617 || warehouseId === '226617' ? 'Warehouse GWH'
    : (state.locationsList||[]).find(l => l.locationId === warehouseId)?.name || ('WH #' + warehouseId);

  const customFields = [
    advOpts.customField1 ? `<div class="od-field"><div class="od-field-label">Custom Field 1</div><div class="od-field-value">${escHtml(advOpts.customField1)}</div></div>` : '',
    advOpts.customField2 ? `<div class="od-field"><div class="od-field-label">Custom Field 2</div><div class="od-field-value">${escHtml(advOpts.customField2)}</div></div>` : '',
    advOpts.customField3 ? `<div class="od-field"><div class="od-field-label">Custom Field 3</div><div class="od-field-value">${escHtml(advOpts.customField3)}</div></div>` : '',
  ].join('');

  const giftHtml = o.gift ? `
    <div class="od-gift-badge">🎁 Gift Order</div>
    ${o.giftMessage ? `<div class="od-field"><div class="od-field-label">Gift Message</div><div class="od-field-value" style="font-style:italic">${escHtml(o.giftMessage)}</div></div>` : ''}
  ` : '';

  function odStatusBadge(status) {
    const cls = status === 'awaiting_shipment' ? 'od-status-awaiting'
              : status === 'shipped'           ? 'od-status-shipped'
              : status === 'cancelled'         ? 'od-status-cancelled'
              :                                  'od-status-on_hold';
    const label = (status||'unknown').replace(/_/g,' ');
    return `<span class="od-status-badge ${cls}">${escHtml(label)}</span>`;
  }

  function odCheckbox(val, label) {
    const on = val ? 'od-check-on' : '';
    return `<div class="od-check-row"><span class="od-check-box ${on}">${val?'✓':''}</span>${escHtml(label)}</div>`;
  }

  const isAwaiting = o.orderStatus === 'awaiting_shipment';
  const actionsHtml = isAwaiting ? `
    <div class="od-card od-actions-card">
      <div class="od-card-title">⚡ Actions</div>
      <a class="btn btn-outline" href="https://ship.shipstation.com/orders/${o.orderId}" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;margin-bottom:8px">
        ↗ Open in ShipStation
      </a>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="showExtShipMenu(event,${o.orderId})">✈ Mark as Shipped</button>
    </div>
  ` : '';

  const datesHtml = `
    <div class="od-two-col" style="margin-top:12px">
      <div class="od-field"><div class="od-field-label">Order Date</div><div class="od-field-value">${fmtDateFull(o.orderDate)}</div></div>
      <div class="od-field"><div class="od-field-label">Date Paid</div><div class="od-field-value">${fmtDateFull(o.paymentDate)}</div></div>
      ${o.shipByDate ? `<div class="od-field"><div class="od-field-label">Ship By</div><div class="od-field-value" style="color:var(--yellow);font-weight:600">${fmtDateFull(o.shipByDate)}</div></div>` : ''}
      ${o.deliverByDate ? `<div class="od-field"><div class="od-field-label">Deliver By</div><div class="od-field-value">${fmtDateFull(o.deliverByDate)}</div></div>` : ''}
      ${o.holdUntilDate ? `<div class="od-field"><div class="od-field-label">Hold Until</div><div class="od-field-value" style="color:var(--red)">${fmtDateFull(o.holdUntilDate)}</div></div>` : ''}
    </div>
  `;

  container.innerHTML = `
    <!-- Header -->
    <div class="od-header">
      <button class="od-back-btn" onclick="closeOrderDetail()" title="Close">✕</button>
      <span class="od-order-num">#${escHtml(o.orderNumber||orderId+'')}</span>
      ${odStatusBadge(o.orderStatus)}
      <span class="od-store-name">${escHtml(storeName)}</span>
    </div>

    <div class="od-layout">
      <!-- LEFT COLUMN -->
      <div class="od-left">

        <!-- Shipment Details -->
        <div class="od-card">
          <div class="od-card-title">📦 Shipment Details</div>
          <div class="od-two-col">
            <div>
              <div class="od-field-label">Ship To</div>
              <div class="od-address" style="margin-bottom:6px">${addrLines(shipTo)}</div>
              ${addrBadge}
              ${shipTo.phone ? `<div class="od-field" style="margin-top:4px"><div class="od-field-label">Phone</div><div class="od-field-value">${escHtml(shipTo.phone)}</div></div>` : ''}
              ${o.customerEmail ? `<div class="od-field"><div class="od-field-label">Email</div><div class="od-field-value" style="word-break:break-all">${escHtml(o.customerEmail)}</div></div>` : ''}
              ${giftHtml}
            </div>
            <div>
              <div class="od-field-label" style="margin-bottom:8px">Cost Summary</div>
              ${costSummary}
            </div>
          </div>
          ${datesHtml}
        </div>

        <!-- Items -->
        <div class="od-card">
          <div class="od-card-title">🛒 Items (${items.length})</div>
          ${itemsHtml}
        </div>

        ${notesHtml}
        ${histHtml}

      </div>

      <!-- RIGHT COLUMN -->
      <div class="od-right">

        <!-- Configure Shipment -->
        <div class="od-card">
          <div class="od-card-title">🚚 Configure Shipment</div>
          <div class="od-field"><div class="od-field-label">Status</div><div class="od-field-value">${odStatusBadge(o.orderStatus)}</div></div>
          ${shipments.length ? (() => {
            const ls = shipments.find(s => !s.voided) || shipments[0];
            const cc = CARRIER_NAMES[ls.carrierCode] || (ls.carrierCode||'').toUpperCase();
            const sc = SERVICE_NAMES[ls.serviceCode] || (ls.serviceCode||'').replace(/_/g,' ');
            const cost = (ls.shipmentCost||0) + (ls.otherCost||0);
            const sourceLabels = { prepship: 'Prepship', shipstation: 'ShipStation', external: 'External' };
            const sourceLabel = sourceLabels[ls.source] || ls.source || '—';
            return `<div class="od-field"><div class="od-field-label">Shipped Carrier</div><div class="od-field-value" style="font-weight:700">${escHtml(cc)||'—'}</div></div>
              <div class="od-field"><div class="od-field-label">Shipped Service</div><div class="od-field-value" style="font-weight:700">${escHtml(sc)||'—'}</div></div>
              <div class="od-field"><div class="od-field-label">Label Cost</div><div class="od-field-value" style="font-weight:700;color:var(--green-dark);font-size:15px">${cost > 0 ? '$'+cost.toFixed(2) : 'N/A'}</div></div>
              ${ls.trackingNumber ? `<div class="od-field"><div class="od-field-label">Tracking #</div><div class="od-field-value"><span class="od-tracking-link" onclick="navigator.clipboard.writeText('${escHtml(ls.trackingNumber)}').then(()=>showToast('Tracking # copied!'))" title="Click to copy">${escHtml(ls.trackingNumber)}</span></div></div>` : ''}
              ${ls.shipDate ? `<div class="od-field"><div class="od-field-label">Ship Date</div><div class="od-field-value">${fmtDateFull(ls.shipDate)}</div></div>` : ''}
              <div class="od-field"><div class="od-field-label">Purchased on</div><div class="od-field-value">${escHtml(sourceLabel)}</div></div>
              ${shippingAccount ? `<div class="od-field"><div class="od-field-label">Shipping Account</div><div class="od-field-value">${escHtml(shippingAccount)}</div></div>` : ''}
              <div style="border-bottom:1px solid var(--border);margin:8px 0"></div>`;
          })() : ''}
          <div class="od-field"><div class="od-field-label">Requested Service</div><div class="od-field-value">${escHtml(getOrderRequestedService(o)||'—')}</div></div>
          <div class="od-field"><div class="od-field-label">Ship From</div><div class="od-field-value">${escHtml(warehouseName)}</div></div>
          <div class="od-field"><div class="od-field-label">Weight</div><div class="od-field-value">${weightDisplay}</div></div>
          <div class="od-field"><div class="od-field-label">Dimensions</div><div class="od-field-value">${escHtml(dimsDisplay)}</div></div>
          <div class="od-field"><div class="od-field-label">Package</div><div class="od-field-value">${escHtml(getOrderPackageCode(o)||'—')}</div></div>
          <div class="od-field"><div class="od-field-label">Confirmation</div><div class="od-field-value">${escHtml(getOrderConfirmation(o)||'—')}</div></div>
          <div class="od-field"><div class="od-field-label">Insurance</div><div class="od-field-value">${insureHtml}</div></div>
        </div>

        <!-- Other Options -->
        <div class="od-card">
          <div class="od-card-title">⚙ Other Shipping Options</div>
          <div class="od-field"><div class="od-field-label">Source</div><div class="od-field-value">${escHtml(advOpts.source||'—')}</div></div>
          ${advOpts.billToAccount ? `<div class="od-field"><div class="od-field-label">Shipping Account</div><div class="od-field-value">${escHtml(advOpts.billToAccount)}</div></div>` : ''}
          <div style="margin-top:8px">
            ${odCheckbox(advOpts.nonMachinable, 'Non-machinable')}
            ${odCheckbox(advOpts.saturdayDelivery, 'Saturday Delivery')}
            ${odCheckbox(advOpts.containsAlcohol, 'Contains Alcohol')}
          </div>
          ${customFields}
        </div>

        ${actionsHtml}

      </div>
    </div>
  `;
}

// ─── Window exports ────────────────────────────────────────────────────────────
window.openOrderDetail  = openOrderDetail;
window.closeOrderDetail = closeOrderDetail;
