import { useState, useEffect } from 'react'

interface PackageDto {
  packageId: number
  name: string
  length: number
  width: number
  height: number
  weight: number
  cost: number
  status: 'active' | 'inactive'
}

interface PackageFormData {
  name: string
  length: string
  width: string
  height: string
  weight: string
  cost: string
  status: 'active' | 'inactive'
}

type ModalMode = 'none' | 'add' | 'edit' | 'delete'

export default function PackagesView() {
  const [packages, setPackages] = useState<PackageDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lowStock, setLowStock] = useState<PackageDto[]>([])
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<keyof PackageDto>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [modal, setModal] = useState<ModalMode>('none')
  const [editTarget, setEditTarget] = useState<PackageDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const emptyForm: PackageFormData = {
    name: '', length: '', width: '', height: '', weight: '', cost: '', status: 'active',
  }
  const [form, setForm] = useState<PackageFormData>(emptyForm)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [pkgRes, lowRes] = await Promise.all([
        fetch('/api/packages'),
        fetch('/api/packages/low-stock').catch(() => null),
      ])
      if (pkgRes.ok) {
        const data = await pkgRes.json()
        setPackages(Array.isArray(data) ? data : data.packages || [])
      }
      if (lowRes?.ok) {
        const low = await lowRes.json()
        setLowStock(Array.isArray(low) ? low : low.packages || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditTarget(null)
    setForm(emptyForm)
    setModal('add')
  }

  const openEdit = (pkg: PackageDto) => {
    setEditTarget(pkg)
    setForm({
      name: pkg.name,
      length: String(pkg.length || ''),
      width: String(pkg.width || ''),
      height: String(pkg.height || ''),
      weight: String(pkg.weight || ''),
      cost: String(pkg.cost || ''),
      status: pkg.status || 'active',
    })
    setModal('edit')
  }

  const openDelete = (pkg: PackageDto) => {
    setEditTarget(pkg)
    setModal('delete')
  }

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const body = {
        name: form.name,
        length: parseFloat(form.length) || 0,
        width: parseFloat(form.width) || 0,
        height: parseFloat(form.height) || 0,
        weight: parseFloat(form.weight) || 0,
        cost: parseFloat(form.cost) || 0,
        status: form.status,
      }

      if (modal === 'add') {
        await fetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else if (modal === 'edit' && editTarget) {
        await fetch(`/api/packages/${editTarget.packageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      setModal('none')
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      await fetch(`/api/packages/${editTarget.packageId}`, { method: 'DELETE' })
      setModal('none')
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const handleSyncShipStation = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/packages/sync-shipstation', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (err: any) {
      setError(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleSort = (key: keyof PackageDto) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = packages
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : (Number(av) - Number(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const thStyle = (key: keyof PackageDto) => ({
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontSize: '10px',
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    color: sortKey === key ? 'var(--ss-blue)' : 'var(--text3)',
    borderBottom: '2px solid var(--border)',
    background: 'var(--surface2)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  })

  const inputStyle = {
    width: '100%',
    padding: '7px 8px',
    fontSize: '12px',
    border: '1px solid var(--border2)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface2)',
    color: 'var(--text)',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>📐 Package Library</h2>
        <input
          type="text"
          placeholder="Search packages…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: '200px' }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            onClick={handleSyncShipStation}
            disabled={syncing}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              background: 'var(--surface2)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text2)',
              fontWeight: '600',
              opacity: syncing ? 0.7 : 1,
            }}
          >
            {syncing ? '⏳' : '↻'} Sync ShipStation
          </button>
          <button
            onClick={openAdd}
            style={{ padding: '6px 14px', fontSize: '11px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
          >
            + Add Package
          </button>
        </div>
      </div>

      {/* Low stock banner */}
      {lowStock.length > 0 && (
        <div style={{ margin: '10px 18px 0', padding: '10px 14px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', fontSize: '12px', color: '#92400e', flexShrink: 0 }}>
          ⚠️ Low stock: {lowStock.map(p => p.name).join(', ')}
        </div>
      )}

      {error && (
        <div style={{ margin: '10px 18px 0', padding: '10px 14px', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', borderRadius: '6px', fontSize: '12px', color: '#dc2626', flexShrink: 0 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
            <div className="spinner"></div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>Loading packages…</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} style={thStyle('name')}>Name {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th style={{ ...thStyle('length'), cursor: 'default' }}>Dims (W×H×D)</th>
                <th onClick={() => handleSort('weight')} style={thStyle('weight')}>Weight {sortKey === 'weight' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('cost')} style={thStyle('cost')}>Cost {sortKey === 'cost' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('status')} style={thStyle('status')}>Status</th>
                <th style={{ ...thStyle('name'), cursor: 'default' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📐</div>
                    <div>No packages found</div>
                    <button onClick={openAdd} className="btn btn-primary btn-sm" style={{ marginTop: '12px' }}>+ Add Package</button>
                  </td>
                </tr>
              ) : filtered.map((pkg, idx) => (
                <tr
                  key={pkg.packageId}
                  style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface2)' }}
                >
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '600' }}>
                    {pkg.name}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text2)' }}>
                    {pkg.length || 0}"×{pkg.height || 0}"×{pkg.width || 0}"
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    {pkg.weight || 0} oz
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    {pkg.cost ? `$${pkg.cost.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '9px',
                      background: pkg.status === 'active' ? 'var(--green-bg)' : 'var(--surface2)',
                      color: pkg.status === 'active' ? 'var(--green)' : 'var(--text3)',
                      border: `1px solid ${pkg.status === 'active' ? 'var(--green-border)' : 'var(--border)'}`,
                    }}>
                      {pkg.status || 'active'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => openEdit(pkg)}
                        style={{ padding: '3px 10px', fontSize: '11px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', cursor: 'pointer', color: 'var(--text)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDelete(pkg)}
                        style={{ padding: '3px 10px', fontSize: '11px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer', color: '#dc2626' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, backgroundColor: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal('none')}
        >
          <div
            style={{ backgroundColor: 'var(--surface)', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', width: '480px', maxWidth: '95vw', padding: '24px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px' }}>
              {modal === 'add' ? '+ Add Package' : `Edit: ${editTarget?.name}`}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--text2)' }}>Package Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="e.g. Small Box" />
              </div>
              {[
                { key: 'length', label: 'Length (in)' },
                { key: 'width', label: 'Width (in)' },
                { key: 'height', label: 'Height (in)' },
                { key: 'weight', label: 'Weight (oz)' },
                { key: 'cost', label: 'Cost ($)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--text2)' }}>{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(form as any)[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--text2)' }}>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal('none')} style={{ padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                style={{ padding: '8px 16px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? '⏳ Saving…' : '💾 Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && editTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, backgroundColor: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal('none')}
        >
          <div
            style={{ backgroundColor: 'var(--surface)', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', width: '360px', padding: '24px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>Delete Package?</h3>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
              Are you sure you want to delete <strong>{editTarget.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal('none')} style={{ padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' }}
              >
                {saving ? '⏳' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
