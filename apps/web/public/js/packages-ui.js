import { state } from './state.js';
import { escHtml } from './utils.js';

// ─── State ────────────────────────────────────────────────────────────────────
let _pkgAdjSign = 1;

// ─── Load / Render ─────────────────────────────────────────────────────────────
export async function loadPackages() {
  try {
    const r    = await fetch('/api/packages');
    const pkgs = await r.json();
    if (Array.isArray(pkgs)) state.packagesList = pkgs;
    await renderPackages();
  } catch (e) { console.warn('loadPackages:', e); }
}

export async function renderPackages() {
  const el = document.getElementById('packagesContent');
  if (!el) return;
  const { packagesList } = state;
  if (!packagesList.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📐</div><div>No packages yet. Add one or sync from ShipStation.</div></div>';
    return;
  }
  const custom  = packagesList.filter(p => p.source !== 'ss_carrier');
  const carrier = packagesList.filter(p => p.source === 'ss_carrier');

  // Update low-stock banner
  try {
    const lr     = await fetch('/api/packages/low-stock');
    const lowPkgs = await lr.json();
    const banner = document.getElementById('pkgLowStockBanner');
    if (banner) {
      if (lowPkgs.length > 0) {
        const items = lowPkgs.map(p => `${escHtml(p.name)} (${p.stockQty ?? 0} left)`).join(', ');
        banner.innerHTML = `⚠️ <strong>Low stock:</strong> ${items}`;
        banner.style.display = '';
      } else {
        banner.style.display = 'none';
      }
    }
  } catch {}

  const stockColor = p => {
    const qty = p.stockQty ?? 0;
    const lvl = p.reorderLevel ?? 10;
    if (qty <= 0)   return 'var(--red)';
    if (qty <= lvl) return 'var(--yellow,#f59e0b)';
    return 'var(--green)';
  };

  const customRow = p => {
    const dims = (p.length > 0 && p.width > 0 && p.height > 0) ? `${p.length}×${p.width}×${p.height}"` : '—';
    const tare = p.tareWeightOz > 0 ? `${p.tareWeightOz} oz` : '';
    const qty  = p.stockQty ?? 0;
    const lvl  = p.reorderLevel ?? 10;
    const cost = p.unitCost != null ? `$${parseFloat(p.unitCost).toFixed(3)}` : '—';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 10px;max-width:280px;overflow:hidden">
        <span style="font-weight:600;font-size:12px;color:var(--text);cursor:pointer;text-decoration:underline;text-decoration-color:var(--border);display:block"
          onclick="togglePkgLedger(${p.packageId}, this)">${escHtml(p.name)}</span>
        <div style="font-size:10.5px;color:var(--text3);margin-top:1px">${dims}${tare ? ' · ' + tare : ''}</div>
        <div id="pkg-ledger-${p.packageId}" style="display:none;margin-top:6px"></div>
      </td>
      <td style="padding:7px 8px;text-align:center;font-weight:700;font-size:13px;color:${stockColor(p)}">${qty}</td>
      <td style="padding:7px 8px;text-align:center">
        <input type="number" value="${lvl}" min="0" step="1" title="Reorder Level"
          style="width:50px;padding:3px 4px;border:1px solid var(--border2);border-radius:3px;background:var(--surface2);color:var(--text);font-size:11px;text-align:center"
          onchange="savePkgReorderLevel(${p.packageId}, this.value)">
      </td>
      <td style="padding:7px 8px;text-align:right;font-size:11.5px;color:var(--text2);font-family:monospace">${cost}</td>
      <td style="padding:7px 6px;text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-xs" title="Receive" onclick="showPkgReceiveModal(${p.packageId},'${escHtml(p.name).replace(/'/g,"\\'")}')">📥</button>
        <button class="btn btn-ghost btn-xs" title="Adjust" onclick="showPkgAdjustModal(${p.packageId},'${escHtml(p.name).replace(/'/g,"\\'")}')">±</button>
        <button class="btn btn-ghost btn-xs" title="Edit" onclick="editPkg(${p.packageId})">✏️</button>
        <button class="btn btn-ghost btn-xs" title="Default" onclick="setPkgBillingDefault(${p.packageId},'${escHtml(p.name).replace(/'/g,"\\'")}',${p.unitCost ?? 'null'})">📋</button>
        <button class="btn btn-ghost btn-xs" title="Delete" style="color:var(--red)" onclick="deletePkg(${p.packageId})">🗑</button>
      </td>
    </tr>`;
  };

  const carrierRow = p => {
    const dims = (p.length > 0 && p.width > 0 && p.height > 0) ? `${p.length}×${p.width}×${p.height}"` : '—';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:12.5px;color:var(--text)">${escHtml(p.name)}</div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">${dims}</div>
      </div>
    </div>`;
  };

  let html = '';
  if (custom.length) {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <div style="padding:8px 12px;background:var(--surface2);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">Custom Packages</div>
      <table class="pkg-table" style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
          <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;max-width:280px">Package</th>
          <th style="padding:5px 8px;text-align:center;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;width:60px">Stock</th>
          <th style="padding:5px 8px;text-align:center;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;width:75px">Reorder</th>
          <th style="padding:5px 8px;text-align:right;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;width:70px">Cost</th>
          <th style="padding:5px 6px;text-align:right;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.3px">Actions</th>
        </tr></thead>
        <tbody>${custom.map(customRow).join('')}</tbody>
      </table>
    </div>`;
  }
  el.innerHTML = html;
}

