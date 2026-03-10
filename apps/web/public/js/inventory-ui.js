import { state } from './state.js';
import { escHtml, fmtWeight, showToast } from './utils.js';
import { getStoreName } from './stores.js';

export function openInventory(sku) {
  window.showView('inventory');
  if (sku) {
    setTimeout(() => {
      switchInvTab('stock');
      const el = document.getElementById('inv-stock-search');
      if (el) { el.value = sku; renderStockTab(); }
    }, 100);
  }
}

export async function populateInventory() {
  showToast('📥 Scanning orders for SKUs…');
  try {
    const r = await fetch('/api/inventory/populate', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      showToast(`✅ Imported ${d.skusRegistered} SKUs, processed ${d.shippedProcessed} shipments`);
      await loadInventoryView();
    } else showToast('❌ ' + (d.error || 'Failed'));
  } catch (e) { showToast('❌ ' + e.message); }
}

export async function importDimsFromSS() {
  const clientId = document.getElementById('inv-stock-client')?.value || '';
  const qs       = clientId ? `?clientId=${clientId}` : '';
  showToast('📐 Importing weight & dims from ShipStation…');
  try {
    const r = await fetch('/api/inventory/import-dims' + qs, { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      const msg = `✅ Updated ${d.updated} SKUs — ${d.skipped} already had dims, ${d.noMatch} not in SS catalog`;
      showToast(msg);
      await loadInventoryView();
    } else showToast('❌ ' + (d.error || 'Import failed'));
  } catch (e) { showToast('❌ ' + e.message); }
}

export async function loadInventoryView() {
  switchInvTab(state.invCurrentTab);
  try {
    const r = await fetch('/api/clients');
    state.invClientsData = await r.json();
  } catch { state.invClientsData = []; }

  const opts = state.invClientsData.map(c => `<option value="${c.clientId}">${escHtml(c.name)}</option>`).join('');
  ['inv-stock-client','inv-recv-client','inv-hist-client'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id !== 'inv-recv-client';
    el.innerHTML = (isFilter ? '<option value="">All Clients</option>' : '<option value="">Select Client…</option>') + opts;
  });

  try {
    const r2 = await fetch('/api/inventory/alerts');
    const alerts = await r2.json();
    const badge  = document.getElementById('inv-alerts-badge');
    if (badge) {
      if (alerts.length > 0) { badge.style.display = ''; badge.textContent = `⚠ ${alerts.length} Low/Out`; }
      else { badge.style.display = 'none'; }
    }
  } catch {}

  await loadStockData();
  renderStockTab();
  if (state.invCurrentTab === 'clients') renderClientsTab();
}

export async function loadStockData() {
  try {
    const clientId = document.getElementById('inv-stock-client')?.value || '';
    const url = '/api/inventory' + (clientId ? '?clientId=' + clientId : '');
    const r = await fetch(url);
    state.invStockData = await r.json();
  } catch { state.invStockData = []; }
  
  // Load parent SKUs for the selected client
  if (document.getElementById('inv-stock-client')?.value) {
    await loadParentSkuList();
  }
}

export async function loadParentSkuList() {
  try {
    const clientId = document.getElementById('inv-stock-client')?.value || '';
    if (!clientId) { state.parentSkuList = []; return; }
    const r = await fetch('/api/parent-skus?clientId=' + clientId);
    state.parentSkuList = await r.json();
  } catch { state.parentSkuList = []; }
}

