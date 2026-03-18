// Pure utility functions — no dependencies on other modules

export function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
  const time = dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  return `${date} ${time}`;
}

export function fmtDateFull(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-US', {
      month:'short', day:'numeric', year:'numeric',
      hour:'numeric', minute:'2-digit', hour12:true
    });
  } catch(e) { return d; }
}

export function fmtDollar(v) {
  if (v == null || v === '') return '—';
  return '$' + parseFloat(v).toFixed(2);
}

export function fmtWeight(totalOz) {
  if (!totalOz) return '—';
  const lb  = Math.floor(totalOz / 16);
  const oz  = Math.round(totalOz % 16 * 10) / 10;
  if (lb === 0) return `${oz} oz`;
  if (oz === 0) return `${lb} lb`;
  return `${lb} lb ${oz} oz`;
}

export function trunc(s, n) {
  return s && s.length > n ? s.slice(0, n) + '…' : s || '—';
}

export function ageHours(d) {
  return d ? (Date.now() - new Date(d)) / (1000 * 3600) : 0;
}

export function ageStr(d) {
  const h = ageHours(d);
  if (h < 1) return Math.floor(h * 60) + 'm';
  if (h < 24) return Math.floor(h) + 'h';
  return Math.floor(h / 24) + 'd';
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function odStatusBadge(status) {
  const cls = status === 'awaiting_shipment' ? 'od-status-awaiting'
            : status === 'shipped'           ? 'od-status-shipped'
            : status === 'cancelled'         ? 'od-status-cancelled'
            :                                  'od-status-on_hold';
  const label = (status || 'unknown').replace(/_/g, ' ');
  return `<span class="od-status-badge ${cls}">${escHtml(label)}</span>`;
}

export function odCheckbox(val, label) {
  const on = val ? 'od-check-on' : '';
  return `<div class="od-check-row"><span class="od-check-box ${on}">${val ? '✓' : ''}</span>${escHtml(label)}</div>`;
}

export function showToast(msg, ms = 2800) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/**
 * Get date range for a given preset
 * IMPORTANT: All calculations use milliseconds directly to avoid timezone issues.
 * All returned dates are in LOCAL time for ISO string serialization.
 * 
 * @param {string} preset - Preset key: 'last-7', 'last-30', 'last-90', 'this-month', 'last-month', 'custom'
 * @param {Object} custom - Custom range (start/end date strings YYYY-MM-DD) if preset is 'custom'
 * @returns {Object} { start: Date, end: Date }
 */
export function getDateRangePreset(preset, custom = {}) {
  const now = new Date();
  
  // Create "today at midnight" in local time (not UTC)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const ms_per_day = 24 * 60 * 60 * 1000;

  switch (preset) {
    case 'last-7': {
      const start = new Date(today.getTime() - (7 * ms_per_day));
      return { start, end: now };
    }
    case 'last-30':
    case 'last30': {
      const start = new Date(today.getTime() - (30 * ms_per_day));
      return { start, end: now };
    }
    case 'last-90':
    case 'last90': {
      const start = new Date(today.getTime() - (90 * ms_per_day));
      return { start, end: now };
    }
    case 'this-month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end: now };
    }
    case 'last-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      // End of last month: first day of current month minus 1ms = 23:59:59 of last day
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'custom': {
      const start = custom.start ? new Date(custom.start + 'T00:00:00') : null;
      const end = custom.end ? new Date(custom.end + 'T23:59:59') : null;
      return { start, end };
    }
    default:
      return null;
  }
}
