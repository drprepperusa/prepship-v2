import { useState, useEffect, useRef } from 'react'

interface SkuRow {
  sku: string
  name: string
  qty: number
  avgPrice: number
  totalShipping: number
  avgShipping: number
  orders: number
  marginPct: number
  revenue: number
}

interface DailyTrend {
  date: string
  units: number
}

type SortKey = keyof SkuRow
type DatePreset = '30d' | '90d' | '180d' | '1yr' | 'all'

const DATE_PRESETS: { key: DatePreset; label: string; days: number | null }[] = [
  { key: '30d', label: '30 Days', days: 30 },
  { key: '90d', label: '90 Days', days: 90 },
  { key: '180d', label: '180 Days', days: 180 },
  { key: '1yr', label: '1 Year', days: 365 },
  { key: 'all', label: 'All Time', days: null },
]

function toDateParam(preset: DatePreset): { from: string | null; to: string | null } {
  const now = new Date()
  const to = now.toISOString().split('T')[0]
  const p = DATE_PRESETS.find(d => d.key === preset)
  if (!p || !p.days) return { from: null, to: null }
  const from = new Date(now.getTime() - p.days * 86400000).toISOString().split('T')[0]
  return { from, to }
}

function MiniChart({ data }: { data: DailyTrend[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const maxVal = Math.max(...data.map(d => d.units), 1)
    const pad = 20

    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    ctx.beginPath()

    data.forEach((pt, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2)
      const y = H - pad - (pt.units / maxVal) * (H - pad * 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })

    ctx.stroke()

    // Fill area under line
    ctx.lineTo(pad + (W - pad * 2), H - pad)
    ctx.lineTo(pad, H - pad)
    ctx.closePath()
    const gradient = ctx.createLinearGradient(0, 0, 0, H)
    gradient.addColorStop(0, 'rgba(37,99,235,0.15)')
    gradient.addColorStop(1, 'rgba(37,99,235,0)')
    ctx.fillStyle = gradient
    ctx.fill()
  }, [data])

  return (
    <canvas
      ref={canvasRef}
      width={500}
      height={120}
      style={{ width: '100%', height: 120, borderRadius: '4px', border: '1px solid var(--border)' }}
    />
  )
}

