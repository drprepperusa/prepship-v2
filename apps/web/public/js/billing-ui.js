import { state } from './state.js';
import { escHtml, showToast, fmtDate } from './utils.js';

export function setBillingPreset(btn, preset) {
  document.querySelectorAll('#view-billing .analysis-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const today = new Date();
  let from, to;
  if (preset === 'this_month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    to   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (preset === 'last_month') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to   = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (preset === 'last_30') {
    to   = new Date(today); from = new Date(today); from.setDate(from.getDate() - 30);
  } else {
    to   = new Date(today); from = new Date(today); from.setDate(from.getDate() - 90);
  }
  const fmt = d => d.toISOString().slice(0, 10);
  document.getElementById('billing-from').value = fmt(from);
  document.getElementById('billing-to').value   = fmt(to);
  loadBillingSummary();
}

export async function initBillingView() {
  if (!document.getElementById('billing-from').value) {
    const today = new Date();
    const from  = new Date(today); from.setDate(from.getDate() - 90);
    const fmt   = d => d.toISOString().slice(0, 10);
    document.getElementById('billing-from').value = fmt(from);
    document.getElementById('billing-to').value   = fmt(today);
  }
  await loadBillingConfigs();
  await loadBillingSummary();
}

export async function loadBillingConfigs() {
  try {
    const data  = await fetch('/api/billing/config').then(r => r.json());
    const tbody = document.getElementById('billing-config-tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text3)">No clients found.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(c => {
      const isRefRate = (c.billing_mode || 'label_cost') === 'reference_rate';
      return `
      <tr>
        <td style="padding:4px 8px;font-weight:600;font-size:11.5px">${escHtml(c.clientName)}</td>
        <td style="padding:4px 8px;text-align:right">
          <input type="number" step="0.01" min="0" id="bc-pick-${c.clientId}" value="${c.pickPackFee.toFixed(2)}" class="markup-input-lg" style="width:60px;text-align:right;font-size:11.5px">
        </td>
        <td style="padding:4px 8px;text-align:right">
          <input type="number" step="0.01" min="0" id="bc-pack-${c.clientId}" value="${c.additionalUnitFee.toFixed(2)}" class="markup-input-lg" style="width:60px;text-align:right;font-size:11.5px">
        </td>
        <td style="padding:4px 8px;text-align:right">
          <input type="number" step="0.1" min="0" id="bc-smpct-${c.clientId}" value="${c.shippingMarkupPct.toFixed(1)}" class="markup-input-lg" style="width:55px;text-align:right;font-size:11.5px">
        </td>
        <td style="padding:4px 8px;text-align:right">
          <input type="number" step="0.01" min="0" id="bc-smflat-${c.clientId}" value="${c.shippingMarkupFlat.toFixed(2)}" class="markup-input-lg" style="width:60px;text-align:right;font-size:11.5px">
        </td>
        <td style="padding:4px 8px;text-align:right">
          <input type="number" step="0.001" min="0" id="bc-storage-${c.clientId}" value="${(c.storageFeePerCuFt || 0).toFixed(3)}" class="markup-input-lg" style="width:64px;text-align:right;font-size:11.5px" title="Storage fee per cubic foot per month (0 = disabled)">
        </td>
        <td style="padding:4px 8px;text-align:center">
          <select id="bc-mode-${c.clientId}" class="ship-select" style="font-size:10px;padding:2px 4px;border-radius:4px;border:1px solid var(--border)">
            <option value="label_cost"    ${!isRefRate ? 'selected' : ''}>Label Cost</option>
            <option value="reference_rate" ${isRefRate ? 'selected' : ''}>SS Ref Rate ★</option>
          </select>
        </td>
        <td style="padding:4px 4px;text-align:center">
          <button class="btn btn-outline btn-xs" onclick="saveBillingConfig(${c.clientId})">Save</button>
        </td>
      </tr>
    `}).join('');
    loadPkgPriceMatrix(data);
  } catch (e) {
    showToast('Failed to load billing config');
  }
}