// ─── Form ──────────────────────────────────────────────────────────────────────
export function showPkgForm(pkg) {
  document.getElementById('pkgFormCard').style.display = '';
  document.getElementById('pkgFormTitle').textContent  = pkg ? 'Edit Package' : 'Add Package';
  document.getElementById('pkgFormId').value    = pkg?.packageId || '';
  document.getElementById('pkgFormName').value  = pkg?.name || '';
  document.getElementById('pkgFormType').value  = pkg?.type || 'box';
  document.getElementById('pkgFormTare').value  = pkg?.tareWeightOz || 0;
  document.getElementById('pkgFormL').value     = pkg?.length || 0;
  document.getElementById('pkgFormW').value     = pkg?.width  || 0;
  document.getElementById('pkgFormH').value     = pkg?.height || 0;
  document.getElementById('pkgFormCost').value  = pkg?.unitCost != null ? pkg.unitCost : '';
}

export function hidePkgForm() { document.getElementById('pkgFormCard').style.display = 'none'; }

export function editPkg(id) {
  const p = state.packagesList.find(p => p.packageId === id);
  if (p) showPkgForm(p);
}

export async function savePkg() {
  const id        = document.getElementById('pkgFormId').value;
  const costRaw   = document.getElementById('pkgFormCost').value;
  const body = {
    name:         document.getElementById('pkgFormName').value.trim(),
    type:         document.getElementById('pkgFormType').value,
    tareWeightOz: parseFloat(document.getElementById('pkgFormTare').value) || 0,
    length:       parseFloat(document.getElementById('pkgFormL').value) || 0,
    width:        parseFloat(document.getElementById('pkgFormW').value) || 0,
    height:       parseFloat(document.getElementById('pkgFormH').value) || 0,
    unitCost:     costRaw !== '' ? parseFloat(costRaw) : null,
  };
  if (!body.name) return window.showToast('⚠ Name is required');
  try {
    const r = await fetch(id ? `/api/packages/${id}` : '/api/packages', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error);
    window.showToast('✅ Package saved');
    hidePkgForm();
    await loadPackages();
  } catch (e) { window.showToast('❌ ' + e.message); }
}

export async function deletePkg(id) {
  if (!confirm('Delete this package?')) return;
  await fetch(`/api/packages/${id}`, { method:'DELETE' });
  await loadPackages();
}