export function switchInvTab(tab) {
  state.invCurrentTab = tab;
  ['stock','receive','clients','history'].forEach(t => {
    const panel = document.getElementById('inv-panel-' + t);
    const btn   = document.getElementById('invtab-' + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
  if (tab === 'clients')  renderClientsTab();
  if (tab === 'history')  loadHistoryTab();
  if (tab === 'receive')  initReceiveTab();
}

const INP = `padding:3px 5px;border:1px solid var(--border2);border-radius:4px;background:var(--surface2);color:var(--text);font-size:11.5px;width:100%;box-sizing:border-box`;

export function renderStockTab() {
  const search    = (document.getElementById('inv-stock-search')?.value || '').toLowerCase();
  const clientId  = document.getElementById('inv-stock-client')?.value || '';
  const alertOnly = document.getElementById('inv-alert-only')?.checked;
  const el        = document.getElementById('inv-stock-content');
  if (!el) return;

  let rows = state.invStockData;
  if (clientId)  rows = rows.filter(r => String(r.clientId) === String(clientId));
  if (search)    rows = rows.filter(r => (r.sku + r.name).toLowerCase().includes(search));
  if (alertOnly) rows = rows.filter(r => r.status !== 'ok');

  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div>${alertOnly ? 'No low/out stock' : 'No SKUs found'}</div></div>`;
    return;
  }

  const byClient = {};
  rows.forEach(r => {
    if (!byClient[r.clientId]) byClient[r.clientId] = { name: r.clientName, rows: [] };
    byClient[r.clientId].rows.push(r);
  });

  const bulk = state.bulkDimsMode;

  let html = '';
  if (bulk) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;background:var(--ss-blue-bg);border:1px solid var(--ss-blue);border-radius:8px">
      <span style="font-size:12px;color:var(--ss-blue);font-weight:600;flex:1">✏️ Bulk Dims Mode — edit weight &amp; dims inline, then save all at once</span>
      <button class="btn btn-primary btn-sm" onclick="saveBulkDims()">💾 Save All</button>
      <button class="btn btn-outline btn-sm" onclick="cancelBulkDims()">✕ Cancel</button>
    </div>`;
  }

  Object.values(byClient).forEach(group => {
    html += `<div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${escHtml(group.name)}</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <table class="inv-table" style="margin:0">`;

    if (bulk) {
      html += `<thead><tr>
        <th>SKU</th><th style="width:48px"></th><th>Name</th>
        <th style="width:90px">Wt (oz)</th>
        <th style="width:72px">L (in)</th>
        <th style="width:72px">W (in)</th>
        <th style="width:72px">H (in)</th>
      </tr></thead><tbody>`;
      group.rows.forEach(r => {
        const imgCell = r.imageUrl
          ? `<img src="${escHtml(r.imageUrl)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;display:block">`
          : `<div style="width:32px;height:32px;background:var(--surface3);border-radius:4px;border:1px dashed var(--border)"></div>`;
        html += `<tr data-inv-id="${r.id}">
          <td style="font-family:monospace;font-size:11px">${escHtml(r.sku)}</td>
          <td style="padding:4px 6px">${imgCell}</td>
          <td style="font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.name || '—')}</td>
          <td><input type="number" step="0.1" min="0" value="${r.weightOz || 0}" data-field="weightOz" style="${INP}"></td>
          <td><input type="number" step="0.1" min="0" value="${r.length || 0}" data-field="length" style="${INP}"></td>
          <td><input type="number" step="0.1" min="0" value="${r.width || 0}" data-field="width" style="${INP}"></td>
          <td><input type="number" step="0.1" min="0" value="${r.height || 0}" data-field="height" style="${INP}"></td>
        </tr>`;
      });
    } else {
      html += `<thead><tr>
          <th>SKU</th><th style="width:48px"></th><th>Name</th><th style="text-align:right">Weight</th>
          <th style="text-align:center">Dims (L×W×H)</th>
          <th style="text-align:center" title="Cubic footage per unit (used for storage fee billing). Auto-computed from dims or manually overridden.">Cu Ft/Unit</th>
          <th>Package</th>
          <th style="text-align:center">Stock</th><th style="text-align:center">Units/Pack</th>
          <th style="text-align:center">Total Units</th><th style="text-align:center">Min</th>
          <th style="text-align:center">Status</th><th></th>
        </tr></thead><tbody>`;
      group.rows.forEach(r => {
        const badge = r.status === 'out' ? `<span class="stock-badge stock-out">OUT</span>`
                    : r.status === 'low' ? `<span class="stock-badge stock-low">LOW</span>`
                    : `<span class="stock-badge stock-ok">OK</span>`;
        const wtDisplay   = r.weightOz > 0 ? fmtWeight(r.weightOz) : '<span style="color:var(--text4)">—</span>';
        const dimsDisplay = (r.length > 0 || r.width > 0 || r.height > 0)
          ? `${r.length}×${r.width}×${r.height}` : '<span style="color:var(--text4)">—</span>';
        const pkgDisplay  = r.packageName ? escHtml(r.packageName) : '<span style="color:var(--text4)">—</span>';
        const imgCell = r.imageUrl
          ? `<img src="${escHtml(r.imageUrl)}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;display:block;cursor:zoom-in" onmouseenter="showThumbPreview(this, event)" onmouseleave="hideThumbPreview()" onerror="this.outerHTML='<div style=\\'width:40px;height:40px;background:var(--surface3);border-radius:5px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px\\'>📦</div>'">`
          : `<div style="width:40px;height:40px;background:var(--surface3);border:1px dashed var(--border);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--text4);text-align:center;line-height:1.2">no<br>img</div>`;
        html += `<tr>
          <td style="font-family:monospace;font-size:11.5px;cursor:pointer;color:var(--ss-blue)" onclick="openSkuDrawer(${r.id})" title="View orders & sales trend">${escHtml(r.sku)}</td>
          <td style="padding:4px 6px">${imgCell}</td>
          <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="openSkuDrawer(${r.id})" title="View orders & sales trend">${escHtml(r.name) || '<span style="color:var(--text3)">—</span>'}</td>
          <td style="text-align:right;font-size:11.5px">${wtDisplay}</td>
          <td style="text-align:center;font-size:11.5px;font-family:monospace">${dimsDisplay}</td>
          <td style="text-align:center;font-size:11px;color:var(--text3)">${(() => {
            const cuFt = r.cuFtOverride > 0
              ? r.cuFtOverride
              : (r.productLength > 0 && r.productWidth > 0 && r.productHeight > 0 ? (r.productLength * r.productWidth * r.productHeight) / 1728 : 0);
            return cuFt > 0
              ? `<span title="${r.cuFtOverride > 0 ? 'Manual override' : 'Auto-computed from product dims'}">${cuFt.toFixed(3)}${r.cuFtOverride > 0 ? '<span style="color:var(--ss-blue);font-size:9px;margin-left:2px">✎</span>' : ''}</span>`
              : '<span style="color:var(--text4)">—</span>';
          })()}</td>
          <td style="font-size:11.5px">${pkgDisplay}</td>
          <td style="text-align:center;font-weight:700;font-size:13px;color:${r.currentStock<=0?'var(--red)':'var(--text)'}">${r.currentStock}</td>
          <td style="text-align:center;font-size:12px;color:var(--text3)">${r.units_per_pack > 1 ? `<span style="background:var(--ss-blue-bg);color:var(--ss-blue);font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:4px">×${r.units_per_pack}</span>` : '—'}</td>
          <td style="text-align:center;font-size:12px;color:var(--text2)">${r.units_per_pack > 1 ? `<span style="font-weight:700">${r.currentStock * r.units_per_pack}</span>` : '—'}</td>
          <td style="text-align:center;color:var(--text3);font-size:12px">${r.minStock}</td>
          <td style="text-align:center">${badge}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-xs" onclick="editInvSku(${r.id})" title="Edit SKU details">✏️</button>
            <button class="btn btn-ghost btn-xs" onclick="showAdjustModal(${r.id},'${escHtml(r.sku)}')" title="Add / Remove Stock" style="font-size:13px;font-weight:700;color:var(--ss-blue)">+</button>
          </td>
        </tr>`;
      });
    }

    html += '</tbody></table></div></div>';
  });
  el.innerHTML = html;
}

export function toggleBulkDims() {
  state.bulkDimsMode = !state.bulkDimsMode;
  const btn = document.getElementById('bulk-dims-btn');
  if (btn) {
    btn.textContent = state.bulkDimsMode ? '✕ Exit Bulk' : '✏️ Bulk Dims';
    btn.style.background = state.bulkDimsMode ? 'var(--ss-blue)' : '';
    btn.style.color       = state.bulkDimsMode ? '#fff' : '';
    btn.style.borderColor = state.bulkDimsMode ? 'var(--ss-blue)' : '';
  }
  renderStockTab();
}

export async function saveBulkDims() {
  const rows = document.querySelectorAll('#inv-stock-content tr[data-inv-id]');
  if (!rows.length) return;
  const updates = Array.from(rows).map(tr => ({
    id:       tr.dataset.invId,
    weightOz: tr.querySelector('[data-field="weightOz"]')?.value,
    length:   tr.querySelector('[data-field="length"]')?.value,
    width:    tr.querySelector('[data-field="width"]')?.value,
    height:   tr.querySelector('[data-field="height"]')?.value,
  }));
  try {
    const r = await fetch('/api/inventory/bulk-update-dims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Server error');
    showToast(`✅ Saved dims for ${d.updated} SKUs`);
    state.bulkDimsMode = false;
    const btn = document.getElementById('bulk-dims-btn');
    if (btn) { btn.textContent = '✏️ Bulk Dims'; btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
    // Refresh inventory data then re-render
    const inv = await fetch('/api/inventory').then(x => x.json());
    state.invStockData = inv;
    renderStockTab();
  } catch (e) { showToast('❌ Save failed: ' + e.message); }
}

export function cancelBulkDims() {
  state.bulkDimsMode = false;
  const btn = document.getElementById('bulk-dims-btn');
  if (btn) { btn.textContent = '✏️ Bulk Dims'; btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
  renderStockTab();
}

export function showAdjustModal(invSkuId, sku) {
  document.getElementById('adjustModalOverlay')?.remove();
  const today   = new Date().toISOString().slice(0, 10);
  const overlay = document.createElement('div');
  overlay.id = 'adjustModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:22px 24px;width:380px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:14px;font-weight:700;margin-bottom:2px">Inventory Entry</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:14px;font-family:monospace">${escHtml(sku)}</div>

      <!-- Type -->
      <div style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Type</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="adjType-receive" onclick="setAdjType('receive')"
            style="flex:1;padding:6px 10px;border-radius:6px;border:2px solid var(--ss-blue);background:var(--ss-blue);color:#fff;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap">📦 Receive</button>
          <button id="adjType-return" onclick="setAdjType('return')"
            style="flex:1;padding:6px 10px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap">↩ Return</button>
          <button id="adjType-damage" onclick="setAdjType('damage')"
            style="flex:1;padding:6px 10px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap">⚠ Damage</button>
          <button id="adjType-adjust" onclick="setAdjType('adjust')"
            style="flex:1;padding:6px 10px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap">± Adjust</button>
        </div>
      </div>

      <!-- Add / Remove -->
      <div style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Direction</label>
        <div style="display:flex;gap:8px">
          <button id="adjBtn-add" onclick="setAdjSign(1)"
            style="flex:1;padding:7px;border-radius:6px;border:2px solid var(--ss-blue);background:var(--ss-blue);color:#fff;font-weight:700;cursor:pointer;font-size:13px">+ Add</button>
          <button id="adjBtn-remove" onclick="setAdjSign(-1)"
            style="flex:1;padding:7px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:13px">− Remove</button>
        </div>
      </div>

      <!-- Qty -->
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
        <span style="font-size:13px;font-weight:700;color:var(--text);width:16px;text-align:center" id="adjSignLabel">+</span>
        <input id="adjQtyInput" type="number" min="1" step="1" value="1" placeholder="Qty"
          style="flex:1;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:14px;font-weight:700">
      </div>

      <!-- Note -->
      <input id="adjNoteInput" type="text" placeholder="Note (e.g. PO#, reason, ref)" maxlength="120"
        style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;margin-bottom:10px">

      <!-- Date -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <span style="font-size:12px;color:var(--text2);white-space:nowrap">📅 Date:</span>
        <input id="adjDateInput" type="date" value="${today}"
          style="flex:1;padding:6px 8px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px">
        <span id="adjDateLabel" style="font-size:11px;color:var(--text3);white-space:nowrap"></span>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('adjustModalOverlay').remove()"
          style="padding:7px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px">Cancel</button>
        <button onclick="submitAdjust(${invSkuId})"
          style="padding:7px 16px;border-radius:6px;border:none;background:var(--ss-blue);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Save</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submitAdjust(invSkuId);
    if (e.key === 'Escape') overlay.remove();
  });
  document.body.appendChild(overlay);
  state._adjType = 'receive'; // default type
  document.getElementById('adjQtyInput').focus();
  document.getElementById('adjQtyInput').select();
  // Show "today" label
  document.getElementById('adjDateInput').addEventListener('change', function() {
    const lbl = document.getElementById('adjDateLabel');
    if (lbl) lbl.textContent = this.value === today ? '(today)' : '';
  });
}

export function setAdjType(type) {
  state._adjType = type;
  // Highlight active type button
  ['receive','return','damage','adjust'].forEach(t => {
    const btn = document.getElementById('adjType-' + t);
    if (!btn) return;
    const isActive = t === type;
    const color = type === 'damage' ? 'var(--red)' : type === 'return' ? '#d97706' : 'var(--ss-blue)';
    btn.style.border    = `2px solid ${isActive ? color : 'var(--border2)'}`;
    btn.style.background = isActive ? color : 'var(--surface2)';
    btn.style.color      = isActive ? '#fff' : 'var(--text)';
  });
  // Auto-set direction: damage = remove, everything else = add
  setAdjSign(type === 'damage' ? -1 : 1);
}

export function setAdjSign(sign) {
  state._adjSign = sign;
  document.getElementById('adjSignLabel').textContent = sign > 0 ? '+' : '−';
  const addBtn = document.getElementById('adjBtn-add');
  const remBtn = document.getElementById('adjBtn-remove');
  if (sign > 0) {
    if (addBtn) addBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--ss-blue);background:var(--ss-blue);color:#fff;font-weight:700;cursor:pointer;font-size:13px';
    if (remBtn) remBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:13px';
  } else {
    if (addBtn) addBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:13px';
    if (remBtn) remBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--red);background:var(--red);color:#fff;font-weight:700;cursor:pointer;font-size:13px';
  }
}

