import { state } from './state.js';
import { COLS } from './constants.js';
import { escHtml } from './utils.js';

// ═══════════════════════════════════════════════
//  TABLE HEAD
// ═══════════════════════════════════════════════
export function buildTableHead() {
  const tr = document.querySelector('#tableHead tr');
  if (!tr) return;
  tr.innerHTML = COLS.map(c => {
    const isSorted  = state.sortState.key === c.key;
    const sortClass = c.sort ? (isSorted ? `sortable sort-${state.sortState.dir}` : 'sortable') : '';
    const sortClick = c.sort ? `onclick="clickSort('${c.sort}')"` : '';
    const arrow     = c.sort ? `<span class="sort-arrow"></span>` : '';
    const resizer   = c.key !== 'select' ? `<div class="col-resizer" onmousedown="startResize(event,'${c.key}')" onclick="event.stopPropagation()" ondragstart="event.stopPropagation()"></div>` : '';
    const draggable = c.key !== 'select' ? `draggable="true" ondragstart="colDragStart(event,'${c.key}')" ondragover="colDragOver(event,'${c.key}')" ondrop="colDrop(event,'${c.key}')" ondragend="colDragEnd()"` : '';
    return `<th data-col="${c.key}" class="${sortClass}" style="width:${state.colWidths[c.key]}px;position:relative" ${sortClick} ${draggable}>${c.label}${arrow}${resizer}</th>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  COLUMN DROPDOWN
// ═══════════════════════════════════════════════
export function buildColDropdown() {
  const dd  = document.getElementById('colDropdown');
  if (!dd) return;
  const tog = COLS.filter(c => c.toggleable);
  dd.innerHTML = '<div class="col-dropdown-header">Toggle & Reorder Columns</div>' +
    tog.map(c => `<div class="col-dd-item" draggable="true" data-colkey="${c.key}" style="display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:grab;border-radius:4px;transition:background .15s"
        ondragstart="colDdDragStart(event,'${c.key}')" ondragover="colDdDragOver(event,'${c.key}')" ondrop="colDdDrop(event,'${c.key}')" ondragend="colDdDragEnd()">
      <span style="color:var(--text4);font-size:10px;cursor:grab">⠿</span>
      <label style="flex:1;display:flex;align-items:center;gap:6px;margin:0;cursor:pointer">
        <input type="checkbox" ${state.hiddenCols.has(c.key) ? '' : 'checked'} onchange="toggleColVisibility('${c.key}',this.checked)">
        ${c.label}
      </label>
    </div>`).join('');
}

export function toggleColDropdown() {
  const dd = document.getElementById('colDropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

export function toggleColVisibility(key, visible) {
  if (visible) state.hiddenCols.delete(key);
  else state.hiddenCols.add(key);
  saveColPrefs();
  buildTableHead();
  if (typeof window.renderOrders === 'function') window.renderOrders();
}

export function applyColVisibility() {
  const isAwaiting = state.currentStatus === 'awaiting_shipment';
  const autoHidden = new Set();
  if (!isAwaiting) autoHidden.add('age');
  if (isAwaiting)  autoHidden.add('tracking');

  COLS.forEach(col => {
    const hidden = state.hiddenCols.has(col.key) || autoHidden.has(col.key);
    document.querySelectorAll(`[data-col="${col.key}"]`).forEach(el => {
      el.style.display = hidden ? 'none' : '';
    });
  });
}

// ═══════════════════════════════════════════════
//  COLUMN PREFS (server-persisted)
// ═══════════════════════════════════════════════
let _colPrefTimer = null;

export function saveColPrefs() {
  clearTimeout(_colPrefTimer);
  _colPrefTimer = setTimeout(() => {
    const prefs = { order: COLS.map(c => c.key), hidden: [...state.hiddenCols], widths: state.colWidths };
    fetch('/api/settings/colPrefs', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs)
    }).catch(() => {});
  }, 400);
}

export async function loadColPrefs() {
  try {
    const prefs = await fetch('/api/settings/colPrefs').then(r => r.json());
    if (!prefs) return;
    if (Array.isArray(prefs.hidden)) state.hiddenCols = new Set(prefs.hidden);
    if (prefs.widths) Object.assign(state.colWidths, prefs.widths);
    if (Array.isArray(prefs.order) && prefs.order.length) {
      const orderMap = {};
      prefs.order.forEach((k, i) => orderMap[k] = i);
      COLS.sort((a, b) => {
        const ai = orderMap[a.key] ?? 999;
        const bi = orderMap[b.key] ?? 999;
        return ai - bi;
      });
    }
  } catch {}
}

// ═══════════════════════════════════════════════
//  SORT
// ═══════════════════════════════════════════════
export function getOrderPrimarySku(o) {
  const item = o.items.find(i => !i.adjustment);
  return (item?.sku || item?.name || '').toLowerCase().trim();
}

export function getOrderTotalQty(o) {
  return o.items.filter(i => !i.adjustment).reduce((s, i) => s + (i.quantity || 1), 0);
}

export function sortFilteredOrders() {
  if (state.skuSortActive) {
    state.filteredOrders.sort((a, b) => {
      const skuA = getOrderPrimarySku(a), skuB = getOrderPrimarySku(b);
      if (skuA < skuB) return -1;
      if (skuA > skuB) return  1;
      const qA = getOrderTotalQty(a), qB = getOrderTotalQty(b);
      return qA - qB;
    });
    return;
  }

  const { key, dir } = state.sortState;
  if (!key) return;
  const d = dir === 'asc' ? 1 : -1;
  state.filteredOrders.sort((a, b) => {
    let va, vb;
    switch (key) {
      case 'date':
      case 'age':      va = a.orderDate || '';    vb = b.orderDate || '';    break;
      case 'orderNum': va = a.orderNumber || '';  vb = b.orderNumber || '';  break;
      case 'client': {
        const { getStoreName } = window._storesFns || {};
        va = (getStoreName ? getStoreName(a) : '').toLowerCase();
        vb = (getStoreName ? getStoreName(b) : '').toLowerCase();
        break;
      }
      case 'customer': va = (a.shipTo?.name || '').toLowerCase(); vb = (b.shipTo?.name || '').toLowerCase(); break;
      case 'itemname': va = (a.items.find(i => !i.adjustment)?.name || '').toLowerCase();
                       vb = (b.items.find(i => !i.adjustment)?.name || '').toLowerCase(); break;
      case 'sku':      va = (a.items.find(i => !i.adjustment)?.sku || '').toLowerCase();
                       vb = (b.items.find(i => !i.adjustment)?.sku || '').toLowerCase(); break;
      case 'qty':      va = a.items.filter(i => !i.adjustment).reduce((s, i) => s + i.quantity, 0);
                       vb = b.items.filter(i => !i.adjustment).reduce((s, i) => s + i.quantity, 0); break;
      case 'weight':   va = a.weight?.value || 0;  vb = b.weight?.value || 0;  break;
      case 'shipto':   va = ((a.shipTo?.state || '') + (a.shipTo?.city || '')).toLowerCase();
                       vb = ((b.shipTo?.state || '') + (b.shipTo?.city || '')).toLowerCase(); break;
      case 'carrier':      va = (a.carrierCode || '') + (a.serviceCode || ''); vb = (b.carrierCode || '') + (b.serviceCode || ''); break;
      case 'custcarrier': {
        const { getShipAcct } = window._storesFns || {};
        va = (getShipAcct ? getShipAcct(a) : '').toLowerCase();
        vb = (getShipAcct ? getShipAcct(b) : '').toLowerCase();
        break;
      }
      case 'total':    va = a.orderTotal || 0; vb = b.orderTotal || 0; break;
      default: return 0;
    }
    if (va < vb) return -d;
    if (va > vb) return  d;
    return 0;
  });
}

export function clickSort(key) {
  if (state.skuSortActive) {
    state.skuSortActive = false;
    const btn = document.getElementById('btnSkuSort');
    if (btn) {
      btn.style.borderColor = 'var(--border2)';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text2)';
      btn.textContent = '📋 SKU Sort';
    }
  }
  if (state.sortState.key === key) {
    state.sortState.dir = state.sortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortState.key = key;
    state.sortState.dir = key === 'date' || key === 'age' ? 'desc' : 'asc';
  }
  sortFilteredOrders();
  buildTableHead();
  if (typeof window.renderOrders === 'function') window.renderOrders();
}

export function toggleSkuSort() {
  state.skuSortActive = !state.skuSortActive;
  const btn = document.getElementById('btnSkuSort');
  if (btn) {
    btn.style.borderColor = state.skuSortActive ? 'var(--ss-blue)' : 'var(--border2)';
    btn.style.background  = state.skuSortActive ? 'var(--ss-blue-bg)' : 'transparent';
    btn.style.color       = state.skuSortActive ? 'var(--ss-blue)' : 'var(--text2)';
    btn.textContent       = state.skuSortActive ? '📋 SKU Sort ✓' : '📋 SKU Sort';
  }
  if (state.skuSortActive) {
    state.preSkuSortSnapshot = state.filteredOrders.map(o => o.orderId);
    sortFilteredOrders();
  } else {
    if (state.preSkuSortSnapshot) {
      const byId = Object.fromEntries(state.filteredOrders.map(o => [o.orderId, o]));
      state.filteredOrders = state.preSkuSortSnapshot.map(id => byId[id]).filter(Boolean);
      state.preSkuSortSnapshot = null;
    }
  }
  if (typeof window.renderOrders === 'function') window.renderOrders();
}

// ═══════════════════════════════════════════════
//  PAGINATION
// ═══════════════════════════════════════════════
export function changePage(d) {
  const p = state.currentPage + d;
  if (p < 1 || p > state.totalPages) return;
  if (typeof window.fetchOrders === 'function') window.fetchOrders(p);
}

export function updatePagination() {
  document.getElementById('pageInfo').textContent  = `Page ${state.currentPage} of ${state.totalPages}`;
  document.getElementById('totalInfo').textContent = `${state.totalOrders.toLocaleString()} total`;
  document.getElementById('prevBtn').disabled = state.currentPage <= 1;
  document.getElementById('nextBtn').disabled = state.currentPage >= state.totalPages;
}

// ═══════════════════════════════════════════════
//  KEYBOARD ROW FOCUS
// ═══════════════════════════════════════════════
export function setKbRow(idx) {
  if (state.kbRowIndex === idx) return;
  document.querySelectorAll('.row-kb-focus').forEach(r => r.classList.remove('row-kb-focus'));
  state.kbRowIndex = idx;
  const o = state.filteredOrders[idx];
  if (o) document.getElementById(`row-${o.orderId}`)?.classList.add('row-kb-focus');
}

// ═══════════════════════════════════════════════
//  COLUMN RESIZE
// ═══════════════════════════════════════════════
let resizeState = null;

export function startResize(e, colKey) {
  e.preventDefault();
  const th = e.target.closest('th');
  resizeState = { colKey, startX: e.clientX, startWidth: th.offsetWidth, th };
  document.body.classList.add('resizing-active');
}

document.addEventListener('mousemove', e => {
  if (!resizeState) return;
  const nw = Math.max(40, resizeState.startWidth + (e.clientX - resizeState.startX));
  state.colWidths[resizeState.colKey] = nw;
  resizeState.th.style.width = nw + 'px';
  if (resizeState.colKey === 'itemname') {
    document.querySelectorAll('.cell-itemname').forEach(el => el.style.maxWidth = nw + 'px');
  }
});

document.addEventListener('mouseup', () => {
  if (resizeState) {
    resizeState = null;
    document.body.classList.remove('resizing-active');
    saveColPrefs();
  }
});

// ═══════════════════════════════════════════════
//  COLUMN DRAG-TO-REORDER (table header)
// ═══════════════════════════════════════════════
let dragSrcCol = null;

export function colDragStart(e, key) {
  if (resizeState) { e.preventDefault(); return; }
  dragSrcCol = key;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', key);
  setTimeout(() => e.target.classList.add('col-dragging'), 0);
}

export function colDragOver(e, key) {
  if (!dragSrcCol || key === dragSrcCol || key === 'select') return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.col-drag-over').forEach(el => el.classList.remove('col-drag-over'));
  e.currentTarget.classList.add('col-drag-over');
}

export function colDrop(e, key) {
  if (!dragSrcCol || key === dragSrcCol || key === 'select') return;
  e.preventDefault();
  const srcIdx = COLS.findIndex(c => c.key === dragSrcCol);
  const tgtIdx = COLS.findIndex(c => c.key === key);
  if (srcIdx >= 0 && tgtIdx >= 0) {
    const [col] = COLS.splice(srcIdx, 1);
    COLS.splice(tgtIdx, 0, col);
  }
  colDragEnd();
  saveColPrefs();
  buildTableHead();
  if (typeof window.renderOrders === 'function') window.renderOrders();
}

export function colDragEnd() {
  dragSrcCol = null;
  document.querySelectorAll('.col-dragging, .col-drag-over').forEach(el => {
    el.classList.remove('col-dragging', 'col-drag-over');
  });
}

// ═══════════════════════════════════════════════
//  COLUMN DROPDOWN DRAG (settings dropdown)
// ═══════════════════════════════════════════════
let _ddDragKey = null;

export function colDdDragStart(e, key) {
  _ddDragKey = key;
  e.dataTransfer.effectAllowed = 'move';
  e.target.style.opacity = '.4';
}

export function colDdDragOver(e, key) {
  if (!_ddDragKey || key === _ddDragKey) return;
  e.preventDefault();
  e.currentTarget.style.background = 'var(--ss-blue-bg)';
}

export function colDdDrop(e, key) {
  if (!_ddDragKey || key === _ddDragKey) return;
  e.preventDefault();
  const srcIdx = COLS.findIndex(c => c.key === _ddDragKey);
  const tgtIdx = COLS.findIndex(c => c.key === key);
  if (srcIdx >= 0 && tgtIdx >= 0) {
    const [col] = COLS.splice(srcIdx, 1);
    COLS.splice(tgtIdx, 0, col);
  }
  colDdDragEnd();
  saveColPrefs();
  buildTableHead();
  if (typeof window.renderOrders === 'function') window.renderOrders();
  buildColDropdown();
}

export function colDdDragEnd() {
  _ddDragKey = null;
  document.querySelectorAll('.col-dd-item').forEach(el => {
    el.style.opacity = '';
    el.style.background = '';
  });
}

// Close dropdowns on outside click
document.addEventListener('click', e => {
  document.querySelectorAll('.col-toggle-wrap').forEach(wrap => {
    if (!wrap.contains(e.target)) {
      const dd = wrap.querySelector('.col-dropdown, #zoomMenu');
      if (dd) dd.style.display = 'none';
    }
  });
});

// ═══════════════════════════════════════════════
//  STATS BAR
// ═══════════════════════════════════════════════
export function updateStats() {
  const isAwaiting = state.currentStatus === 'awaiting_shipment';
  const chipsBar   = document.getElementById('chipsBar');
  if (chipsBar) chipsBar.style.display = isAwaiting ? '' : 'none';
  // Show/hide picklist button for awaiting_shipment only
  const picklistBtn = document.getElementById('picklistBtn');
  if (picklistBtn) picklistBtn.style.display = isAwaiting ? '' : 'none';
}

// ═══════════════════════════════════════════════
//  BATCH BAR
// ═══════════════════════════════════════════════
export function updateBatchBar() {
  const n = state.selectedOrders.size;
  document.getElementById('batchCount').textContent = `${n} order${n !== 1 ? 's' : ''} selected`;
  document.getElementById('batchBar').classList.toggle('show', n > 0);
}

// Expose to window for inline HTML calls
window.clickSort         = clickSort;
window.startResize       = startResize;
window.colDragStart      = colDragStart;
window.colDragOver       = colDragOver;
window.colDrop           = colDrop;
window.colDragEnd        = colDragEnd;
window.colDdDragStart    = colDdDragStart;
window.colDdDragOver     = colDdDragOver;
window.colDdDrop         = colDdDrop;
window.colDdDragEnd      = colDdDragEnd;
window.toggleColDropdown = toggleColDropdown;
window.toggleColVisibility = toggleColVisibility;
window.toggleSkuSort     = toggleSkuSort;
window.changePage        = changePage;
window.setKbRow          = setKbRow;