export async function saveBillingConfig(clientId) {
  const get = id => parseFloat(document.getElementById(id)?.value || 0);
  const payload = {
    pickPackFee:        get(`bc-pick-${clientId}`),
    additionalUnitFee:  get(`bc-pack-${clientId}`),
    packageCostMarkup:  0,
    shippingMarkupPct:  get(`bc-smpct-${clientId}`),
    shippingMarkupFlat: get(`bc-smflat-${clientId}`),
    billing_mode:       document.getElementById(`bc-mode-${clientId}`)?.value || 'label_cost',
    storageFeePerCuFt:  get(`bc-storage-${clientId}`),
  };
  try {
    const r = await fetch(`/api/billing/config/${clientId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.ok) showToast('✅ Config saved');
    else showToast('Error: ' + (data.error || 'unknown'));
  } catch { showToast('Failed to save config'); }
}

export async function generateBilling() {
  const from = document.getElementById('billing-from').value;
  const to   = document.getElementById('billing-to').value;
  if (!from || !to) return showToast('Select a date range first');
  const btn    = document.getElementById('billing-generate-btn');
  const status = document.getElementById('billing-generate-status');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  status.textContent = '';
  try {
    const r = await fetch('/api/billing/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    const data = await r.json();
    if (data.ok) {
      status.textContent = `Generated ${data.generated} line items · $${data.total.toFixed(2)} total`;
      showToast(`✅ Generated ${data.generated} billing line items`);
      await loadBillingSummary();
    } else showToast('Error: ' + (data.error || 'unknown'));
  } catch { showToast('Failed to generate billing'); }
  finally { btn.disabled = false; btn.textContent = '⚡ Generate Invoices'; }
}

export async function loadBillingSummary() {
  const from = document.getElementById('billing-from').value;
  const to   = document.getElementById('billing-to').value;
  if (!from || !to) return;
  const tbody = document.getElementById('billing-summary-tbody');
  tbody.innerHTML = '<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--text3)">Loading…</td></tr>';
  try {
    const data = await fetch(`/api/billing/summary?from=${from}&to=${to}`).then(r => r.json());
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text3)">No billing data. Generate invoices first.</td></tr>';
      return;
    }
    const totals = data.reduce((t, r) => ({
      orders:     t.orders     + (r.orderCount    ||0),
      pickPack:   t.pickPack   + (r.pickPackTotal  ||0),
      additional: t.additional + (r.additionalTotal||0),
      package:    t.package    + (r.packageTotal   ||0),
      storage:    t.storage    + (r.storageTotal   ||0),
      shipping:   t.shipping   + (r.shippingTotal  ||0),
      grand:      t.grand      + (r.grandTotal     ||0),
    }), { orders: 0, pickPack: 0, additional: 0, package: 0, storage: 0, shipping: 0, grand: 0 });
    tbody.innerHTML = data.map(r => `
      <tr style="cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"
          onclick="loadBillingDetails(${r.clientId}, '${escHtml(r.clientName)}')">
        <td style="padding:8px 10px;font-weight:600;color:var(--ss-blue)">
          ${escHtml(r.clientName)}
          <button class="btn btn-ghost btn-xs" title="Export invoice as PDF"
            style="margin-left:6px;font-size:10px;padding:1px 6px;opacity:.7"
            onclick="event.stopPropagation();exportBillingInvoice(${r.clientId},'${escHtml(r.clientName)}')">📄 Export</button>
        </td>
        <td style="padding:8px 10px;text-align:right;color:var(--text2)">${r.orderCount||0}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text2)">$${(r.pickPackTotal||0).toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text2)">$${(r.additionalTotal||0).toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text2)">${(r.packageTotal||0) > 0 ? '$'+(r.packageTotal||0).toFixed(2) : '<span style="color:var(--text4)">—</span>'}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text2)">${(r.storageTotal||0) > 0 ? '$'+(r.storageTotal||0).toFixed(2) : '<span style="color:var(--text4)">—</span>'}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text2)">$${(r.shippingTotal||0).toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--green)">$${(r.grandTotal||0).toFixed(2)}</td>
      </tr>
    `).join('') + `
      <tr style="border-top:2px solid var(--border);background:var(--surface2)">
        <td style="padding:8px 10px;font-weight:700">Total</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">${totals.orders}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">$${totals.pickPack.toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">$${totals.additional.toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">${totals.package > 0 ? '$'+totals.package.toFixed(2) : '—'}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">${totals.storage > 0 ? '$'+totals.storage.toFixed(2) : '—'}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">$${totals.shipping.toFixed(2)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:800;color:var(--green);font-size:13px">$${totals.grand.toFixed(2)}</td>
      </tr>`;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--red)">Error loading summary</td></tr>';
  }
}

// ─── Billing detail column definitions ──────────────────────────────────────
const DETAIL_COLS = [
  { id:'orderNumber', label:'Order #',    align:'left',   always:true  },
  { id:'shipDate',    label:'Ship Date',  align:'left',   always:false },
  { id:'itemNames',   label:'Item Name',  align:'left',   always:false },
  { id:'itemSkus',    label:'SKU',        align:'left',   always:false },
  { id:'totalQty',    label:'Qty',        align:'right',  always:false },
  { id:'pickpack',    label:'Pick & Pack',align:'right',  always:false },
  { id:'additional',  label:'Addl Units', align:'right',  always:false },
  { id:'packageCost', label:'Box Cost',   align:'right',  always:false },
  { id:'packageName', label:'Box Size',   align:'center', always:false },
  { id:'bestRate',    label:'Best Rate',  align:'right',  always:false },
  { id:'upsss',       label:'UPS SS',     align:'right',  always:false },
  { id:'uspsss',      label:'USPS SS',    align:'right',  always:false },
  { id:'shipping',    label:'Shipping',   align:'right',  always:false },
  { id:'total',       label:'Total',      align:'right',  always:true  },
  { id:'margin',      label:'Shipping Margin', align:'right', always:false },
];
const DETAIL_COLS_KEY = 'billing_detail_cols_v1';
const DETAIL_COLS_DEFAULT = new Set(['orderNumber','shipDate','itemNames','itemSkus','totalQty','pickpack','additional','shipping','total']);

function getDetailColVis() {
  try {
    const saved = JSON.parse(localStorage.getItem(DETAIL_COLS_KEY) || 'null');
    return saved ? new Set(saved) : new Set(DETAIL_COLS_DEFAULT);
  } catch { return new Set(DETAIL_COLS_DEFAULT); }
}
function saveDetailColVis(vis) {
  localStorage.setItem(DETAIL_COLS_KEY, JSON.stringify([...vis]));
}

let _detailOrders = [];   // cache last loaded orders for re-render on toggle

function renderDetailColToggles(vis) {
  const bar = document.getElementById('billing-detail-cols');
  if (!bar) return;
  bar.innerHTML = DETAIL_COLS.filter(c => !c.always).map(c => {
    const on = vis.has(c.id);
    return `<button onclick="toggleDetailCol('${c.id}')" style="
      padding:2px 8px;font-size:10px;border-radius:10px;cursor:pointer;border:1px solid var(--border);
      background:${on ? 'var(--ss-blue)' : 'var(--surface2)'};
      color:${on ? '#fff' : 'var(--text2)'};font-weight:600">${c.label}</button>`;
  }).join('');
}