export function submitAdjust(invSkuId) {
  const qty      = parseInt(document.getElementById('adjQtyInput')?.value) || 0;
  const note     = document.getElementById('adjNoteInput')?.value.trim();
  const dateVal  = document.getElementById('adjDateInput')?.value || '';
  const type     = state._adjType || 'adjust';
  if (!qty || qty <= 0) return showToast('⚠ Enter a positive quantity');
  const n           = state._adjSign * qty;
  const defaultNote = n > 0 ? `Manual ${type}` : 'Manual remove';
  const finalNote   = note || defaultNote;
  const adjustedAt  = dateVal
    ? new Date(dateVal + 'T12:00:00').toISOString()
    : new Date().toISOString();
  document.getElementById('adjustModalOverlay')?.remove();
  fetch('/api/inventory/adjust', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invSkuId, qty: n, note: finalNote, type, adjustedAt }),
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      const dateStr = new Date(adjustedAt).toLocaleDateString();
      showToast(`✅ ${type.charAt(0).toUpperCase()+type.slice(1)} recorded on ${dateStr}. New total: ${d.newStock} — <a href="#" onclick="switchInvTab('history');return false" style="color:inherit;text-decoration:underline">View History</a>`);
      loadInventoryView();
    }
    else showToast('❌ ' + (d.error || 'Adjust failed'));
  }).catch(() => showToast('❌ Network error'));
}

// ── Create Parent SKU Modal ───────────────────────────────────────────────────

let _parentModalResolve = null;