export async function savePkgReorderLevel(packageId, level) {
  try {
    await fetch(`/api/packages/${packageId}/reorder-level`, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ reorderLevel: parseInt(level) || 0 }),
    });
  } catch (e) { window.showToast('❌ ' + e.message); }
}

// ─── Package Inventory Modals ─────────────────────────────────────────────────
export function showPkgReceiveModal(packageId, pkgName) {
  document.getElementById('pkgAdjModalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'pkgAdjModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:22px 24px;width:380px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">📥 Receive Stock</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px">${escHtml(pkgName)}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
        <input id="pkgAdjQty" type="number" min="1" step="1" value="1" placeholder="Qty"
          style="flex:1;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:14px;font-weight:700">
        <span style="font-size:12px;color:var(--text3)">units</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;color:var(--text3);white-space:nowrap">Cost/unit $</span>
        <input id="pkgAdjCost" type="number" min="0" step="0.001" placeholder="0.000 (optional)"
          style="flex:1;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:13px">
        <span style="font-size:10.5px;color:var(--text3);white-space:nowrap">updates unit cost</span>
      </div>
      <input id="pkgAdjNote" type="text" placeholder="Note (optional)" maxlength="120"
        style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;margin-bottom:14px">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('pkgAdjModalOverlay').remove()"
          style="padding:7px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px">Cancel</button>
        <button onclick="submitPkgReceive(${packageId})"
          style="padding:7px 16px;border-radius:6px;border:none;background:var(--green);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Receive</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.remove();
    if (e.key === 'Enter') submitPkgReceive(packageId);
  });
  document.body.appendChild(overlay);
  document.getElementById('pkgAdjQty').focus();
}

export function showPkgAdjustModal(packageId, pkgName) {
  document.getElementById('pkgAdjModalOverlay')?.remove();
  _pkgAdjSign = 1;
  const overlay = document.createElement('div');
  overlay.id = 'pkgAdjModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:22px 24px;width:340px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">± Adjust Stock</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px">${escHtml(pkgName)}</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button id="pkgAdjBtn-add" onclick="setPkgAdjSign(1)"
          style="flex:1;padding:7px;border-radius:6px;border:2px solid var(--ss-blue);background:var(--ss-blue);color:#fff;font-weight:700;cursor:pointer;font-size:13px">+ Add</button>
        <button id="pkgAdjBtn-rem" onclick="setPkgAdjSign(-1)"
          style="flex:1;padding:7px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:13px">− Remove</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
        <span style="font-size:13px;font-weight:700;color:var(--text);width:16px;text-align:center" id="pkgAdjSignLabel">+</span>
        <input id="pkgAdjQty" type="number" min="1" step="1" value="1" placeholder="Qty"
          style="flex:1;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:14px;font-weight:700">
      </div>
      <input id="pkgAdjNote" type="text" placeholder="Note (optional)" maxlength="120"
        style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;margin-bottom:14px">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('pkgAdjModalOverlay').remove()"
          style="padding:7px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px">Cancel</button>
        <button onclick="submitPkgAdjust(${packageId})"
          style="padding:7px 16px;border-radius:6px;border:none;background:var(--ss-blue);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Save</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.remove();
    if (e.key === 'Enter') submitPkgAdjust(packageId);
  });
  document.body.appendChild(overlay);
  document.getElementById('pkgAdjQty').focus();
}

export function setPkgAdjSign(sign) {
  _pkgAdjSign = sign;
  document.getElementById('pkgAdjSignLabel').textContent = sign > 0 ? '+' : '−';
  const addBtn = document.getElementById('pkgAdjBtn-add');
  const remBtn = document.getElementById('pkgAdjBtn-rem');
  if (sign > 0) {
    addBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--ss-blue);background:var(--ss-blue);color:#fff;font-weight:700;cursor:pointer;font-size:13px';
    remBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:13px';
  } else {
    addBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--border2);background:var(--surface2);color:var(--text);font-weight:700;cursor:pointer;font-size:13px';
    remBtn.style.cssText = 'flex:1;padding:7px;border-radius:6px;border:2px solid var(--red);background:var(--red);color:#fff;font-weight:700;cursor:pointer;font-size:13px';
  }
}