export default function AnalysisView() {
  const [skuData, setSkuData] = useState<SkuRow[]>([])
  const [trendData, setTrendData] = useState<DailyTrend[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<DatePreset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('qty')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [clientFilter, setClientFilter] = useState('')
  const [clients, setClients] = useState<string[]>([])
  const [selectedSku, setSelectedSku] = useState<SkuRow | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    let from: string | null = null
    let to: string | null = null

    if (useCustom && customFrom && customTo) {
      from = customFrom
      to = customTo
    } else {
      const range = toDateParam(preset)
      from = range.from
      to = range.to
    }

    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (clientFilter) params.set('clientId', clientFilter)

      const [skuRes, trendRes] = await Promise.all([
        fetch(`/api/analysis/sku-summary?${params}`),
        fetch(`/api/analysis/daily-trend?${params}`),
      ])

      if (skuRes.ok) {
        const data = await skuRes.json()
        const rows: SkuRow[] = (data.rows || data || []).map((r: any) => ({
          sku: r.sku || '',
          name: r.name || r.sku || '',
          qty: r.qty || r.totalQty || 0,
          avgPrice: r.avgPrice || 0,
          totalShipping: r.totalShipping || 0,
          avgShipping: r.avgShipping || 0,
          orders: r.orders || r.orderCount || 0,
          marginPct: r.marginPct || 0,
          revenue: r.revenue || 0,
        }))
        setSkuData(rows)

        // Extract clients
        const uniqueClients = [...new Set(rows.map((r: any) => r.clientId).filter(Boolean))]
        setClients(uniqueClients.map(String))
      }

      if (trendRes.ok) {
        const data = await trendRes.json()
        setTrendData(data.trend || data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load analysis data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [preset, clientFilter])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...skuData].sort((a, b) => {
    const av = a[sortKey] as number
    const bv = b[sortKey] as number
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const thStyle = (key: SortKey) => ({
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>📊 Analysis</h2>

          {/* Date presets */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {DATE_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => { setPreset(p.key); setUseCustom(false) }}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: preset === p.key && !useCustom ? '700' : '500',
                  background: preset === p.key && !useCustom ? 'var(--ss-blue)' : 'var(--surface2)',
                  color: preset === p.key && !useCustom ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border2)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '11px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--text)' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '11px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--text)' }}
            />
            <button
              onClick={() => { setUseCustom(true); fetchData() }}
              disabled={!customFrom || !customTo}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '600',
                background: useCustom ? 'var(--ss-blue)' : 'var(--surface2)',
                color: useCustom ? '#fff' : 'var(--text2)',
                border: '1px solid var(--border2)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>

          {clients.length > 0 && (
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--text)' }}
            >
              <option value="">All Clients</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <button
            onClick={fetchData}
            disabled={loading}
            style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text2)', marginLeft: 'auto' }}
          >
            {loading ? '⏳' : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Chart */}
      {trendData.length > 0 && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Daily Units Sold</div>
          <MiniChart data={trendData} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: '12px 18px', padding: '10px 14px', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', borderRadius: '6px', color: '#dc2626', fontSize: '12px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 18px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
            <div className="spinner"></div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>Loading analysis…</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle('sku'), cursor: 'default' }}>SKU</th>
                <th onClick={() => handleSort('qty')} style={thStyle('qty')}>Qty {sortKey === 'qty' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('orders')} style={thStyle('orders')}>Orders {sortKey === 'orders' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('avgPrice')} style={thStyle('avgPrice')}>Avg Price {sortKey === 'avgPrice' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('totalShipping')} style={thStyle('totalShipping')}>Total Shipping {sortKey === 'totalShipping' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('avgShipping')} style={thStyle('avgShipping')}>Avg Shipping {sortKey === 'avgShipping' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('marginPct')} style={thStyle('marginPct')}>Margin% {sortKey === 'marginPct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                    <div>No analysis data for this period</div>
                  </td>
                </tr>
              ) : sorted.map((row, idx) => (
                <tr
                  key={row.sku}
                  onClick={() => setSelectedSku(row)}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: selectedSku?.sku === row.sku
                      ? 'var(--ss-blue-bg)'
                      : idx % 2 === 0 ? 'transparent' : 'var(--surface2)',
                  }}
                >
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text)', fontFamily: 'monospace' }}>{row.sku}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{row.name}</div>
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700' }}>{row.qty}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>{row.orders}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>${row.avgPrice.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>${row.totalShipping.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>${row.avgShipping.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700', color: row.marginPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {row.marginPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SKU Detail Drawer */}
      {selectedSku && (
        <div
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 320, zIndex: 8000,
            backgroundColor: 'var(--surface)',
            borderLeft: '2px solid var(--ss-blue)',
            boxShadow: '-4px 0 20px rgba(0,0,0,.15)',
            padding: '16px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700' }}>SKU Detail</div>
            <button onClick={() => setSelectedSku(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
          </div>

          <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--ss-blue)', marginBottom: '4px' }}>{selectedSku.sku}</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '16px' }}>{selectedSku.name}</div>

          {[
            { label: 'Total Qty', value: selectedSku.qty },
            { label: 'Orders', value: selectedSku.orders },
            { label: 'Avg Price', value: `$${selectedSku.avgPrice.toFixed(2)}` },
            { label: 'Total Revenue', value: `$${selectedSku.revenue.toFixed(2)}` },
            { label: 'Total Shipping', value: `$${selectedSku.totalShipping.toFixed(2)}` },
            { label: 'Avg Shipping', value: `$${selectedSku.avgShipping.toFixed(2)}` },
            { label: 'Margin', value: `${selectedSku.marginPct.toFixed(1)}%` },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid var(--border)',
              fontSize: '12px',
            }}>
              <span style={{ color: 'var(--text3)' }}>{label}</span>
              <span style={{ fontWeight: '600', color: 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