export function showCreateParentModal(clientId) {
  return new Promise((resolve) => {
    _parentModalResolve = resolve;
    document.getElementById('createParentOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'createParentOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px';
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); _parentModalResolve = null; resolve(null); } };
    
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:10px;padding:22px 24px;width:420px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.3);margin:auto">
        <div style="font-size:14px;font-weight:700;margin-bottom:14px">Create Parent SKU</div>
        
        <div style="margin-bottom:12px">
          <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:4px">Parent Name <span style="color:var(--red)">*</span></label>
          <input type="text" id="parent-name" placeholder="e.g., Banana Drink" maxlength="100"
            class="ship-select" style="width:100%;font-size:13px;padding:8px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2)">
        </div>
        
        <div style="margin-bottom:12px">
          <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:4px">Parent SKU Code <span style="color:var(--text4);font-weight:400">(optional)</span></label>
          <input type="text" id="parent-sku" placeholder="e.g., BANANA-DRINK-PARENT" maxlength="100"
            class="ship-select" style="width:100%;font-size:13px;padding:8px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);font-family:monospace">
        </div>
        
        <div style="margin-bottom:16px">
          <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:4px">Base Unit Qty <span style="color:var(--text4);font-weight:400">(default: 1)</span></label>
          <input type="number" id="parent-baseunit" placeholder="1" value="1" min="1" step="1"
            class="ship-select" style="width:100%;font-size:13px;padding:8px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2)">
          <div style="font-size:10px;color:var(--text3);margin-top:4px">Units per case (e.g., 6 for 6-pack, 1 for single units)</div>
        </div>
        
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('createParentOverlay')?.remove();_parentModalResolve=null"
            style="padding:7px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window.submitCreateParent(${clientId})"
            style="padding:7px 16px;border-radius:6px;border:none;background:var(--ss-blue);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Create</button>
        </div>
      </div>`;
    
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter')  window.submitCreateParent(clientId);
      if (e.key === 'Escape') { overlay.remove(); _parentModalResolve = null; resolve(null); }
    });
    
    document.body.appendChild(overlay);
    document.getElementById('parent-name')?.focus();
  });
}

export async function submitCreateParent(clientId) {
  const name = document.getElementById('parent-name')?.value.trim();
  const sku = document.getElementById('parent-sku')?.value.trim() || '';
  const baseUnitQty = parseInt(document.getElementById('parent-baseunit')?.value) || 1;
  
  if (!name) {
    showToast('⚠ Parent name is required');
    return;
  }
  
  try {
    const r = await fetch('/api/parent-skus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: parseInt(clientId), name, sku, baseUnitQty: Math.max(1, baseUnitQty) }),
    });
    const d = await r.json();
    if (!r.ok || !d.parentSkuId) throw new Error(d.error || 'Failed to create parent');
    
    showToast(`✅ Created parent: ${name}`);
    document.getElementById('createParentOverlay')?.remove();
    
    // Reload parent list for future edits
    await loadParentSkuList();
    
    // Resolve the promise with the new parentSkuId
    if (_parentModalResolve) {
      _parentModalResolve(d.parentSkuId);
      _parentModalResolve = null;
    }
  } catch (e) {
    showToast('❌ Failed to create parent: ' + e.message);
  }
}

export function editInvSku(invSkuId) {
  const sku = state.invStockData.find(r => r.id === invSkuId);
  if (!sku) return;
  document.getElementById('editInvSkuOverlay')?.remove();
  const pkgOpts = state.packagesList
    .filter(p => p.source === 'custom')
    .map(p => `<option value="${p.packageId}" ${p.packageId === sku.packageId ? 'selected' : ''}>${escHtml(p.name)} (${p.length}×${p.width}×${p.height})</option>`)
    .join('');
  
  // Build parent SKU options
  const parentOpts = (state.parentSkuList || [])
    .filter(p => p.clientId === sku.clientId)
    .map(p => `<option value="${p.parentSkuId}" ${p.parentSkuId === sku.parentSkuId ? 'selected' : ''}>${escHtml(p.name)}</option>`)
    .join('');
  
  const overlay = document.createElement('div');
  overlay.id = 'editInvSkuOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:22px 24px;width:420px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.3);margin:auto">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">Edit SKU Details</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:14px;font-family:monospace">${escHtml(sku.sku)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">Weight (oz)</label>
          <input type="number" id="edit-inv-weight" value="${sku.weightOz||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">Min Stock</label>
          <input type="number" id="edit-inv-minstock" value="${sku.minStock||0}" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
        <div>
          <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase" title="How many individual units are in one of this SKU (e.g. 10 for a 10-pack)">Units / Pack</label>
          <input type="number" id="edit-inv-upp" value="${sku.units_per_pack||1}" min="1" step="1" class="ship-select" style="width:100%;font-size:12px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="grid-column:1/-1">
          <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">📦 Parent SKU (for variants)</label>
          <select id="edit-inv-parent" class="ship-select" style="width:100%;font-size:12px">
            <option value="">— No Parent —</option>
            ${parentOpts}
            <option value="__create__" style="font-weight:700;color:var(--ss-blue)">➕ Create New Parent…</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="grid-column:1/-1">
          <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase" title="How many base units per pack (e.g. 6 for 6-pack, 12 for 12-pack). Used to calculate total inventory across variants.">Base Unit Qty (per pack)</label>
          <input type="number" id="edit-inv-baseunit" value="${sku.baseUnitQty||1}" min="1" step="1" class="ship-select" style="width:100%;font-size:12px" title="e.g., 6 for 6-pack, 12 for 12-pack">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">📦 Pkg L</label>
          <input type="number" id="edit-inv-l" value="${sku.packageLength||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">📦 Pkg W</label>
          <input type="number" id="edit-inv-w" value="${sku.packageWidth||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">📦 Pkg H</label>
          <input type="number" id="edit-inv-h" value="${sku.packageHeight||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase" title="Product dimensions for storage fee calculations">📦 Prod L</label>
          <input type="number" id="edit-inv-pl" value="${sku.productLength||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase" title="Product dimensions for storage fee calculations">📦 Prod W</label>
          <input type="number" id="edit-inv-pw" value="${sku.productWidth||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
        <div><label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase" title="Product dimensions for storage fee calculations">📦 Prod H</label>
          <input type="number" id="edit-inv-ph" value="${sku.productHeight||0}" step="0.1" min="0" class="ship-select" style="width:100%;font-size:12px"></div>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase">📦 Shipping Package</label>
        <select id="edit-inv-pkg" class="ship-select" style="width:100%;font-size:12px">
          <option value="">— No Package —</option>${pkgOpts}
        </select>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase" title="Override the auto-computed cubic footage based on product dims (L×W×H÷1728). Leave 0 to compute from product dimensions automatically.">Cu Ft Override <span style="color:var(--text4);font-weight:400;text-transform:none">(0 = auto from product dims${sku.productLength > 0 ? ': ' + ((sku.productLength * sku.productWidth * sku.productHeight) / 1728).toFixed(4) + ' cu ft' : ''})</span></label>
        <input type="number" id="edit-inv-cuft" value="${sku.cuFtOverride > 0 ? sku.cuFtOverride : 0}" step="0.0001" min="0" class="ship-select" style="width:130px;font-size:12px">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('editInvSkuOverlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveInvSku(${invSkuId})">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

export async function saveInvSku(invSkuId) {
  const sku = state.invStockData.find(r => r.id === invSkuId);
  if (!sku) return;
  
  const parentSelect = document.getElementById('edit-inv-parent');
  let parentSkuId = parseInt(parentSelect?.value) || null;
  
  // Handle "Create New Parent" option
  if (parentSkuId === '__create__') {
    parentSkuId = await showCreateParentModal(sku.clientId);
    if (!parentSkuId) {
      parentSelect.value = '';
      return;
    }
  }
  
  const body = {
    name:           sku.name,
    minStock:       parseFloat(document.getElementById('edit-inv-minstock').value) || 0,
    weightOz:       parseFloat(document.getElementById('edit-inv-weight').value) || 0,
    length:         parseFloat(document.getElementById('edit-inv-l').value) || 0,
    width:          parseFloat(document.getElementById('edit-inv-w').value) || 0,
    height:         parseFloat(document.getElementById('edit-inv-h').value) || 0,
    productLength:  parseFloat(document.getElementById('edit-inv-pl').value) || 0,
    productWidth:   parseFloat(document.getElementById('edit-inv-pw').value) || 0,
    productHeight:  parseFloat(document.getElementById('edit-inv-ph').value) || 0,
    packageId:      parseInt(document.getElementById('edit-inv-pkg').value) || null,
    units_per_pack: Math.max(1, parseInt(document.getElementById('edit-inv-upp').value) || 1),
    cuFtOverride:   parseFloat(document.getElementById('edit-inv-cuft').value) || null,
  };
  
  // Handle parent SKU linkage
  if (parentSkuId) {
    try {
      await fetch(`/api/inventory/${invSkuId}/set-parent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentSkuId,
          baseUnitQty: Math.max(1, parseInt(document.getElementById('edit-inv-baseunit').value) || 1),
        }),
      });
    } catch (e) {
      showToast('⚠️ Saved SKU but failed to link parent: ' + e.message);
    }
  } else if (sku.parentSkuId) {
    // Unlink from parent if was previously linked
    try {
      await fetch(`/api/inventory/${invSkuId}/set-parent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentSkuId: null }),
      });
    } catch (e) {
      showToast('⚠️ Saved SKU but failed to unlink parent: ' + e.message);
    }
  }
  
  try {
    const r = await fetch(`/api/inventory/${invSkuId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.ok) {
      showToast('✅ Saved');
      document.getElementById('editInvSkuOverlay')?.remove();
      await loadStockData();
      renderStockTab();
    } else showToast('❌ ' + (d.error || 'Save failed'));
  } catch (e) { showToast('❌ ' + e.message); }
}

export async function showSkuHistory(invSkuId, sku) {
  switchInvTab('history');
  const el = document.getElementById('inv-history-content');
  if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const r    = await fetch(`/api/inventory/${invSkuId}/ledger`);
    const rows = await r.json();
    renderLedgerTable(rows, `History: ${sku}`);
  } catch { if (el) el.innerHTML = '<div class="empty-state">Failed to load</div>'; }
}