function renderDetailTable(orders, vis) {
  const thead = document.getElementById('billing-detail-thead');
  const tbody = document.getElementById('billing-detail-tbody');
  if (!thead || !tbody) return;

  const visibleCols = DETAIL_COLS.filter(c => vis.has(c.id) || c.always);
  const N = visibleCols.length;
  const TH = `font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;padding:6px 10px;background:var(--surface2);border-bottom:2px solid var(--border)`;

  thead.innerHTML = `<tr>${visibleCols.map(c =>
    `<th style="${TH};text-align:${c.align}">${c.label}</th>`
  ).join('')}</tr>`;

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="${N}" style="padding:20px;text-align:center;color:var(--text3)">No line items found.</td></tr>`;
    return;
  }

  const dash = `<span style="color:var(--text4)">—</span>`;
  const fmt  = v => v != null && v > 0 ? `$${(+v).toFixed(2)}` : dash;

  let tPP = 0, tAdd = 0, tPkg = 0, tShip = 0, tGrand = 0;

  const cellFor = (colId, o) => {
    const pp    = o.pickpackTotal   || 0;
    const add   = o.additionalTotal || 0;
    const pkg   = o.packageTotal    || 0;
    const ship  = o.shippingTotal   || 0;
    const total = pp + add + pkg + ship;
    const ssCharged = ship > 0 && o.actualLabelCost != null && ship > (o.actualLabelCost + 0.01);
    
    // Calculate shipping margin: customer billed rate - our actual cost
    const ourCost = o.actualLabelCost || 0;
    const margin = ship - ourCost;
    
    // Determine which rate was actually charged (with $0.01 tolerance)
    const chargedRate = ship > 0 ? (() => {
      const tol = 0.01;
      if (o.actualLabelCost != null && Math.abs(ship - o.actualLabelCost) <= tol) return 'bestRate';
      if (o.ref_ups_rate != null && Math.abs(ship - o.ref_ups_rate) <= tol) return 'upsss';
      if (o.ref_usps_rate != null && Math.abs(ship - o.ref_usps_rate) <= tol) return 'uspsss';
      return null;
    })() : null;
    
    switch (colId) {
      case 'orderNumber': return `<td style="padding:5px 10px;font-weight:600;color:var(--ss-blue);cursor:pointer" onclick="openOrderDetail(${o.orderId})" title="Open order detail">${escHtml(o.orderNumber)}</td>`;
      case 'shipDate':    return `<td style="padding:5px 10px;color:var(--text2);font-size:11px">${o.shipDate ? fmtDate(o.shipDate) : '—'}</td>`;
      case 'itemNames':   return `<td style="padding:5px 10px;font-size:11px;max-width:220px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(o.itemNames||'')}">
        ${o.itemNames ? o.itemNames.split(' | ').map(n=>`<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(n)}</div>`).join('') : dash}</div></td>`;
      case 'itemSkus':    return `<td style="padding:5px 10px;font-family:monospace;font-size:10.5px;color:var(--text2)">
        ${o.itemSkus ? o.itemSkus.split(' | ').map(s=>s?`<div>${escHtml(s)}</div>`:dash).join('') : dash}</td>`;
      case 'totalQty':    return `<td style="padding:5px 10px;text-align:right">${o.totalQty||0}</td>`;
      case 'pickpack':    return `<td style="padding:5px 10px;text-align:right">$${pp.toFixed(2)}</td>`;
      case 'additional':  return `<td style="padding:5px 10px;text-align:right">${add>0?'$'+add.toFixed(2):dash}</td>`;
      case 'packageCost': return `<td style="padding:5px 10px;text-align:right">${pkg>0?'$'+pkg.toFixed(2):dash}</td>`;
      case 'packageName': return `<td style="padding:5px 10px;text-align:center;font-size:10.5px;color:var(--text2)">${o.packageName?escHtml(o.packageName):dash}</td>`;
      case 'bestRate':    return `<td style="padding:5px 10px;text-align:right;font-size:11px;${chargedRate==='bestRate'?'border:2px solid var(--ss-blue);border-radius:4px;':''}">${fmt(o.actualLabelCost)}</td>`;
      case 'upsss':       return `<td style="padding:5px 10px;text-align:right;font-size:11px;color:${o.ref_ups_rate?'#2563eb':'inherit'};${chargedRate==='upsss'?'border:2px solid var(--ss-blue);border-radius:4px;':''}">${fmt(o.ref_ups_rate)}</td>`;
      case 'uspsss':      return `<td style="padding:5px 10px;text-align:right;font-size:11px;color:${o.ref_usps_rate?'#16a34a':'inherit'};${chargedRate==='uspsss'?'border:2px solid var(--ss-blue);border-radius:4px;':''}">${fmt(o.ref_usps_rate)}</td>`;
      case 'shipping':    return `<td style="padding:5px 10px;text-align:right">${ssCharged
        ? `<span style="color:#b45309;font-weight:600">$${ship.toFixed(2)}</span><span style="font-size:9px;color:var(--text3);margin-left:3px">↑SS</span>`
        : `$${ship.toFixed(2)}`}</td>`;
      case 'total':       return `<td style="padding:5px 10px;text-align:right;font-weight:700;color:var(--green)">$${total.toFixed(2)}</td>`;
      case 'margin':      return `<td style="padding:5px 10px;text-align:right;font-size:11px;color:${margin > 0 ? 'var(--green)' : margin < 0 ? 'var(--red)' : 'var(--text3)'};font-weight:600">${margin > 0 ? '+' : ''}$${margin.toFixed(2)}</td>`;
      default: return `<td></td>`;
    }
  };

  let tMargin = 0;
  tbody.innerHTML = orders.map(o => {
    const pp = o.pickpackTotal||0, add = o.additionalTotal||0, pkg = o.packageTotal||0, ship = o.shippingTotal||0;
    tPP += pp; tAdd += add; tPkg += pkg; tShip += ship; tGrand += pp+add+pkg+ship;
    const ourCost = o.actualLabelCost || 0;
    const margin = ship - ourCost;
    tMargin += margin;
    const ssCharged = ship > 0 && o.actualLabelCost != null && ship > (o.actualLabelCost + 0.01);
    return `<tr style="border-bottom:1px solid var(--border);${ssCharged?'background:rgba(234,179,8,.06)':''}">
      ${visibleCols.map(c => cellFor(c.id, o)).join('')}
    </tr>`;
  }).join('') + (() => {
    const footCells = visibleCols.map(c => {
      if (c.id === 'orderNumber') return `<td style="padding:6px 10px;font-weight:700">Total</td>`;
      if (c.id === 'pickpack')    return `<td style="padding:6px 10px;text-align:right;font-weight:700">$${tPP.toFixed(2)}</td>`;
      if (c.id === 'additional')  return `<td style="padding:6px 10px;text-align:right;font-weight:700">${tAdd>0?'$'+tAdd.toFixed(2):'—'}</td>`;
      if (c.id === 'packageCost') return `<td style="padding:6px 10px;text-align:right;font-weight:700">${tPkg>0?'$'+tPkg.toFixed(2):'—'}</td>`;
      if (c.id === 'shipping')    return `<td style="padding:6px 10px;text-align:right;font-weight:700">$${tShip.toFixed(2)}</td>`;
      if (c.id === 'total')       return `<td style="padding:6px 10px;text-align:right;font-weight:800;color:var(--green)">$${tGrand.toFixed(2)}</td>`;
      if (c.id === 'margin')      return `<td style="padding:6px 10px;text-align:right;font-weight:700;color:${tMargin > 0 ? 'var(--green)' : 'var(--red)'}">$${tMargin.toFixed(2)}</td>`;
      return `<td></td>`;
    }).join('');
    return `<tr style="border-top:2px solid var(--border);background:var(--surface2)">${footCells}</tr>`;
  })();
}

export function toggleDetailCol(colId) {
  const vis = getDetailColVis();
  if (vis.has(colId)) vis.delete(colId); else vis.add(colId);
  saveDetailColVis(vis);
  renderDetailColToggles(vis);
  renderDetailTable(_detailOrders, vis);
}

export async function loadBillingDetails(clientId, clientName) {
  const from  = document.getElementById('billing-from').value;
  const to    = document.getElementById('billing-to').value;
  const wrap  = document.getElementById('billing-detail-wrap');
  const title = document.getElementById('billing-detail-title');
  const tbody = document.getElementById('billing-detail-tbody');
  title.textContent = `Line Items — ${clientName}`;
  tbody.innerHTML   = `<tr><td colspan="14" style="padding:20px;text-align:center;color:var(--text3)">Loading…</td></tr>`;
  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const vis = getDetailColVis();
  renderDetailColToggles(vis);

  try {
    _detailOrders = await fetch(`/api/billing/details?from=${from}&to=${to}&clientId=${clientId}`).then(r => r.json());
    renderDetailTable(_detailOrders, vis);
  } catch {
    tbody.innerHTML = `<tr><td colspan="14" style="padding:20px;text-align:center;color:var(--red)">Error loading details</td></tr>`;
  }
}

export async function loadPkgPriceMatrix(clients) {
  state._pkgMatrixClients = clients;
  const sel = document.getElementById('pkg-price-client-sel');
  if (!sel) return;
  // Ensure packages are loaded (billing view may be opened without visiting Packages tab)
  if (!state.packagesList?.length) {
    try {
      const pkgs = await fetch('/api/packages').then(r => r.json());
      if (Array.isArray(pkgs)) state.packagesList = pkgs;
    } catch {}
  }

  // Populate client dropdown
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Select client…</option>' +
    clients.map(c => `<option value="${c.clientId}">${escHtml(c.clientName)}</option>`).join('');
  // Restore selection or pick first client
  if (currentVal && clients.find(c => String(c.clientId) === currentVal)) {
    sel.value = currentVal;
  } else if (clients.length) {
    sel.value = String(clients[0].clientId);
  }
  if (sel.value) await renderPkgPriceForClient(sel.value);
}

export async function renderPkgPriceForClient(clientId) {
  const wrap = document.getElementById('pkg-price-table-wrap');
  if (!wrap || !clientId) return;
  const pkgs = state.packagesList.filter(p => p.source === 'custom');
  if (!pkgs.length) {
    wrap.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">No custom packages found</div>';
    return;
  }
  wrap.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px">Loading…</div>';
  let saved = {};  // packageId → { price, is_custom }
  try {
    const rows = await fetch('/api/billing/package-prices?clientId=' + clientId).then(r => r.json());
    rows.forEach(s => { saved[s.packageId] = { price: s.price, is_custom: s.is_custom }; });
  } catch {}

  const thS = 'padding:5px 8px;font-size:9.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;white-space:nowrap';
  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:var(--surface2);border-bottom:2px solid var(--border)">
          <th style="${thS};text-align:left">Box</th>
          <th style="${thS};text-align:center">Dims</th>
          <th style="${thS};text-align:right">Our Cost</th>
          <th style="${thS};text-align:right">Charge</th>
          <th style="${thS};text-align:right">Margin</th>
        </tr>
      </thead>
      <tbody>
        ${pkgs.map(p => {
          const dims      = (p.length && p.width && p.height) ? `${p.length}×${p.width}×${p.height}"` : '—';
          const ourCost   = p.unitCost != null ? parseFloat(p.unitCost) : null;
          const savedRow  = saved[p.packageId];
          const charge    = savedRow ? savedRow.price : 0;
          const isCustom  = savedRow ? !!savedRow.is_custom : false;
          const marginHtml = ourCost != null && charge > 0
            ? (() => {
                const m = ((charge - ourCost) / charge * 100).toFixed(0);
                const color = m >= 30 ? 'var(--green)' : m >= 0 ? 'var(--yellow,#f59e0b)' : 'var(--red)';
                return `<span style="color:${color};font-weight:700">${m}%</span>`;
              })()
            : `<span style="color:var(--text4)">—</span>`;
          const costHtml = ourCost != null
            ? `<span style="color:var(--text2)">$${ourCost.toFixed(3)}</span>`
            : `<span style="color:var(--text4);font-size:10.5px">not set</span>`;
          const customBadge = isCustom
            ? `<span title="Custom override — won't be changed by Set Default" style="font-size:9px;color:var(--ss-blue);margin-left:4px;font-weight:600;letter-spacing:.3px">CUSTOM</span>`
            : ``;
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:5px 8px;font-weight:600;font-size:12px">${escHtml(p.name)}${customBadge}</td>
            <td style="padding:5px 8px;text-align:center;font-size:11px;color:var(--text3)">${dims}</td>
            <td style="padding:5px 8px;text-align:right;font-size:11.5px">${costHtml}</td>
            <td style="padding:5px 4px;text-align:right">
              <input type="number" step="0.01" min="0" id="cpp-${clientId}-${p.packageId}" value="${charge.toFixed(2)}"
                class="markup-input-lg" style="width:62px;text-align:right;font-size:12px"
                oninput="updatePkgMarginRow(${clientId},${p.packageId},${ourCost ?? 'null'})">
            </td>
            <td style="padding:5px 8px;text-align:right" id="cpp-margin-${clientId}-${p.packageId}">${marginHtml}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

export function updatePkgMarginRow(clientId, packageId, ourCost) {
  const input  = document.getElementById(`cpp-${clientId}-${packageId}`);
  const cell   = document.getElementById(`cpp-margin-${clientId}-${packageId}`);
  if (!input || !cell) return;
  const charge = parseFloat(input.value) || 0;
  if (ourCost == null || charge === 0) { cell.innerHTML = `<span style="color:var(--text4)">—</span>`; return; }
  const m     = ((charge - ourCost) / charge * 100).toFixed(0);
  const color = m >= 30 ? 'var(--green)' : m >= 0 ? 'var(--yellow,#f59e0b)' : 'var(--red)';
  cell.innerHTML = `<span style="color:${color};font-weight:700">${m}%</span>`;
}

export async function savePkgPriceForClient() {
  const sel      = document.getElementById('pkg-price-client-sel');
  const clientId = sel?.value;
  if (!clientId) return showToast('Select a client first');
  const pkgs   = state.packagesList.filter(p => p.source === 'custom');
  const prices = pkgs.map(p => ({
    packageId: p.packageId,
    price: parseFloat(document.getElementById(`cpp-${clientId}-${p.packageId}`)?.value) || 0,
  }));
  try {
    const r = await fetch('/api/billing/package-prices', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, prices }),
    });
    if ((await r.json()).ok) showToast('Package prices saved ✓');
    else showToast('Error saving prices');
  } catch { showToast('Error saving prices'); }
}

