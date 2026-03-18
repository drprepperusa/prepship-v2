// daily-strip.js — Today's throughput banner
// Shows at the top of Awaiting Shipment + Shipped views only
import { state } from './state.js';
import { fetchValidatedJson } from './api-client.js';
import { parseOrdersDailyStatsDto } from './api-contracts.js';

let _stripTimer = null;

export async function loadDailyStrip() {
  const el = document.getElementById('daily-strip');
  if (!el) return;

  // Only show on awaiting_shipment or shipped views
  if (state.currentStatus !== 'awaiting_shipment' && state.currentStatus !== 'shipped') {
    el.style.display = 'none';
    clearTimeout(_stripTimer);
    return;
  }

  try {
    const data = await fetchValidatedJson('/api/orders/daily-stats', undefined, parseOrdersDailyStatsDto);
    _renderStrip(el, data);
    el.style.display = 'block';
  } catch {
    el.style.display = 'none';
  }

  // Auto-refresh every 5 min
  clearTimeout(_stripTimer);
  _stripTimer = setTimeout(loadDailyStrip, 5 * 60 * 1000);
}

function _renderStrip(el, data) {
  const { totalOrders, needToShip, upcomingOrders = 0 } = data;
  const shipped  = Math.max(0, totalOrders - needToShip);
  const pct      = totalOrders > 0 ? Math.round(shipped / totalOrders * 100) : 0;
  const barFill  = Math.min(100, pct);

  // Progress color: green when all done, orange while in progress, blue at start
  const barColor = pct >= 100 ? '#16a34a' : pct >= 50 ? '#e07a00' : '#2a5bd7';
  // Need to Ship color: orange = still work to do, muted = all clear
  const ntsColor = needToShip > 0 ? '#e07a00' : 'var(--text3)';
  // Upcoming Orders color: blue if orders queued, muted if empty
  const upcomingColor = upcomingOrders > 0 ? '#2a5bd7' : 'var(--text3)';

  // Labels are formatted server-side in PT — never parse ISO strings in the browser
  const fromLabel = data.window.fromLabel || data.window.from;
  const toLabel   = data.window.toLabel   || data.window.to;

  el.innerHTML = `
    <div style="
      background:var(--surface);
      border-bottom:1px solid var(--border);
      padding:8px 16px;
      display:flex;
      align-items:center;
      gap:20px;
      flex-wrap:wrap;
      font-size:12px;
    ">
      <!-- Window label -->
      <div style="color:var(--text3);font-size:11px;white-space:nowrap;flex-shrink:0">
        📅 <span style="color:var(--text2)">${fromLabel}</span>
        <span style="margin:0 4px">→</span>
        <span style="color:var(--text2)">${toLabel}</span>
        <span style="margin-left:4px;color:var(--text3)">(shifts at 6 PM)</span>
      </div>

      <!-- Divider -->
      <div style="width:1px;height:28px;background:var(--border2);flex-shrink:0"></div>

      <!-- Stat: Total Orders -->
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:16px">📦</span>
        <div>
          <div style="font-size:18px;font-weight:800;line-height:1;color:var(--text)">${totalOrders}</div>
          <div style="font-size:10px;color:var(--text3);line-height:1.2;margin-top:1px">Total Orders</div>
        </div>
      </div>

      <!-- Stat: Need to Ship -->
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:16px">🚚</span>
        <div>
          <div style="font-size:18px;font-weight:800;line-height:1;color:${ntsColor}">${needToShip}</div>
          <div style="font-size:10px;color:var(--text3);line-height:1.2;margin-top:1px">Need to Ship</div>
        </div>
      </div>

      <!-- Stat: Upcoming Orders -->
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:16px">🔔</span>
        <div>
          <div style="font-size:18px;font-weight:800;line-height:1;color:${upcomingColor}">${upcomingOrders}</div>
          <div style="font-size:10px;color:var(--text3);line-height:1.2;margin-top:1px">Upcoming</div>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="flex:1;min-width:120px;max-width:220px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:10px;color:var(--text3)">${shipped} of ${totalOrders} shipped</span>
          <span style="font-size:11px;font-weight:700;color:${barColor}">${pct}%</span>
        </div>
        <div style="height:6px;background:var(--border2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${barFill}%;background:${barColor};border-radius:3px;transition:width .4s ease"></div>
        </div>
      </div>
    </div>
  `;
}

window.loadDailyStrip = loadDailyStrip;