// ── Receive Tab ──────────────────────────────────────────────────────────────

// Map of sku → name for the currently selected receive client
let _recvSkuMap = {};

export async function onRecvClientChange() {
  const clientId = document.getElementById('inv-recv-client')?.value;
  if (!clientId) { _recvSkuMap = {}; return; }

  // Fetch SKUs for this specific client (fresh, not relying on stock tab's filter)
  let clientSkus = [];
  try {
    const r = await fetch('/api/inventory?clientId=' + clientId);
    clientSkus = await r.json();
  } catch { clientSkus = []; }

  // Build datalist — store full metadata per SKU
  _recvSkuMap = {};
  const list = document.getElementById('recv-sku-datalist');
  if (list) {
    list.innerHTML = clientSkus.map(r => {
      _recvSkuMap[r.sku] = { name: r.name || '', units_per_pack: r.units_per_pack || 1 };
      return `<option value="${escHtml(r.sku)}">${escHtml(r.name || r.sku)}</option>`;
    }).join('');
  }

  // Reset rows so new rows get the fresh datalist
  const cont = document.getElementById('inv-recv-rows');
  if (cont) { cont.innerHTML = ''; addReceiveRow(); }
}

export function initReceiveTab() {
  const cont = document.getElementById('inv-recv-rows');
  if (cont && !cont.children.length) addReceiveRow();
  // Default "Received On" to today
  const dateEl = document.getElementById('inv-recv-date');
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }
  // Prime the datalist for any already-selected client
  onRecvClientChange();
}

export function onRecvSkuInput(input) {
  const sku     = input.value.trim();
  const row     = input.closest('.recv-row');
  const nameEl  = row?.querySelector('.recv-name');
  const hintEl  = row?.querySelector('.recv-upp-hint');
  const info    = sku ? _recvSkuMap[sku] : null;

  // Auto-fill product name
  if (nameEl) {
    if (info) {
      if (!nameEl.value || nameEl.dataset.autofilled === 'true') {
        nameEl.value = info.name;
        nameEl.dataset.autofilled = 'true';
      }
    } else if (nameEl.dataset.autofilled === 'true') {
      nameEl.value = '';
      nameEl.dataset.autofilled = '';
    }
  }

  // Show "×N units per pack" hint next to qty
  if (hintEl) {
    const upp = info?.units_per_pack || 1;
    hintEl.textContent = upp > 1 ? `×${upp} units/pack` : '';
    hintEl.style.display = upp > 1 ? '' : 'none';
  }
}

export function onRecvQtyInput(qtyInput) {
  const row    = qtyInput.closest('.recv-row');
  const sku    = row?.querySelector('.recv-sku')?.value.trim();
  const hintEl = row?.querySelector('.recv-total-hint');
  if (!hintEl || !sku) return;
  const info = _recvSkuMap[sku];
  const upp  = info?.units_per_pack || 1;
  const qty  = parseInt(qtyInput.value) || 0;
  if (upp > 1 && qty > 0) {
    hintEl.textContent = `= ${qty * upp} total units`;
    hintEl.style.display = '';
  } else {
    hintEl.style.display = 'none';
  }
}

