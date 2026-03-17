import { useState, useEffect } from 'react'

interface ManifestRow {
  manifestId: string
  carrier: string
  carrierId?: string
  date: string
  count: number
  status: 'completed' | 'pending' | 'processing'
}

const CARRIERS = [
  { code: '', label: 'All Carriers' },
  { code: 'stamps_com', label: 'USPS' },
  { code: 'fedex', label: 'FedEx' },
  { code: 'ups', label: 'UPS' },
]

export default function ManifestsView() {
  const [manifests, setManifests] = useState<ManifestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [carrierId, setCarrierId] = useState('')
  const [filterCarrier, setFilterCarrier] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const loadManifests = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/manifests')
      if (res.ok) {
        const data = await res.json()
        setManifests(Array.isArray(data) ? data : data.manifests || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load manifests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadManifests() }, [])

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      setError('Please select a date range')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/manifests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromDate, to: toDate, carrierId: carrierId || undefined }),
      })
      if (!res.ok) throw new Error(await res.text())
      await loadManifests()
    } catch (err: any) {
      setError(err.message || 'Failed to generate manifest')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (manifest: ManifestRow) => {
    try {
      const res = await fetch(`/api/manifests/${manifest.manifestId}/csv`)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `manifest-${manifest.manifestId}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'Download failed')
    }
  }

  const filtered = manifests.filter(m => !filterCarrier || m.carrierId === filterCarrier || m.carrier === filterCarrier)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const statusColor = (status: string) => {
    if (status === 'completed') return { bg: 'var(--green-bg)', color: 'var(--green)', border: 'var(--green-border)' }
    if (status === 'processing') return { bg: '#fef3c7', color: '#b45309', border: '#fcd34d' }
    return { bg: 'var(--surface2)', color: 'var(--text3)', border: 'var(--border)' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: '0 0 12px' }}>📋 Manifests</h2>

        {/* Generate form */}
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap',
          padding: '12px 14px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Carrier</label>
            <select
              value={carrierId}
              onChange={e => setCarrierId(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)' }}
            >
              {CARRIERS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: '700',
              background: 'var(--ss-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? '⏳ Generating…' : '📋 Generate Manifest'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '10px 18px 0', padding: '10px 14px', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', borderRadius: '6px', fontSize: '12px', color: '#dc2626', flexShrink: 0 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Filter + Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Filter:</span>
          {CARRIERS.map(c => (
            <button
              key={c.code}
              onClick={() => setFilterCarrier(c.code)}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: filterCarrier === c.code ? '700' : '500',
                background: filterCarrier === c.code ? 'var(--ss-blue)' : 'var(--surface2)',
                color: filterCarrier === c.code ? '#fff' : 'var(--text2)',
                border: '1px solid var(--border2)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text3)' }}>{filtered.length} manifests</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
            <div className="spinner"></div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>Loading manifests…</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <thead>
              <tr>
                {['Manifest #', 'Date', 'Carrier', 'Orders', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '10px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color: 'var(--text3)',
                    borderBottom: '2px solid var(--border)',
                    background: 'var(--surface2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                    <div>No manifests yet</div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>Generate a manifest using the form above</div>
                  </td>
                </tr>
              ) : paged.map((m, idx) => {
                const sc = statusColor(m.status)
                return (
                  <tr key={m.manifestId} style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: '700', color: 'var(--ss-blue)', fontFamily: 'monospace', fontSize: '12px' }}>
                      {m.manifestId}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                      {new Date(m.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                      {m.carrier}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700' }}>
                      {m.count}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{
                        background: sc.bg, color: sc.color,
                        border: `1px solid ${sc.border}`,
                        padding: '2px 8px', borderRadius: '9px',
                        fontSize: '10px', fontWeight: '700',
                        textTransform: 'capitalize' as const,
                      }}>
                        {m.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <button
                        onClick={() => handleDownload(m)}
                        style={{
                          padding: '3px 10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: 'var(--surface2)',
                          border: '1px solid var(--border2)',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          color: 'var(--text)',
                        }}
                      >
                        ⬇️ CSV
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '12px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '5px 12px', fontSize: '12px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer', opacity: page === 1 ? 0.5 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ padding: '5px 10px', fontSize: '12px', color: 'var(--text2)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '5px 12px', fontSize: '12px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