export async function submitPkgReceive(packageId) {
  const qty      = parseInt(document.getElementById('pkgAdjQty')?.value) || 0;
  const note     = document.getElementById('pkgAdjNote')?.value.trim() || '';
  const costRaw  = document.getElementById('pkgAdjCost')?.value;
  const costPer  = costRaw !== '' && costRaw != null ? parseFloat(costRaw) : null;
  if (!qty || qty <= 0) return window.showToast('⚠ Enter a positive quantity');
  document.getElementById('pkgAdjModalOverlay')?.remove();
  try {
    const r = await fetch(`/api/packages/${packageId}/receive`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ qty, note, costPerUnit: costPer }),
    });
    const d = await r.json();
    if (d.ok) {
      window.showToast(`✅ Received ${qty} units. New total: ${d.package?.stockQty ?? '?'}`);
      await loadPackages();
    } else { window.showToast('❌ ' + (d.error || 'Receive failed')); }
  } catch { window.showToast('❌ Network error'); }
}

export async function submitPkgAdjust(packageId) {
  const qty  = parseInt(document.getElementById('pkgAdjQty')?.value) || 0;
  const note = document.getElementById('pkgAdjNote')?.value.trim() || '';
  if (!qty || qty <= 0) return window.showToast('⚠ Enter a positive quantity');
  const finalQty  = _pkgAdjSign * qty;
  const finalNote = note || (finalQty > 0 ? 'Manual add' : 'Manual remove');
  document.getElementById('pkgAdjModalOverlay')?.remove();
  try {
    const r = await fetch(`/api/packages/${packageId}/adjust`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ qty: finalQty, note: finalNote }),
    });
    const d = await r.json();
    if (d.ok) {
      window.showToast(`✅ Adjusted. New total: ${d.package?.stockQty ?? '?'}`);
      await loadPackages();
    } else { window.showToast('❌ ' + (d.error || 'Adjust failed')); }
  } catch { window.showToast('❌ Network error'); }
}