export function addReceiveRow() {
  const cont = document.getElementById('inv-recv-rows');
  if (!cont) return;
  const div = document.createElement('div');
  div.className = 'recv-row';
  div.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:8px;background:var(--surface2);border-radius:6px;border:1px solid var(--border)';
  div.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center">
      <input type="text" class="ship-select recv-sku" list="recv-sku-datalist"
        placeholder="SKU" style="font-family:monospace;font-size:12px;flex:1"
        oninput="onRecvSkuInput(this)">
      <input type="text" class="ship-select recv-name" placeholder="Product name (auto-fills)" style="font-size:12px;flex:2">
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
        <input type="number" class="ship-select recv-qty" placeholder="Qty" min="1"
          style="width:72px;font-size:12px;text-align:center"
          oninput="onRecvQtyInput(this)">
        <span class="recv-total-hint" style="display:none;font-size:10px;color:var(--ss-blue);font-weight:700;white-space:nowrap"></span>
      </div>
      <span class="recv-upp-hint" style="display:none;font-size:10px;color:var(--text3);white-space:nowrap;align-self:flex-start;padding-top:6px"></span>
      <button class="btn btn-ghost btn-xs" onclick="this.closest('.recv-row').remove()" title="Remove row" style="align-self:flex-start">✕</button>
    </div>`;
  cont.appendChild(div);
  div.querySelector('.recv-sku')?.focus();
}

export async function submitReceive() {
  const clientId = document.getElementById('inv-recv-client')?.value;
  if (!clientId) return showToast('⚠ Select a client first');
  const note       = document.getElementById('inv-recv-note')?.value || '';
  const dateVal    = document.getElementById('inv-recv-date')?.value || '';
  // receivedAt: use selected date at noon local time, or now
  const receivedAt = dateVal
    ? new Date(dateVal + 'T12:00:00').toISOString()
    : new Date().toISOString();

  const rows  = document.querySelectorAll('#inv-recv-rows .recv-row');
  const items = [];
  rows.forEach(row => {
    const sku  = row.querySelector('.recv-sku')?.value.trim();
    const name = row.querySelector('.recv-name')?.value.trim() || '';
    const qty  = parseInt(row.querySelector('.recv-qty')?.value || 0);
    if (sku && qty > 0) items.push({ sku, name, qty });
  });
  if (!items.length) return showToast('⚠ Add at least one SKU with quantity');
  const r = await fetch('/api/inventory/receive', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: parseInt(clientId), items, note, receivedAt }),
  });
  const d = await r.json();
  if (d.ok) {
    const res = document.getElementById('inv-recv-result');
    if (res) {
      res.style.display = '';
      const dateStr = new Date(receivedAt).toLocaleDateString();
      res.innerHTML = `✅ Received ${d.received.length} SKU(s) on ${dateStr}: ${d.received.map(x=>`${x.sku} (${x.qty} units → ${x.newStock} total)`).join(', ')} — <a href="#" onclick="switchInvTab('history');return false" style="color:var(--ss-blue)">View History</a>`;
    }
    document.getElementById('inv-recv-rows').innerHTML = '';
    addReceiveRow();
    document.getElementById('inv-recv-note').value = '';
    // Reset date to today
    const dateEl = document.getElementById('inv-recv-date');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    loadInventoryView();
  } else showToast('❌ ' + d.error);
}

// ── Clients Tab ──────────────────────────────────────────────────────────────

export function renderClientsTab() {
  const el = document.getElementById('inv-clients-content');
  if (!el) return;
  if (!state.invClientsData.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏢</div>
      <div style="margin-bottom:10px">No clients yet.</div>
      <button class="btn btn-primary btn-sm" onclick="syncClientsFromStores()">↻ Import from ShipStation Stores</button>
    </div>`;
    return;
  }
  el.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
    <table class="inv-table" style="margin:0">
      <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>ShipStation Stores</th><th>Rate Source</th><th></th></tr></thead>
      <tbody>${state.invClientsData.map(c => {
        const storeNames = (c.storeIds||[]).map(id => {
          const name = state.storeMap[id];
          return name ? `<span title="Store ${id}">${escHtml(name)}</span>` : `<span style="font-family:monospace;font-size:10px">#${id}</span>`;
        }).join(', ') || '—';
        const rateSource = c.rateSourceName || 'DR PREPPER';
        return `<tr>
          <td style="font-weight:600">${escHtml(c.name)}</td>
          <td style="font-size:12px">${escHtml(c.contactName||'—')}</td>
          <td style="font-size:12px">${escHtml(c.email||'—')}</td>
          <td style="font-size:12px">${storeNames}</td>
          <td style="font-size:12px;font-weight:500">${escHtml(rateSource)}</td>
          <td>
            <button class="btn btn-ghost btn-xs" onclick="showClientForm(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
            <button class="btn btn-ghost btn-xs" onclick="deleteClient(${c.clientId},'${escHtml(c.name)}')">Delete</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

export async function syncClientsFromStores() {
  const btn    = document.getElementById('btn-sync-stores');
  const status = document.getElementById('sync-stores-status');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Syncing…';
  try {
    const r = await fetch('/api/clients/sync-stores', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      state.invClientsData = d.clients;
      renderClientsTab();
      if (status) status.textContent = `✅ ${d.clients.length} clients synced`;
      setTimeout(() => { if (status) status.textContent = ''; }, 4000);
    } else if (status) status.textContent = '⚠ Sync failed';
  } catch (e) {
    if (status) status.textContent = '⚠ Error: ' + e.message;
  } finally { if (btn) btn.disabled = false; }
}

export function showClientForm(client) {
  const isEdit = client && typeof client === 'object';
  document.getElementById('inv-client-form-title').textContent = isEdit ? 'Edit Client' : 'Add Client';
  document.getElementById('inv-client-id').value      = isEdit ? client.clientId : '';
  document.getElementById('inv-client-name').value    = isEdit ? (client.name || '') : '';
  document.getElementById('inv-client-contact').value = isEdit ? (client.contactName || '') : '';
  document.getElementById('inv-client-email').value   = isEdit ? (client.email || '') : '';
  document.getElementById('inv-client-phone').value   = isEdit ? (client.phone || '') : '';
  document.getElementById('inv-client-stores').value  = isEdit ? (client.storeIds || []).join(', ') : '';
  
  // Rate source dropdown: DR PREPPER (main) or KFG
  const rateSourceSelect = document.getElementById('inv-client-rate-source');
  rateSourceSelect.innerHTML = `
    <option value="">DR PREPPER</option>
    <option value="10">KFG</option>
  `;
  if (isEdit && client.rate_source_client_id) {
    rateSourceSelect.value = client.rate_source_client_id;
  }
  
  document.getElementById('inv-client-form').style.display = '';
}

export function hideClientForm() {
  document.getElementById('inv-client-form').style.display = 'none';
}

export async function saveClient() {
  const id      = document.getElementById('inv-client-id').value;
  const rateSourceVal = document.getElementById('inv-client-rate-source').value;
  const payload = {
    name:        document.getElementById('inv-client-name').value.trim(),
    contactName: document.getElementById('inv-client-contact').value.trim(),
    email:       document.getElementById('inv-client-email').value.trim(),
    phone:       document.getElementById('inv-client-phone').value.trim(),
    storeIds:    document.getElementById('inv-client-stores').value.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)),
    rate_source_client_id: rateSourceVal ? parseInt(rateSourceVal) : null,
  };
  if (!payload.name) return showToast('⚠ Client name is required');
  const url    = id ? `/api/clients/${id}` : '/api/clients';
  const method = id ? 'PUT' : 'POST';
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json();
  if (d.ok || d.clientId) {
    showToast(id ? '✅ Client updated' : `✅ Client "${payload.name}" added`);
    hideClientForm();
    await loadInventoryView();
    renderClientsTab();
  } else showToast('❌ ' + (d.error || 'Save failed'));
}

export async function deleteClient(clientId, name) {
  if (!confirm(`Delete client "${name}"? Their inventory records will be preserved.`)) return;
  const r = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
  const d = await r.json();
  if (d.ok) { showToast(`✅ Client deleted`); await loadInventoryView(); renderClientsTab(); }
  else showToast('❌ ' + d.error);
}

// ── History Tab ──────────────────────────────────────────────────────────────

export async function loadHistoryTab() {
  const el       = document.getElementById('inv-history-content');
  const clientId = document.getElementById('inv-hist-client')?.value || '';
  const type     = document.getElementById('inv-hist-type')?.value || '';
  const dateFrom = document.getElementById('inv-hist-from')?.value || '';
  const dateTo   = document.getElementById('inv-hist-to')?.value   || '';
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const params = new URLSearchParams({ limit: '500' });
    if (clientId) params.set('clientId', clientId);
    if (type)     params.set('type', type);
    if (dateFrom) params.set('dateStart', String(new Date(dateFrom + 'T00:00:00').getTime()));
    if (dateTo)   params.set('dateEnd',   String(new Date(dateTo   + 'T23:59:59').getTime()));

    const rows = await fetch('/api/inventory/ledger?' + params).then(r => r.json());
    if (!rows.length) { el.innerHTML = '<div class="empty-state">No movements found</div>'; return; }
    renderLedgerTable(rows);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

export function renderLedgerTable(rows, title = 'Recent Movements') {
  const el = document.getElementById('inv-history-content');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<div class="empty-state">No movements found</div>'; return; }
  const typeColor = { receive:'var(--green)', ship:'var(--text3)', adjust:'var(--ss-blue)', return:'var(--yellow)', damage:'var(--red)' };
  el.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">${title}</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
    <table class="inv-table" style="margin:0;font-size:11.5px">
      <thead><tr><th>Date</th><th>SKU</th><th>Type</th><th style="text-align:right">Qty</th><th>Note</th><th>Source</th></tr></thead>
      <tbody>${rows.map(r => {
        const color  = typeColor[r.type] || 'var(--text)';
        const dt     = r.createdAt ? new Date(r.createdAt).toLocaleString() : '—';
        const qtyStr = r.qty > 0 ? `+${r.qty}` : String(r.qty);
        return `<tr>
          <td style="color:var(--text3)">${dt}</td>
          <td style="font-family:monospace">${escHtml(r.sku || '—')}</td>
          <td><span style="font-weight:700;color:${color};text-transform:capitalize">${r.type}</span></td>
          <td style="text-align:right;font-weight:700;color:${r.qty > 0 ? 'var(--green)' : 'var(--red)'}">${qtyStr}</td>
          <td style="color:var(--text2)">${escHtml(r.note || '—')}</td>
          <td style="color:var(--text3)">${r.createdBy || '—'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`;
}

// ── SKU Drawer — orders list + 30-day sales chart ────────────────────────────

export async function openSkuDrawer(invSkuId) {
  // Remove existing drawer
  document.getElementById('skuDrawerOverlay')?.remove();

  // Create overlay + slide-in panel
  const overlay = document.createElement('div');
  overlay.id = 'skuDrawerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:4000;display:flex;justify-content:flex-end';
  overlay.innerHTML = `
    <div id="skuDrawerPanel" style="width:680px;max-width:100vw;height:100%;background:var(--surface);display:flex;flex-direction:column;box-shadow:-4px 0 32px rgba(0,0,0,.25);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0">
        <div style="flex:1">
          <div id="skuDrawerTitle" style="font-size:15px;font-weight:700;color:var(--text)">Loading…</div>
          <div id="skuDrawerSub" style="font-size:11px;color:var(--text3);margin-top:2px;font-family:monospace"></div>
        </div>
        <button onclick="document.getElementById('skuDrawerOverlay').remove()"
          style="padding:5px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px">✕</button>
      </div>
      <div id="skuDrawerBody" style="flex:1;overflow-y:auto;padding:18px 20px">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', _skuDrawerEsc = e => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', _skuDrawerEsc); }
  });
  document.body.appendChild(overlay);

  // Slide-in animation
  const panel = document.getElementById('skuDrawerPanel');
  panel.style.transform = 'translateX(100%)';
  panel.style.transition = 'transform .2s ease';
  requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; }));

  // Fetch data
  try {
    const data = await fetch(`/api/inventory/${invSkuId}/sku-orders`).then(r => r.json());
    if (data.error) throw new Error(data.error);

    document.getElementById('skuDrawerTitle').textContent = data.name || data.sku;
    document.getElementById('skuDrawerSub').textContent   = data.sku;

    const body = document.getElementById('skuDrawerBody');
    body.innerHTML = `
      <!-- Stats row -->
      <div style="display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 16px;flex:1;min-width:120px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);margin-bottom:4px">30-Day Units Sold</div>
          <div style="font-size:22px;font-weight:800;color:#e07a00">${data.totalUnits.toLocaleString()}</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 16px;flex:1;min-width:120px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);margin-bottom:4px">Total Orders</div>
          <div style="font-size:22px;font-weight:800;color:var(--text)">${data.orders.length.toLocaleString()}</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 16px;flex:1;min-width:120px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);margin-bottom:4px">Avg/Day (30d)</div>
          <div style="font-size:22px;font-weight:800;color:var(--text)">${(data.totalUnits / 30).toFixed(1)}</div>
        </div>
      </div>

      <!-- Bar chart -->
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:18px">
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px">📊 Units Sold — Last 30 Days</div>
        <canvas id="skuSalesChart" width="620" height="160" style="width:100%;height:160px;display:block"></canvas>
      </div>

      <!-- Orders table -->
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">Recent Orders (${data.orders.length})</div>
      ${data.orders.length === 0
        ? `<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No orders found for this SKU.</div>`
        : `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
                <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3)">Order #</th>
                <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3)">Customer</th>
                <th style="padding:7px 6px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3)">Qty</th>
                <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3)">Status</th>
                <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text3)">Date</th>
              </tr>
            </thead>
            <tbody>
              ${data.orders.map((o, i) => {
                const statusColor = o.orderStatus === 'shipped' ? 'var(--green)' : o.orderStatus === 'awaiting_shipment' ? 'var(--ss-blue)' : 'var(--text3)';
                const dt = o.orderDate ? new Date(o.orderDate).toLocaleDateString() : '—';
                const bg = i % 2 === 0 ? '' : 'background:var(--surface2)';
                return `<tr style="border-top:1px solid var(--border);${bg}">
                  <td style="padding:6px 10px;font-family:monospace;font-size:11px;color:var(--ss-blue)">${escHtml(o.orderNumber || String(o.orderId))}</td>
                  <td style="padding:6px 10px;font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(o.shipToName || '—')}</td>
                  <td style="padding:6px 6px;text-align:center;font-weight:700">${o.qty || 1}</td>
                  <td style="padding:6px 10px;font-size:11px;font-weight:700;color:${statusColor}">${escHtml(o.orderStatus || '—')}</td>
                  <td style="padding:6px 10px;font-size:11px;color:var(--text3)">${dt}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`
      }`;

    // Draw the bar chart after DOM settles
    requestAnimationFrame(() => _drawSkuSalesChart('skuSalesChart', data.dailySales));
  } catch (e) {
    document.getElementById('skuDrawerTitle').textContent = 'Error';
    document.getElementById('skuDrawerBody').innerHTML = `<div style="color:var(--red);padding:16px">Failed to load: ${e.message}</div>`;
  }
}

let _skuDrawerEsc = null;

function _drawSkuSalesChart(canvasId, dailySales) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Scale canvas for device pixel ratio (crisp on retina)
  const dpr    = window.devicePixelRatio || 1;
  const rect   = canvas.getBoundingClientRect();
  const W      = rect.width  || 620;
  const H      = rect.height || 160;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Theme-aware colours (read CSS vars from root)
  const cs      = getComputedStyle(document.documentElement);
  const colBg   = cs.getPropertyValue('--surface2').trim()  || '#f5f5f5';
  const colGrid = cs.getPropertyValue('--border').trim()    || '#e0e0e0';
  const colText = cs.getPropertyValue('--text3').trim()     || '#888';
  const colBar  = '#e07a00';   // orange — always
  const colBarH = '#ff9a1f';   // highlight for today's bar

  const PAD_L = 36, PAD_R = 8, PAD_T = 10, PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...dailySales.map(d => d.units), 1);
  const nBars  = dailySales.length;
  const barW   = Math.max(2, (chartW / nBars) * 0.72);
  const gap    = chartW / nBars;
  const today  = new Date().toISOString().slice(0, 10);

  // Background
  ctx.fillStyle = colBg;
  ctx.fillRect(0, 0, W, H);

  // Grid lines (3 horizontal)
  ctx.strokeStyle = colGrid;
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  for (let g = 0; g <= 3; g++) {
    const y = PAD_T + chartH - (g / 3) * chartH;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke();
    // Y-axis labels
    if (g > 0) {
      ctx.fillStyle = colText;
      ctx.font      = `${10 * dpr / dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round((g / 3) * maxVal), PAD_L - 4, y + 3.5);
    }
  }
  ctx.setLineDash([]);

  // Bars
  dailySales.forEach((d, i) => {
    const barH   = d.units > 0 ? Math.max(2, (d.units / maxVal) * chartH) : 0;
    const x      = PAD_L + i * gap + (gap - barW) / 2;
    const y      = PAD_T + chartH - barH;
    const isToday = d.day === today;

    // Bar fill
    ctx.fillStyle = isToday ? colBarH : colBar;
    if (barH > 0) {
      // Rounded top corners
      const r = Math.min(3, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, y + barH);
      ctx.lineTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    }

    // Value label on bar (only if tall enough)
    if (barH > 14 && d.units > 0) {
      ctx.fillStyle = '#fff';
      ctx.font      = `bold 9px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(d.units, x + barW / 2, y + 10);
    }

    // X-axis date labels: show every 5th day + today
    const showLabel = (i % 5 === 0 || isToday || i === nBars - 1);
    if (showLabel) {
      const label = d.day.slice(5); // MM-DD
      ctx.fillStyle = isToday ? colBar : colText;
      ctx.font      = isToday ? `bold 9px system-ui, sans-serif` : `9px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW / 2, H - 6);
    }
  });
}

