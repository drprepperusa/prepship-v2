import { state } from './state.js';
import { escHtml, showToast } from './utils.js';
import { fetchValidatedJson } from './api-client.js';
import { parseAnalysisDailySalesResponse, parseAnalysisSkusResponse, parseClientDtoList } from './api-contracts.js';

const CHART_COLORS = ['#2a5bd7','#16a34a','#e07a00','#c62828','#7c3aed','#0891b2','#be185d','#92400e'];

export async function initAnalysisView() {
  const sel = document.getElementById('analysis-client');
  if (sel && sel.options.length <= 1) {
    try {
      const clients = await fetchValidatedJson('/api/clients', undefined, parseClientDtoList);
      clients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.clientId;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    } catch {}
  }

  // ── Restore saved date range ──────────────────────────────────────────────
  const savedPreset = localStorage.getItem('analysis_preset_days');
  if (savedPreset !== null) {
    const days = parseInt(savedPreset);
    const btn  = document.querySelector(`.analysis-preset[data-days="${days}"]`);
    if (btn) { setAnalysisPreset(btn, days); return; }
  }
  // Restore custom from/to if no preset saved
  const savedFrom = localStorage.getItem('analysis_from');
  const savedTo   = localStorage.getItem('analysis_to');
  const fromEl    = document.getElementById('analysis-from');
  const toEl      = document.getElementById('analysis-to');
  if (savedFrom && fromEl) fromEl.value = savedFrom;
  if (savedTo   && toEl)   toEl.value   = savedTo;
  loadAnalysis();
}