export async function fetchRefRates() {
  const btn    = document.getElementById('billing-fetch-ref-btn');
  const status = document.getElementById('billing-fetch-ref-status');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Starting…';
  try {
    const r = await fetch('/api/billing/fetch-ref-rates', { method: 'POST' }).then(r => r.json());
    if (!r.ok && r.message?.includes('Already running')) {
      if (status) status.textContent = 'Already running — checking status…';
    } else if (r.total === 0) {
      if (status) status.textContent = 'All orders already have ref rates.';
      if (btn) btn.disabled = false;
      return;
    } else {
      if (status) status.textContent = `Fetching rates for ${r.orders} orders (${r.queued} unique combos)…`;
    }
    // Poll status every 5s until done
    const poll = setInterval(async () => {
      const s = await fetch('/api/billing/fetch-ref-rates/status').then(r => r.json());
      if (status) status.textContent = `Progress: ${s.done}/${s.total}${s.errors ? ` (${s.errors} errors)` : ''}`;
      if (!s.running) {
        clearInterval(poll);
        if (status) status.textContent = `✓ Done — ${s.done} combos fetched${s.errors ? `, ${s.errors} errors` : ''}`;
        if (btn) btn.disabled = false;
        showToast(`Ref rates fetched: ${s.done} rate combos`);
      }
    }, 5000);
  } catch (e) {
    if (status) status.textContent = 'Error — check console';
    if (btn) btn.disabled = false;
    showToast('Failed to start ref rate fetch');
  }
}