// Expose for inline HTML handlers
window.openInventory        = openInventory;
window.populateInventory    = populateInventory;
window.importDimsFromSS     = importDimsFromSS;
window.loadInventoryView    = loadInventoryView;
window.switchInvTab         = switchInvTab;
window.renderStockTab       = renderStockTab;
window.showAdjustModal      = showAdjustModal;
window.setAdjType           = setAdjType;
window.setAdjSign           = setAdjSign;
window.submitAdjust         = submitAdjust;
window.showCreateParentModal = showCreateParentModal;
window.submitCreateParent    = submitCreateParent;
window.editInvSku           = editInvSku;
window.saveInvSku           = saveInvSku;
window.showSkuHistory       = showSkuHistory;
window.onRecvClientChange   = onRecvClientChange;
window.onRecvSkuInput       = onRecvSkuInput;
window.onRecvQtyInput       = onRecvQtyInput;
window.addReceiveRow        = addReceiveRow;
window.submitReceive        = submitReceive;
window.renderClientsTab     = renderClientsTab;
window.syncClientsFromStores = syncClientsFromStores;
window.showClientForm       = showClientForm;
window.hideClientForm       = hideClientForm;
window.saveClient           = saveClient;
window.deleteClient         = deleteClient;
window.loadHistoryTab       = loadHistoryTab;
window.renderLedgerTable    = renderLedgerTable;
window.toggleBulkDims       = toggleBulkDims;
window.saveBulkDims         = saveBulkDims;
window.cancelBulkDims       = cancelBulkDims;
window.openSkuDrawer        = openSkuDrawer;
