import { showToast } from './utils.js';

// ═══════════════════════════════════════════════
//  MANIFEST EXPORT
// ═══════════════════════════════════════════════

export function openManifestModal() {
  const modal = document.getElementById('manifestModal');
  if (!modal) return;

  // Set default date range: last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const toStr = today.toISOString().split('T')[0];
  const fromStr = thirtyDaysAgo.toISOString().split('T')[0];

  document.getElementById('manifest-from').value = fromStr;
  document.getElementById('manifest-to').value = toStr;
  document.getElementById('manifest-carrier').value = '';
  document.getElementById('manifest-summary').style.display = 'none';
  document.getElementById('manifest-status').style.display = 'none';
  document.getElementById('manifest-generate-btn').disabled = false;
  document.getElementById('manifest-generate-btn').innerHTML = '⬇️ Download CSV';

  modal.style.display = 'flex';
}

export function closeManifestModal() {
  const modal = document.getElementById('manifestModal');
  if (modal) modal.style.display = 'none';
}

export async function generateManifest() {
  const fromDate = document.getElementById('manifest-from')?.value;
  const toDate = document.getElementById('manifest-to')?.value;
  const carrier = document.getElementById('manifest-carrier')?.value || '';

  if (!fromDate || !toDate) {
    return showToast('⚠️ Select start and end dates');
  }

  const btn = document.getElementById('manifest-generate-btn');
  const status = document.getElementById('manifest-status');

  btn.disabled = true;
  btn.innerHTML = '⏳ Generating…';
  status.style.display = 'inline';
  status.textContent = 'Generating manifest…';

  try {
    const payload = {
      startDate: fromDate,
      endDate: toDate,
      ...(carrier ? { carrierId: carrier } : {}),
    };

    const r = await fetch('/api/manifests/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const err = await r.json();
      showToast('❌ ' + (err.error || 'Manifest generation failed'));
      btn.disabled = false;
      btn.innerHTML = '⬇️ Download CSV';
      status.style.display = 'none';
      return;
    }

    // Successful response: download the CSV file
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manifest_${fromDate}_${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('✅ Manifest downloaded');
    closeManifestModal();
  } catch (e) {
    showToast('❌ ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '⬇️ Download CSV';
    status.style.display = 'none';
  }
}

window.openManifestModal = openManifestModal;
window.closeManifestModal = closeManifestModal;
window.generateManifest = generateManifest;