export async function togglePkgLedger(packageId, _nameEl) {
  const ledgerDiv = document.getElementById(`pkg-ledger-${packageId}`);
  if (!ledgerDiv) return;
  if (ledgerDiv.style.display !== 'none') { ledgerDiv.style.display = 'none'; return; }
  ledgerDiv.style.display = '';
  ledgerDiv.innerHTML = '<span style="font-size:11px;color:var(--text3)">Loading…</span>';
  try {
    const r    = await fetch(`/api/packages/${packageId}/ledger`);
    const rows = await r.json();
    if (!rows.length) { ledgerDiv.innerHTML = '<span style="font-size:11px;color:var(--text3)">No history yet</span>'; return; }
    ledgerDiv.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;color:var(--text2)">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--text3)">Date</th>
        <th style="text-align:center;padding:3px 6px;font-size:10px;color:var(--text3)">Change</th>
        <th style="text-align:right;padding:3px 6px;font-size:10px;color:var(--text3)">Cost/unit</th>
        <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--text3)">Reason</th>
        <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--text3)">Order</th>
      </tr></thead>
      <tbody>
        ${rows.map(row => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:3px 6px;white-space:nowrap">${new Date(row.createdAt).toLocaleDateString()}</td>
          <td style="text-align:center;padding:3px 6px;font-weight:700;color:${row.delta > 0 ? 'var(--green)' : 'var(--red)'}">${row.delta > 0 ? '+' : ''}${row.delta}</td>
          <td style="text-align:right;padding:3px 6px;color:var(--text3)">${row.unitCost != null ? '$' + parseFloat(row.unitCost).toFixed(3) : '—'}</td>
          <td style="padding:3px 6px">${escHtml(row.reason || '—')}</td>
          <td style="padding:3px 6px">${row.orderId ? `<a href="#" onclick="event.preventDefault();openOrder(${row.orderId})" style="color:var(--ss-blue)">#${row.orderId}</a>` : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } catch { ledgerDiv.innerHTML = '<span style="font-size:11px;color:var(--red)">Failed to load</span>'; }
}

// ─── Set billing default for all clients ──────────────────────────────────────
export async function setPkgBillingDefault(packageId, pkgName, currentCost) {
  // Show confirm modal with price input
  document.getElementById('pkgDefaultModalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'pkgDefaultModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center';
  const suggestedPrice = currentCost != null ? parseFloat(currentCost).toFixed(2) : '';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:22px 24px;width:360px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">📋 Set Billing Default</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:14px">${escHtml(pkgName)}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">
        This will set the billing charge for <strong>all clients</strong> that haven't manually overridden their price.
        Clients with custom prices will <strong>not</strong> be changed.
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <span style="font-size:13px;color:var(--text2);white-space:nowrap">Billing charge $</span>
        <input id="pkgDefaultPrice" type="number" min="0" step="0.01" value="${suggestedPrice}" placeholder="0.00"
          style="flex:1;padding:7px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--surface2);color:var(--text);font-size:14px;font-weight:700;text-align:right">
        <span style="font-size:11px;color:var(--text3);white-space:nowrap">per box</span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('pkgDefaultModalOverlay').remove()"
          style="padding:7px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px">Cancel</button>
        <button onclick="confirmPkgBillingDefault(${packageId})"
          style="padding:7px 16px;border-radius:6px;border:none;background:var(--ss-blue);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Set Default</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.remove();
    if (e.key === 'Enter') confirmPkgBillingDefault(packageId);
  });
  document.body.appendChild(overlay);
  const input = document.getElementById('pkgDefaultPrice');
  input.focus();
  input.select();
}

export async function confirmPkgBillingDefault(packageId) {
  const price = parseFloat(document.getElementById('pkgDefaultPrice')?.value);
  if (isNaN(price) || price < 0) return window.showToast('⚠ Enter a valid price');
  document.getElementById('pkgDefaultModalOverlay')?.remove();
  try {
    const r = await fetch('/api/billing/package-prices/set-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId, price }),
    });
    const d = await r.json();
    if (d.ok) {
      window.showToast(`✅ Default set for ${d.updated} client${d.updated !== 1 ? 's' : ''}${d.skipped ? ` · ${d.skipped} skipped (custom override)` : ''}`);
    } else {
      window.showToast('❌ ' + (d.error || 'Failed'));
    }
  } catch { window.showToast('❌ Network error'); }
}

export async function syncCarrierPackages() {
  const btn = document.getElementById('pkgSyncBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  try {
    await fetch('/api/packages/sync', { method:'POST' });
    await new Promise(r => setTimeout(r, 3000));
    await loadPackages();
    window.showToast('✅ Carrier packages synced');
  } catch (e) { window.showToast('❌ ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '↻ Sync from ShipStation'; } }
}

// ─── Window exports ────────────────────────────────────────────────────────────
window.loadPackages        = loadPackages;
window.renderPackages      = renderPackages;
window.showPkgForm         = showPkgForm;
window.hidePkgForm         = hidePkgForm;
window.editPkg             = editPkg;
window.savePkg             = savePkg;
window.deletePkg           = deletePkg;
window.savePkgReorderLevel = savePkgReorderLevel;
window.showPkgReceiveModal = showPkgReceiveModal;
window.showPkgAdjustModal  = showPkgAdjustModal;
window.setPkgAdjSign       = setPkgAdjSign;
window.submitPkgReceive    = submitPkgReceive;
window.submitPkgAdjust     = submitPkgAdjust;
window.togglePkgLedger     = togglePkgLedger;
window.syncCarrierPackages    = syncCarrierPackages;
window.setPkgBillingDefault   = setPkgBillingDefault;
window.confirmPkgBillingDefault = confirmPkgBillingDefault;