export async function backfillRefRates() {
  const btn  = document.getElementById('billing-backfill-btn');
  const from = document.getElementById('billing-from').value;
  const to   = document.getElementById('billing-to').value;
  if (btn) { btn.disabled = true; btn.textContent = '↺ Backfilling…'; }
  try {
    const res = await fetch('/api/billing/backfill-ref-rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    const d = await res.json();
    if (d.message) {
      showToast(d.message);
    } else {
      showToast(`Backfill done — ${d.filled} orders filled, ${d.missing} missing from cache`);
    }
  } catch {
    showToast('Backfill failed');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↺ Backfill Ref Rates'; }
  }
}

// ─── Invoice PDF Export ───────────────────────────────────────────────────
// Opens /api/billing/invoice in a new tab. User prints → Save as PDF.
export function exportBillingInvoice(clientId, clientName) {
  const from = document.getElementById('billing-from')?.value;
  const to   = document.getElementById('billing-to')?.value;
  if (!from || !to) { showToast('⚠ Select a date range first'); return; }
  const url = `/api/billing/invoice?clientId=${encodeURIComponent(clientId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  window.open(url, '_blank');
  showToast(`📄 Opening invoice for ${clientName || 'client'}…`);
}

// Expose for inline HTML handlers
window.setBillingPreset    = setBillingPreset;
window.initBillingView     = initBillingView;
window.loadBillingConfigs  = loadBillingConfigs;
window.saveBillingConfig   = saveBillingConfig;
window.generateBilling     = generateBilling;
window.loadBillingSummary  = loadBillingSummary;
window.loadBillingDetails       = loadBillingDetails;
window.loadPkgPriceMatrix       = loadPkgPriceMatrix;
window.renderPkgPriceForClient  = renderPkgPriceForClient;
window.savePkgPriceForClient    = savePkgPriceForClient;
window.updatePkgMarginRow       = updatePkgMarginRow;
window.backfillRefRates         = backfillRefRates;
window.fetchRefRates            = fetchRefRates;
window.toggleDetailCol          = toggleDetailCol;
window.exportBillingInvoice     = exportBillingInvoice;
