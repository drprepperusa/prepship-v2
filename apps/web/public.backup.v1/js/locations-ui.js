import { state } from './state.js';
import { escHtml } from './utils.js';
import { fetchValidatedJson } from './api-client.js';
import { parseLocationDtoList, parseLocationMutationResult, parseOkResult } from './api-contracts.js';

// ─── Load / Render ─────────────────────────────────────────────────────────────
export async function loadLocations() {
  try {
    state.locationsList = await fetchValidatedJson('/api/locations', undefined, parseLocationDtoList);
    renderLocations();
  } catch (e) { console.warn('loadLocations:', e); }
}

export function renderLocations() {
  const el = document.getElementById('locationsContent');
  if (!el) return;
  const { locationsList } = state;
  if (!locationsList.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📍</div><div>No locations yet. Add one above.</div></div>';
    return;
  }
  el.innerHTML = locationsList.map(l => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-weight:700;font-size:13px;color:var(--text)">${escHtml(l.name)}</span>
          ${l.isDefault ? '<span style="background:var(--ss-blue);color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px">DEFAULT</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--text2)">${[l.company, l.street1, l.street2, (l.city && l.state ? l.city + ', ' + l.state + ' ' + l.postalCode : '')].filter(Boolean).join(' · ')}</div>
        ${l.phone ? `<div style="font-size:11.5px;color:var(--text3);margin-top:2px">${escHtml(l.phone)}</div>` : ''}
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0;align-items:flex-start">
        ${!l.isDefault ? `<button class="btn btn-ghost btn-xs" onclick="setLocDefault(${l.locationId})">★ Default</button>` : ''}
        <button class="btn btn-ghost btn-xs" onclick="editLoc(${l.locationId})">✏️ Edit</button>
        <button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="deleteLoc(${l.locationId})">🗑</button>
      </div>
    </div>
  `).join('');
}

// ─── Form ──────────────────────────────────────────────────────────────────────
export function showLocForm(loc) {
  document.getElementById('locFormCard').style.display = '';
  document.getElementById('locFormTitle').textContent  = loc ? 'Edit Location' : 'Add Location';
  document.getElementById('locFormId').value      = loc?.locationId || '';
  document.getElementById('locFormName').value    = loc?.name       || '';
  document.getElementById('locFormCompany').value = loc?.company    || '';
  document.getElementById('locFormStreet1').value = loc?.street1    || '';
  document.getElementById('locFormStreet2').value = loc?.street2    || '';
  document.getElementById('locFormCity').value    = loc?.city       || '';
  document.getElementById('locFormState').value   = loc?.state      || '';
  document.getElementById('locFormZip').value     = loc?.postalCode || '';
  document.getElementById('locFormPhone').value   = loc?.phone      || '';
  document.getElementById('locFormDefault').checked = !!loc?.isDefault;
}

export function hideLocForm() {
  document.getElementById('locFormCard').style.display = 'none';
}

export function editLoc(id) {
  const l = state.locationsList.find(l => l.locationId === id);
  if (l) showLocForm(l);
}

export async function saveLoc() {
  const id   = document.getElementById('locFormId').value;
  const body = {
    name:       document.getElementById('locFormName').value.trim(),
    company:    document.getElementById('locFormCompany').value.trim(),
    street1:    document.getElementById('locFormStreet1').value.trim(),
    street2:    document.getElementById('locFormStreet2').value.trim(),
    city:       document.getElementById('locFormCity').value.trim(),
    state:      document.getElementById('locFormState').value.trim().toUpperCase(),
    postalCode: document.getElementById('locFormZip').value.trim(),
    phone:      document.getElementById('locFormPhone').value.trim(),
    isDefault:  document.getElementById('locFormDefault').checked ? 1 : 0,
  };
  if (!body.name) return window.showToast('⚠ Name is required');
  try {
    await fetchValidatedJson(id ? `/api/locations/${id}` : '/api/locations', {
      method: id ? 'PUT' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    }, parseLocationMutationResult);
    window.showToast('✅ Location saved');
    hideLocForm();
    await loadLocations();
  } catch (e) { window.showToast('❌ ' + e.message); }
}

export async function deleteLoc(id) {
  if (!confirm('Delete this location?')) return;
  await fetchValidatedJson(`/api/locations/${id}`, { method:'DELETE' }, parseOkResult);
  await loadLocations();
}

export async function setLocDefault(id) {
  await fetchValidatedJson(`/api/locations/${id}/setDefault`, { method:'POST' }, parseLocationMutationResult);
  await loadLocations();
}

// ─── Window exports ────────────────────────────────────────────────────────────
window.loadLocations  = loadLocations;
window.renderLocations = renderLocations;
window.showLocForm    = showLocForm;
window.hideLocForm    = hideLocForm;
window.editLoc        = editLoc;
window.saveLoc        = saveLoc;
window.deleteLoc      = deleteLoc;
window.setLocDefault  = setLocDefault;