export function setAnalysisPreset(btn, days) {
  document.querySelectorAll('.analysis-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const toEl   = document.getElementById('analysis-to');
  const fromEl = document.getElementById('analysis-from');
  const today  = new Date();
  const pad    = n => String(n).padStart(2, '0');
  const fmt    = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  toEl.value   = fmt(today);
  fromEl.value = days === 0 ? '' : (() => { const f = new Date(today); f.setDate(f.getDate()-days); return fmt(f); })();
  localStorage.setItem('analysis_preset_days', days);
  loadAnalysis();
}

export async function loadAnalysis() {
  const toEl   = document.getElementById('analysis-to');
  const fromEl = document.getElementById('analysis-from');
  if (toEl && !toEl.value) {
    const today = new Date();
    const pad   = n => String(n).padStart(2, '0');
    const fmt   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    toEl.value  = fmt(today);
    const f = new Date(today); f.setDate(f.getDate()-30);
    if (fromEl && !fromEl.value) fromEl.value = fmt(f);
  }
  const from     = fromEl?.value || '';
  const to       = toEl?.value   || '';
  const clientId = document.getElementById('analysis-client')?.value || '';

  // Persist current range so hard refresh restores it.
  // If no preset button is active, the user changed dates manually — clear saved preset.
  if (from) localStorage.setItem('analysis_from', from);
  if (to)   localStorage.setItem('analysis_to',   to);
  if (!document.querySelector('.analysis-preset.active')) {
    localStorage.removeItem('analysis_preset_days');
  }
  const loading  = document.getElementById('analysis-loading');
  const tbody    = document.getElementById('analysis-tbody');
  if (!tbody) return;

  if (loading) loading.style.display = 'block';
  tbody.innerHTML = '';

  try {
    const params = new URLSearchParams();
    if (from)     params.set('from', from);
    if (to)       params.set('to',   to);
    if (clientId) params.set('clientId', clientId);

    // Fetch SKU table and daily chart data in parallel
    const chartParams = new URLSearchParams();
    if (from)     chartParams.set('from', from);
    if (to)       chartParams.set('to', to);
    if (clientId) chartParams.set('clientId', clientId);

    const [data, chartData] = await Promise.all([
      fetchValidatedJson(`/api/analysis/skus?${params}`, undefined, parseAnalysisSkusResponse),
      fetchValidatedJson(`/api/analysis/daily-sales?${chartParams}`, undefined, parseAnalysisDailySalesResponse).catch(() => null),
    ]);

    state.analysisData = data.skus || [];
    const summary = document.getElementById('analysis-summary');
    if (summary) summary.textContent = `${state.analysisData.length} SKUs · ${(data.orderCount||0).toLocaleString()} orders`;

    renderAnalysisTable();
    renderAnalysisChart(chartData);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--red)">Error: ${e.message}</td></tr>`;
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

export function filterAnalysisTable() { renderAnalysisTable(); }

export function sortAnalysis(key) {
  if (state.analysisSortKey === key) {
    state.analysisSortDir = state.analysisSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.analysisSortKey = key;
    state.analysisSortDir = (key === 'name' || key === 'sku' || key === 'client') ? 'asc' : 'desc';
  }
  renderAnalysisTable();
}

export function renderAnalysisTable() {
  const tbody = document.getElementById('analysis-tbody');
  if (!tbody) return;

  const _sortLabels = { name:'Item Name', sku:'SKU', client:'Client', orders:'Orders', pending:'Pending', external:'Ext. Shipped', qty:'Total Qty', stdOrders:'Std Orders', expOrders:'Exp Orders', total:'Total Shipping' };
  document.querySelectorAll('#analysis-table th[onclick^="sortAnalysis"]').forEach(th => {
    const m = th.getAttribute('onclick').match(/sortAnalysis\('([^']+)'\)/);
    if (!m) return;
    const k = m[1];
    th.textContent = (_sortLabels[k] || k) + (k === state.analysisSortKey ? (state.analysisSortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕');
  });

  const q   = (document.getElementById('analysis-search')?.value || '').toLowerCase();
  let rows  = state.analysisData.filter(r =>
    !q || (r.sku||'').toLowerCase().includes(q) || (r.name||'').toLowerCase().includes(q)
  );

  const dir = state.analysisSortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let va, vb;
    switch (state.analysisSortKey) {
      case 'name':        va = (a.name||'').toLowerCase();      vb = (b.name||'').toLowerCase();      break;
      case 'sku':         va = (a.sku||'').toLowerCase();       vb = (b.sku||'').toLowerCase();       break;
      case 'client':      va = (a.clientName||'').toLowerCase();vb = (b.clientName||'').toLowerCase();break;
      case 'orders':      va = a.orders;              vb = b.orders;              break;
      case 'pending':     va = a.pendingOrders;       vb = b.pendingOrders;       break;
      case 'external':    va = a.externalOrders;      vb = b.externalOrders;      break;
      case 'qty':         va = a.qty;                 vb = b.qty;                 break;
      case 'stdOrders':   va = a.standardShipCount;    vb = b.standardShipCount;   break;
      case 'expOrders':   va = a.expeditedShipCount;   vb = b.expeditedShipCount;  break;
      case 'total':       va = a.totalShipping;       vb = b.totalShipping;       break;
      default: va = vb = 0;
    }
    if (va < vb) return -dir;
    if (va > vb) return  dir;
    return 0;
  });

  if (!rows.length) {
    const tfoot = document.getElementById('analysis-tfoot');
    if (tfoot) tfoot.innerHTML = '';
    tbody.innerHTML = `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--text3)">${q ? 'No results matching your search' : 'No orders in this date range'}</td></tr>`;
    return;
  }
  const maxQty = Math.max(...rows.map(r => r.qty), 1);

  tbody.innerHTML = rows.map(r => {
    const barW = Math.round((r.qty / maxQty) * 80);
    const totS    = r.totalShipping > 0 ? `$${r.totalShipping.toFixed(2)}` : '<span style="color:var(--text3)">—</span>';
    const pendingCell = (r.pendingOrders || 0) > 0
      ? `<span style="color:#e07a00;font-weight:600">${r.pendingOrders}</span><span style="font-size:10px;color:var(--text4);margin-left:2px">pend</span>`
      : `<span style="color:var(--border2)">—</span>`;
    const extCell = r.externalOrders > 0
      ? `<span style="color:var(--text3);font-weight:600">${r.externalOrders}</span><span style="font-size:10px;color:var(--text4);margin-left:2px">ext</span>`
      : `<span style="color:var(--border2)">—</span>`;
    const stdCell = r.standardShipCount > 0
      ? `<span style="font-weight:600">${r.standardShipCount}</span><span style="font-size:10px;color:var(--green);margin-left:3px">$${r.standardAvgShipping.toFixed(2)}</span>`
      : `<span style="color:var(--border2)">—</span>`;
    const expCell = r.expeditedShipCount > 0
      ? `<span style="font-weight:600;color:#e07a00">${r.expeditedShipCount}</span><span style="font-size:10px;color:var(--text3);margin-left:3px">$${r.expeditedAvgShipping.toFixed(2)}</span>`
      : `<span style="color:var(--border2)">—</span>`;
    const clickable = r.invSkuId ? `cursor:pointer;` : '';
    const hoverAttrs = r.invSkuId
      ? `onclick="window.openSkuDrawer(${r.invSkuId})" title="View SKU details"
         onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"` : '';
    return `<tr style="${clickable}" ${hoverAttrs}>
      <td style="padding:5px 8px;max-width:200px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${escHtml(r.name)}">${escHtml(r.name)}</div></td>
      <td style="padding:5px 8px;font-family:monospace;font-size:11px">${r.sku ? escHtml(r.sku) : '<span style="color:var(--text3)">—</span>'}</td>
      <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${escHtml(r.clientName||'—')}</td>
      <td style="padding:5px 8px;text-align:right;font-size:12px;font-weight:600">${r.orders}</td>
      <td style="padding:5px 8px;text-align:right;font-size:12px">${pendingCell}</td>
      <td style="padding:5px 8px;text-align:right;font-size:12px">${extCell}</td>
      <td style="padding:5px 8px;text-align:right">
        <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end">
          <div style="width:${barW}px;height:5px;background:var(--ss-blue);border-radius:3px;opacity:.55"></div>
          <span style="font-weight:600;font-size:12px">${r.qty.toLocaleString()}</span>
        </div>
      </td>
      <td style="padding:5px 8px;text-align:right;white-space:nowrap">${stdCell}</td>
      <td style="padding:5px 8px;text-align:right;white-space:nowrap">${expCell}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:700;font-size:12px">${totS}</td>
    </tr>`;
  }).join('');

  // ── Totals bar ────────────────────────────────────────────────────────────
  const tfoot = document.getElementById('analysis-tfoot');
  if (tfoot) {
    const totalOrders   = rows.reduce((s, r) => s + (r.orders            || 0), 0);
    const totalPending  = rows.reduce((s, r) => s + (r.pendingOrders     || 0), 0);
    const totalExternal = rows.reduce((s, r) => s + (r.externalOrders    || 0), 0);
    const totalQty      = rows.reduce((s, r) => s + (r.qty               || 0), 0);
    const totalStdCnt   = rows.reduce((s, r) => s + (r.standardShipCount || 0), 0);
    const totalExpCnt   = rows.reduce((s, r) => s + (r.expeditedShipCount|| 0), 0);
    const totalShip     = rows.reduce((s, r) => s + (r.totalShipping     || 0), 0);
    tfoot.innerHTML = `<tr style="background:var(--surface2);border-top:2px solid var(--border);font-weight:700">
      <td colspan="3" style="padding:6px 8px;font-size:11.5px;color:var(--text2)">
        <span style="color:var(--text3);font-weight:400;font-size:10.5px;margin-right:8px">TOTALS</span>${rows.length.toLocaleString()} SKUs
      </td>
      <td style="padding:6px 8px;text-align:right;font-size:11.5px">${totalOrders.toLocaleString()}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px;color:#e07a00">${totalPending > 0 ? totalPending.toLocaleString() : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px;color:var(--text3)">${totalExternal > 0 ? totalExternal.toLocaleString() : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11.5px">${totalQty.toLocaleString()}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px">${totalStdCnt > 0 ? totalStdCnt.toLocaleString() : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-size:11px;color:#e07a00">${totalExpCnt > 0 ? totalExpCnt.toLocaleString() : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-size:12px">${totalShip > 0 ? `$${totalShip.toFixed(2)}` : '—'}</td>
    </tr>`;
  }
}

// ── Daily Sales Chart (Canvas) ────────────────────────────────────────────────
let _chartOrigFrom = null;
let _chartOrigTo   = null;

function drawChartBase(canvas, highlightIdx, dragX1, dragX2) {
  const m   = canvas._meta;
  if (!m) return;
  const { W, H, PAD, cW, cH, data, maxVal } = m;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Grid + y-axis
  ctx.strokeStyle = '#e2e6ea'; ctx.lineWidth = 1;
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = PAD.top + cH - (i / yTicks) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#8a95a3'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round((i / yTicks) * maxVal), PAD.left - 4, y + 3);
  }

  // X-axis labels
  const dates = data.dates;
  const step  = Math.max(1, Math.floor(dates.length / 6));
  ctx.fillStyle = '#8a95a3'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
  dates.forEach((d, i) => {
    if (i % step !== 0 && i !== dates.length - 1) return;
    const x = PAD.left + (i / Math.max(dates.length - 1, 1)) * cW;
    ctx.fillText(d.slice(5), x, H - 8);
  });

  // Lines + fills
  data.topSkus.forEach((s, si) => {
    const vals  = data.series[s.sku] || [];
    const color = CHART_COLORS[si % CHART_COLORS.length];
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = PAD.left + (i / Math.max(vals.length - 1, 1)) * cW;
      const y = PAD.top  + cH - (v / maxVal) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 0.07; ctx.fillStyle = color;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = PAD.left + (i / Math.max(vals.length - 1, 1)) * cW;
      const y = PAD.top  + cH - (v / maxVal) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(PAD.left + cW, PAD.top + cH); ctx.lineTo(PAD.left, PAD.top + cH);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  });

  // Crosshair + dots at hover index
  if (highlightIdx != null) {
    const x = PAD.left + (highlightIdx / Math.max(dates.length - 1, 1)) * cW;
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + cH); ctx.stroke();
    ctx.setLineDash([]);
    data.topSkus.forEach((s, si) => {
      const v = (data.series[s.sku] || [])[highlightIdx] || 0;
      const y = PAD.top + cH - (v / maxVal) * cH;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = CHART_COLORS[si % CHART_COLORS.length]; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }

  // Drag selection overlay
  if (dragX1 != null && dragX2 != null) {
    const x1 = Math.min(dragX1, dragX2);
    const x2 = Math.max(dragX1, dragX2);
    ctx.fillStyle = 'rgba(42,91,215,.12)';
    ctx.fillRect(x1, PAD.top, x2 - x1, cH);
    ctx.strokeStyle = 'rgba(42,91,215,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(x1, PAD.top, x2 - x1, cH);
  }
}

export function renderAnalysisChart(data) {
  const wrap   = document.getElementById('analysis-chart-wrap');
  const canvas = document.getElementById('analysis-chart');
  const legend = document.getElementById('analysis-chart-legend');
  if (!wrap || !canvas || !data || !data.topSkus?.length || !data.dates?.length) {
    if (wrap) wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  // Legend
  legend.innerHTML = data.topSkus.map((s, i) =>
    `<span style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text2)">
      <span style="width:18px;height:3px;background:${CHART_COLORS[i % CHART_COLORS.length]};border-radius:2px;display:inline-block"></span>
      <span title="${escHtml(s.name)}" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.name || s.sku)}</span>
    </span>`
  ).join('');

  // Compute geometry + store on canvas
  const W = canvas.parentElement.clientWidth - 32;
  const H = 140;
  canvas.width  = W;
  canvas.height = H;
  const PAD = { top: 10, right: 10, bottom: 28, left: 34 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;
  let maxVal = 1;
  data.topSkus.forEach(s => {
    const m = Math.max(...(data.series[s.sku] || [0]));
    if (m > maxVal) maxVal = m;
  });
  canvas._meta = { W, H, PAD, cW, cH, data, maxVal };

  drawChartBase(canvas);

  // ── Tooltip ──────────────────────────────────────────────────────────────
  let tooltip = document.getElementById('_analysis-tip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = '_analysis-tip';
    tooltip.style.cssText = 'position:fixed;background:rgba(20,20,30,.88);color:#fff;font-size:11px;padding:7px 11px;border-radius:7px;pointer-events:none;z-index:9999;display:none;line-height:1.7;min-width:120px;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    document.body.appendChild(tooltip);
  }

  // ── Remove old listeners ─────────────────────────────────────────────────
  ['_onMove','_onDown','_onUp','_onLeave'].forEach(k => {
    if (canvas[k]) canvas.removeEventListener(canvas[k+'_type'] || 'mousemove', canvas[k]);
  });

  let dragStart = null; // canvas-pixel X where drag began
  let isDragging = false;

  function getMx(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) * (canvas._meta.W / rect.width);
  }

  canvas._onMove = (e) => {
    const { PAD, cW, cH, data, maxVal, W, H } = canvas._meta;
    const mx = getMx(e);
    if (mx < PAD.left || mx > PAD.left + cW) {
      if (!isDragging) { tooltip.style.display = 'none'; drawChartBase(canvas); }
      return;
    }
    const idx = Math.max(0, Math.min(data.dates.length - 1, Math.round((mx - PAD.left) / cW * (data.dates.length - 1))));

    if (dragStart != null && Math.abs(mx - dragStart) > 4) {
      isDragging = true;
    }

    if (isDragging) {
      // Draw selection while dragging
      drawChartBase(canvas, null, dragStart, Math.min(Math.max(mx, PAD.left), PAD.left + cW));
      tooltip.style.display = 'none';
    } else {
      // Hover tooltip
      drawChartBase(canvas, idx);
      let html = `<div style="font-weight:700;border-bottom:1px solid rgba(255,255,255,.15);margin-bottom:4px;padding-bottom:3px">${data.dates[idx]}</div>`;
      let hasAny = false;
      data.topSkus.forEach((s, si) => {
        const v = (data.series[s.sku] || [])[idx] || 0;
        if (v > 0) {
          hasAny = true;
          html += `<div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${CHART_COLORS[si % CHART_COLORS.length]};flex-shrink:0;display:inline-block"></span><span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escHtml((s.name||s.sku).slice(0,28))}</span><b>${v}</b></div>`;
        }
      });
      if (!hasAny) html += `<div style="color:rgba(255,255,255,.5);font-size:10px">No sales</div>`;
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      
      // Force reflow to get accurate offsetWidth
      const _ = tooltip.offsetHeight;
      
      // Get tooltip dimensions
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const screenMargin = 8;
      
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Position horizontally: center on screen, clamp to viewport
      let tx = Math.round((viewportWidth - tooltipWidth) / 2);
      tx = Math.max(screenMargin, Math.min(tx, viewportWidth - tooltipWidth - screenMargin));
      
      // Position vertically: above cursor with offset
      const offsetAbove = 48;
      let ty = Math.round(e.clientY - offsetAbove);
      
      // If tooltip would go off top, move it below the cursor
      if (ty < screenMargin) {
        ty = Math.round(e.clientY + 20);
      }
      // If tooltip would go off bottom, move it up
      if (ty + tooltipHeight > viewportHeight - screenMargin) {
        ty = Math.round(viewportHeight - tooltipHeight - screenMargin);
      }
      
      tooltip.style.left = tx + 'px';
      tooltip.style.top  = ty + 'px';
    }
  };

  canvas._onDown = (e) => {
    const mx = getMx(e);
    const { PAD, cW } = canvas._meta;
    if (mx >= PAD.left && mx <= PAD.left + cW) {
      dragStart  = mx;
      isDragging = false;
    }
  };

  canvas._onUp = (e) => {
    if (dragStart == null) return;
    const mx   = getMx(e);
    const { PAD, cW, data } = canvas._meta;
    const x1   = Math.min(dragStart, mx);
    const x2   = Math.max(dragStart, mx);
    const diff  = x2 - x1;
    dragStart   = null;
    isDragging  = false;

    if (diff < 8) { drawChartBase(canvas); return; } // too small — ignore

    // Convert pixel range to date indices
    const i1 = Math.max(0, Math.round((x1 - PAD.left) / cW * (data.dates.length - 1)));
    const i2 = Math.min(data.dates.length - 1, Math.round((x2 - PAD.left) / cW * (data.dates.length - 1)));
    const newFrom = data.dates[i1];
    const newTo   = data.dates[i2];

    // Save original dates for reset (only first zoom)
    const fromEl = document.getElementById('analysis-from');
    const toEl   = document.getElementById('analysis-to');
    if (!_chartOrigFrom) { _chartOrigFrom = fromEl?.value || null; _chartOrigTo = toEl?.value || null; }

    // Update date pickers and reload
    if (fromEl) fromEl.value = newFrom;
    if (toEl)   toEl.value   = newTo;
    document.querySelectorAll('.analysis-preset').forEach(b => b.classList.remove('active'));

    // Show reset button
    const resetBtn  = document.getElementById('analysis-chart-reset');
    if (resetBtn) resetBtn.style.display = 'inline-block';

    loadAnalysis();
  };

  canvas._onLeave = () => {
    isDragging = false; dragStart = null;
    tooltip.style.display = 'none';
    drawChartBase(canvas);
  };

  canvas.addEventListener('mousemove',  canvas._onMove);
  canvas.addEventListener('mousedown',  canvas._onDown);
  canvas.addEventListener('mouseup',    canvas._onUp);
  canvas.addEventListener('mouseleave', canvas._onLeave);

  // Show hint after chart loads
  const hint = document.getElementById('analysis-chart-zoom-hint');
  if (hint) hint.style.display = 'inline';
}

export function resetChartZoom() {
  const fromEl = document.getElementById('analysis-from');
  const toEl   = document.getElementById('analysis-to');
  if (_chartOrigFrom != null && fromEl) fromEl.value = _chartOrigFrom;
  if (_chartOrigTo   != null && toEl)   toEl.value   = _chartOrigTo;
  _chartOrigFrom = null;
  _chartOrigTo   = null;
  const resetBtn = document.getElementById('analysis-chart-reset');
  if (resetBtn) resetBtn.style.display = 'none';
  loadAnalysis();
}

// Expose for inline HTML handlers
window.initAnalysisView    = initAnalysisView;
window.setAnalysisPreset   = setAnalysisPreset;
window.loadAnalysis        = loadAnalysis;
window.filterAnalysisTable = filterAnalysisTable;
window.sortAnalysis        = sortAnalysis;
window.resetChartZoom      = resetChartZoom;
