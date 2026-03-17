import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../../hooks/useToast'

// ── Types ────────────────────────────────────────────────────────────────────

interface BillingConfigDto {
  clientId: number
  clientName: string
  pickPackFee: number
  additionalUnitFee: number
  packageCostMarkup: number
  shippingMarkupPct: number
  shippingMarkupFlat: number
  billing_mode: string
  storageFeePerCuFt: number
}

interface BillingSummaryDto {
  clientId: number
  clientName: string
  pickPackTotal: number
  additionalTotal: number
  packageTotal: number
  shippingTotal: number
  storageTotal: number
  orderCount: number
  grandTotal: number
}

interface BillingDetailDto {
  orderId: number
  orderNumber: string
  shipDate: string
  totalQty: number
  pickpackTotal: number
  additionalTotal: number
  packageTotal: number
  shippingTotal: number
  actualLabelCost: number | null
  ref_usps_rate: number | null
  ref_ups_rate: number | null
  packageName: string | null
  itemNames: string | null
  itemSkus: string | null
}

interface PackageDto {
  packageId: number
  name: string
  source: string
  length: number
  width: number
  height: number
  unitCost?: number | null
}

interface PkgPriceDto {
  packageId: number
  price: number
  is_custom: number
  name: string
  length: number | null
  width: number | null
  height: number | null
}

// ── Column definitions for detail table ──────────────────────────────────────

const DETAIL_COLS = [
  { id: 'orderNumber', label: 'Order #', align: 'left', always: true },
  { id: 'shipDate', label: 'Ship Date', align: 'left', always: false },
  { id: 'itemNames', label: 'Item Name', align: 'left', always: false },
  { id: 'itemSkus', label: 'SKU', align: 'left', always: false },
  { id: 'totalQty', label: 'Qty', align: 'right', always: false },
  { id: 'pickpack', label: 'Pick & Pack', align: 'right', always: false },
  { id: 'additional', label: 'Addl Units', align: 'right', always: false },
  { id: 'packageCost', label: 'Box Cost', align: 'right', always: false },
  { id: 'packageName', label: 'Box Size', align: 'center', always: false },
  { id: 'bestRate', label: 'Best Rate', align: 'right', always: false },
  { id: 'upsss', label: 'UPS SS', align: 'right', always: false },
  { id: 'uspsss', label: 'USPS SS', align: 'right', always: false },
  { id: 'shipping', label: 'Shipping', align: 'right', always: false },
  { id: 'total', label: 'Total', align: 'right', always: true },
  { id: 'margin', label: 'Shipping Margin', align: 'right', always: false },
]

const DETAIL_COLS_KEY = 'billing_detail_cols_v1'
const DETAIL_COLS_DEFAULT = new Set(['orderNumber', 'shipDate', 'itemNames', 'itemSkus', 'totalQty', 'pickpack', 'additional', 'shipping', 'total'])

function getDetailColVis(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(DETAIL_COLS_KEY) || 'null')
    return saved ? new Set(saved) : new Set(DETAIL_COLS_DEFAULT)
  } catch { return new Set(DETAIL_COLS_DEFAULT) }
}
function saveDetailColVis(vis: Set<string>) {
  localStorage.setItem(DETAIL_COLS_KEY, JSON.stringify([...vis]))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

function fmt$(v: number | null | undefined): string {
  if (v == null || v <= 0) return '—'
  return `$${(+v).toFixed(2)}`
}

function getPresetRange(preset: string) {
  const today = new Date()
  let from: Date, to: Date
  if (preset === 'this_month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1)
    to = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  } else if (preset === 'last_month') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    to = new Date(today.getFullYear(), today.getMonth(), 0)
  } else if (preset === 'last_30') {
    to = new Date(today); from = new Date(today); from.setDate(from.getDate() - 30)
  } else {
    to = new Date(today); from = new Date(today); from.setDate(from.getDate() - 90)
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BillingView() {
  const { showToast } = useToast()
  const today = new Date()
  const defaultFrom = new Date(today); defaultFrom.setDate(defaultFrom.getDate() - 90)
  const [from, setFrom] = useState(defaultFrom.toISOString().slice(0, 10))
  const [to, setTo] = useState(today.toISOString().slice(0, 10))
  const [activePreset, setActivePreset] = useState('last_90')

  const [configs, setConfigs] = useState<BillingConfigDto[]>([])
  const [summary, setSummary] = useState<BillingSummaryDto[]>([])
  const [detailClient, setDetailClient] = useState<{ id: number; name: string } | null>(null)
  const [detailRows, setDetailRows] = useState<BillingDetailDto[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateStatus, setGenerateStatus] = useState('')
  const [packages, setPackages] = useState<PackageDto[]>([])
  const [colVis, setColVis] = useState<Set<string>>(getDetailColVis())

  const loadConfigs = useCallback(async () => {
    try {
      const r = await fetch('/api/billing/config')
      if (r.ok) {
        const data = await r.json()
        setConfigs(data)
        // Load packages for pkg price matrix
        const pr = await fetch('/api/packages')
        if (pr.ok) setPackages(await pr.json())
      }
    } catch { showToast('Failed to load billing config') }
  }, [])

  const loadSummary = useCallback(async (f: string, t: string) => {
    if (!f || !t) return
    setSummaryLoading(true)
    try {
      const r = await fetch(`/api/billing/summary?from=${f}&to=${t}`)
      if (r.ok) setSummary(await r.json())
    } finally { setSummaryLoading(false) }
  }, [])

  useEffect(() => {
    loadConfigs()
    loadSummary(from, to)
  }, []) // eslint-disable-line

  const applyPreset = (preset: string) => {
    setActivePreset(preset)
    const range = getPresetRange(preset)
    setFrom(range.from); setTo(range.to)
    loadSummary(range.from, range.to)
  }

  const generate = async () => {
    if (!from || !to) return showToast('Select a date range first')
    setGenerating(true); setGenerateStatus('')
    try {
      const r = await fetch('/api/billing/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const d = await r.json()
      if (d.ok) {
        setGenerateStatus(`Generated ${d.generated} line items · $${d.total.toFixed(2)} total`)
        showToast(`✅ Generated ${d.generated} billing line items`)
        loadSummary(from, to)
      } else showToast('Error: ' + (d.error || 'unknown'))
    } finally { setGenerating(false) }
  }

  const loadDetails = async (clientId: number, clientName: string) => {
    setDetailClient({ id: clientId, name: clientName })
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/billing/details?from=${from}&to=${to}&clientId=${clientId}`)
      if (r.ok) setDetailRows(await r.json())
    } finally { setDetailLoading(false) }
  }

  const toggleCol = (colId: string) => {
    const next = new Set(colVis)
    if (next.has(colId)) next.delete(colId); else next.add(colId)
    setColVis(next)
    saveDetailColVis(next)
  }

  const exportInvoice = (clientId: number, clientName: string) => {
    const url = `/api/billing/invoice?clientId=${encodeURIComponent(clientId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    window.open(url, '_blank')
    showToast(`📄 Opening invoice for ${clientName}…`)
  }

  const totals = summary.reduce((t, r) => ({
    orders: t.orders + (r.orderCount || 0),
    pickPack: t.pickPack + (r.pickPackTotal || 0),
    additional: t.additional + (r.additionalTotal || 0),
    package: t.package + (r.packageTotal || 0),
    storage: t.storage + (r.storageTotal || 0),
    shipping: t.shipping + (r.shippingTotal || 0),
    grand: t.grand + (r.grandTotal || 0),
  }), { orders: 0, pickPack: 0, additional: 0, package: 0, storage: 0, shipping: 0, grand: 0 })

  const TH: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }
  const THR: React.CSSProperties = { ...TH, textAlign: 'right' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text)', margin: '0 0 12px 0' }}>🧾 Billing</h2>

        {/* Date range + presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {[
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'last_30', label: 'Last 30 Days' },
            { id: 'last_90', label: 'Last 90 Days' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              style={{
                padding: '4px 10px', borderRadius: 16, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                border: activePreset === p.id ? '2px solid var(--ss-blue)' : '1px solid var(--border)',
                background: activePreset === p.id ? 'var(--ss-blue)' : 'var(--surface2)',
                color: activePreset === p.id ? '#fff' : 'var(--text2)',
              }}
            >{p.label}</button>
          ))}
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset('') }}
            style={{ padding: '5px 8px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset('') }}
            style={{ padding: '5px 8px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
          <button className="btn btn-outline btn-sm" onClick={() => loadSummary(from, to)}>🔍 Load</button>
        </div>
      </div>

      <div style={{ padding: '18px', overflowY: 'auto' }}>
        {/* Generate section */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={generate}
            disabled={generating}
            style={{ padding: '8px 18px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.7 : 1 }}
          >
            {generating ? '⏳ Generating…' : '⚡ Generate Invoices'}
          </button>
          {generateStatus && <span style={{ fontSize: 12, color: 'var(--green-dark, #15803d)', fontWeight: 600 }}>{generateStatus}</span>}
          <RefRateControls from={from} to={to} showToast={showToast} />
        </div>

        {/* Summary table */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>📊 Summary</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={TH}>Client</th>
                  <th style={THR}>Orders</th>
                  <th style={THR}>Pick & Pack</th>
                  <th style={THR}>Addl Units</th>
                  <th style={THR}>Box Cost</th>
                  <th style={THR}>Storage</th>
                  <th style={THR}>Shipping</th>
                  <th style={THR}>Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {summaryLoading && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Loading…</td></tr>
                )}
                {!summaryLoading && summary.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>No billing data. Generate invoices first.</td></tr>
                )}
                {!summaryLoading && summary.map(r => (
                  <tr key={r.clientId} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseOut={e => (e.currentTarget.style.background = '')}
                    onClick={() => loadDetails(r.clientId, r.clientName)}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--ss-blue)' }}>
                      {r.clientName}
                      <button
                        className="btn btn-ghost btn-xs"
                        title="Export invoice as PDF"
                        style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', opacity: .7 }}
                        onClick={e => { e.stopPropagation(); exportInvoice(r.clientId, r.clientName) }}
                      >📄 Export</button>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>{r.orderCount || 0}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>${(r.pickPackTotal || 0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>${(r.additionalTotal || 0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>{(r.packageTotal || 0) > 0 ? `$${(r.packageTotal).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>{(r.storageTotal || 0) > 0 ? `$${(r.storageTotal).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text2)' }}>${(r.shippingTotal || 0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>${(r.grandTotal || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {!summaryLoading && summary.length > 0 && (
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{totals.orders}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>${totals.pickPack.toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>${totals.additional.toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{totals.package > 0 ? `$${totals.package.toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{totals.storage > 0 ? `$${totals.storage.toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>${totals.shipping.toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--green)', fontSize: 13 }}>${totals.grand.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail section */}
        {detailClient && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Line Items — {detailClient.name}</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setDetailClient(null)} style={{ marginLeft: 'auto' }}>✕</button>
            </div>
            {/* Column toggles */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {DETAIL_COLS.filter(c => !c.always).map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleCol(c.id)}
                  style={{
                    padding: '2px 8px', fontSize: 10, borderRadius: 10, cursor: 'pointer', fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: colVis.has(c.id) ? 'var(--ss-blue)' : 'var(--surface2)',
                    color: colVis.has(c.id) ? '#fff' : 'var(--text2)',
                  }}
                >{c.label}</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <DetailTable rows={detailRows} loading={detailLoading} colVis={colVis} />
            </div>
          </div>
        )}

        {/* Billing Config */}
        <BillingConfigSection configs={configs} onSaved={loadConfigs} showToast={showToast} />

        {/* Package Price Matrix */}
        <PkgPriceMatrix configs={configs} packages={packages} showToast={showToast} />
      </div>
    </div>
  )
}

// ── Detail Table ──────────────────────────────────────────────────────────────

function DetailTable({ rows, loading, colVis }: { rows: BillingDetailDto[]; loading: boolean; colVis: Set<string> }) {
  const visibleCols = DETAIL_COLS.filter(c => colVis.has(c.id) || c.always)
  const N = visibleCols.length
  const TH: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 10px', background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }
  const dash = <span style={{ color: 'var(--text4)' }}>—</span>

  let tPP = 0, tAdd = 0, tPkg = 0, tShip = 0, tGrand = 0, tMargin = 0

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
  if (!rows.length) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>No line items found.</div>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>{visibleCols.map(c => <th key={c.id} style={{ ...TH, textAlign: c.align as 'left' | 'right' | 'center' }}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(o => {
          const pp = o.pickpackTotal || 0, add = o.additionalTotal || 0, pkg = o.packageTotal || 0, ship = o.shippingTotal || 0
          const total = pp + add + pkg + ship
          const ourCost = o.actualLabelCost || 0
          const margin = ship - ourCost
          tPP += pp; tAdd += add; tPkg += pkg; tShip += ship; tGrand += total; tMargin += margin
          const ssCharged = ship > 0 && o.actualLabelCost != null && ship > (o.actualLabelCost + 0.01)
          const tol = 0.01
          const chargedRate = ship > 0 ? (
            o.actualLabelCost != null && Math.abs(ship - o.actualLabelCost) <= tol ? 'bestRate' :
            o.ref_ups_rate != null && Math.abs(ship - o.ref_ups_rate) <= tol ? 'upsss' :
            o.ref_usps_rate != null && Math.abs(ship - o.ref_usps_rate) <= tol ? 'uspsss' : null
          ) : null

          const cellFor = (colId: string) => {
            switch (colId) {
              case 'orderNumber': return <td key={colId} style={{ padding: '5px 10px', fontWeight: 600, color: 'var(--ss-blue)', cursor: 'pointer' }}>{o.orderNumber}</td>
              case 'shipDate': return <td key={colId} style={{ padding: '5px 10px', color: 'var(--text2)', fontSize: 11 }}>{o.shipDate ? fmtDate(o.shipDate) : '—'}</td>
              case 'itemNames': return <td key={colId} style={{ padding: '5px 10px', fontSize: 11, maxWidth: 220 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.itemNames || ''}>
                  {o.itemNames ? o.itemNames.split(' | ').map((n, i) => <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</div>) : dash}
                </div>
              </td>
              case 'itemSkus': return <td key={colId} style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--text2)' }}>
                {o.itemSkus ? o.itemSkus.split(' | ').map((s, i) => s ? <div key={i}>{s}</div> : dash) : dash}
              </td>
              case 'totalQty': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right' }}>{o.totalQty || 0}</td>
              case 'pickpack': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right' }}>${pp.toFixed(2)}</td>
              case 'additional': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right' }}>{add > 0 ? `$${add.toFixed(2)}` : dash}</td>
              case 'packageCost': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right' }}>{pkg > 0 ? `$${pkg.toFixed(2)}` : dash}</td>
              case 'packageName': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'center', fontSize: 10.5, color: 'var(--text2)' }}>{o.packageName || dash}</td>
              case 'bestRate': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, border: chargedRate === 'bestRate' ? '2px solid var(--ss-blue)' : undefined, borderRadius: chargedRate === 'bestRate' ? 4 : undefined }}>{fmt$(o.actualLabelCost)}</td>
              case 'upsss': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: o.ref_ups_rate ? '#2563eb' : 'inherit', border: chargedRate === 'upsss' ? '2px solid var(--ss-blue)' : undefined, borderRadius: chargedRate === 'upsss' ? 4 : undefined }}>{fmt$(o.ref_ups_rate)}</td>
              case 'uspsss': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: o.ref_usps_rate ? '#16a34a' : 'inherit', border: chargedRate === 'uspsss' ? '2px solid var(--ss-blue)' : undefined, borderRadius: chargedRate === 'uspsss' ? 4 : undefined }}>{fmt$(o.ref_usps_rate)}</td>
              case 'shipping': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right' }}>
                {ssCharged
                  ? <><span style={{ color: '#b45309', fontWeight: 600 }}>${ship.toFixed(2)}</span><span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 3 }}>↑SS</span></>
                  : `$${ship.toFixed(2)}`}
              </td>
              case 'total': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>${total.toFixed(2)}</td>
              case 'margin': return <td key={colId} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: margin > 0 ? 'var(--green)' : margin < 0 ? 'var(--red)' : 'var(--text3)' }}>{margin > 0 ? '+' : ''}${margin.toFixed(2)}</td>
              default: return <td key={colId}></td>
            }
          }

          return (
            <tr key={o.orderId} style={{ borderBottom: '1px solid var(--border)', background: ssCharged ? 'rgba(234,179,8,.06)' : '' }}>
              {visibleCols.map(c => cellFor(c.id))}
            </tr>
          )
        })}
        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
          {visibleCols.map(c => {
            switch (c.id) {
              case 'orderNumber': return <td key={c.id} style={{ padding: '6px 10px', fontWeight: 700 }}>Total</td>
              case 'pickpack': return <td key={c.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>${tPP.toFixed(2)}</td>
              case 'additional': return <td key={c.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{tAdd > 0 ? `$${tAdd.toFixed(2)}` : '—'}</td>
              case 'packageCost': return <td key={c.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{tPkg > 0 ? `$${tPkg.toFixed(2)}` : '—'}</td>
              case 'shipping': return <td key={c.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>${tShip.toFixed(2)}</td>
              case 'total': return <td key={c.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>${tGrand.toFixed(2)}</td>
              case 'margin': return <td key={c.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: tMargin > 0 ? 'var(--green)' : 'var(--red)' }}>${tMargin.toFixed(2)}</td>
              default: return <td key={c.id}></td>
            }
          })}
        </tr>
      </tbody>
    </table>
  )
}

// ── Billing Config Section ────────────────────────────────────────────────────

function BillingConfigSection({ configs, onSaved, showToast }: { configs: BillingConfigDto[]; onSaved: () => void; showToast: (msg: string) => void }) {
  // Local editable state per client
  const [edits, setEdits] = useState<Record<number, Partial<BillingConfigDto>>>({})

  const get = (clientId: number, field: keyof BillingConfigDto) => {
    const e = edits[clientId]
    if (e && field in e) return String(e[field as keyof typeof e] ?? '')
    const c = configs.find(c => c.clientId === clientId)
    if (!c) return ''
    return String((c as any)[field] ?? '')
  }

  const set = (clientId: number, field: keyof BillingConfigDto, value: string) => {
    setEdits(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], [field]: value },
    }))
  }

  const save = async (clientId: number) => {
    const e = edits[clientId] || {}
    const c = configs.find(c => c.clientId === clientId)
    if (!c) return
    const payload = {
      pickPackFee: parseFloat(get(clientId, 'pickPackFee') || '0'),
      additionalUnitFee: parseFloat(get(clientId, 'additionalUnitFee') || '0'),
      packageCostMarkup: 0,
      shippingMarkupPct: parseFloat(get(clientId, 'shippingMarkupPct') || '0'),
      shippingMarkupFlat: parseFloat(get(clientId, 'shippingMarkupFlat') || '0'),
      billing_mode: (e.billing_mode ?? c.billing_mode) || 'label_cost',
      storageFeePerCuFt: parseFloat(get(clientId, 'storageFeePerCuFt') || '0'),
    }
    try {
      const r = await fetch(`/api/billing/config/${clientId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (d.ok) { showToast('✅ Config saved'); onSaved() }
      else showToast('Error: ' + (d.error || 'unknown'))
    } catch { showToast('Failed to save config') }
  }

  const TH: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 8px', background: 'var(--surface2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }
  const IS: React.CSSProperties = { width: 60, textAlign: 'right', fontSize: '11.5px', padding: '4px 6px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700 }}>⚙️ Billing Config</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'left' }}>Client</th>
              <th style={{ ...TH, textAlign: 'right' }}>Pick & Pack</th>
              <th style={{ ...TH, textAlign: 'right' }}>Addl Unit</th>
              <th style={{ ...TH, textAlign: 'right' }}>Ship Markup %</th>
              <th style={{ ...TH, textAlign: 'right' }}>Ship Markup $</th>
              <th style={{ ...TH, textAlign: 'right' }}>Storage $/cu ft</th>
              <th style={{ ...TH, textAlign: 'center' }}>Mode</th>
              <th style={{ ...TH, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>No clients found.</td></tr>
            )}
            {configs.map(c => (
              <tr key={c.clientId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: '11.5px' }}>{c.clientName}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" step="0.01" min="0" value={get(c.clientId, 'pickPackFee')} onChange={e => set(c.clientId, 'pickPackFee', e.target.value)} style={IS} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" step="0.01" min="0" value={get(c.clientId, 'additionalUnitFee')} onChange={e => set(c.clientId, 'additionalUnitFee', e.target.value)} style={IS} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" step="0.1" min="0" value={get(c.clientId, 'shippingMarkupPct')} onChange={e => set(c.clientId, 'shippingMarkupPct', e.target.value)} style={{ ...IS, width: 55 }} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" step="0.01" min="0" value={get(c.clientId, 'shippingMarkupFlat')} onChange={e => set(c.clientId, 'shippingMarkupFlat', e.target.value)} style={IS} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" step="0.001" min="0" value={get(c.clientId, 'storageFeePerCuFt')} onChange={e => set(c.clientId, 'storageFeePerCuFt', e.target.value)} style={{ ...IS, width: 64 }} title="Storage fee per cubic foot per month (0 = disabled)" />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <select
                    value={(edits[c.clientId]?.billing_mode ?? c.billing_mode) || 'label_cost'}
                    onChange={e => set(c.clientId, 'billing_mode', e.target.value)}
                    style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
                  >
                    <option value="label_cost">Label Cost</option>
                    <option value="reference_rate">SS Ref Rate ★</option>
                  </select>
                </td>
                <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                  <button className="btn btn-outline btn-xs" onClick={() => save(c.clientId)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Package Price Matrix ──────────────────────────────────────────────────────

function PkgPriceMatrix({ configs, packages, showToast }: { configs: BillingConfigDto[]; packages: PackageDto[]; showToast: (msg: string) => void }) {
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [prices, setPrices] = useState<Record<number, { price: number; is_custom: number }>>({})
  const [loadedClient, setLoadedClient] = useState<string>('')

  const customPkgs = packages.filter(p => p.source === 'custom')

  useEffect(() => {
    if (configs.length > 0 && !selectedClientId) {
      setSelectedClientId(String(configs[0].clientId))
    }
  }, [configs, selectedClientId])

  useEffect(() => {
    if (!selectedClientId || selectedClientId === loadedClient) return
    fetch('/api/billing/package-prices?clientId=' + selectedClientId)
      .then(r => r.json())
      .then((rows: PkgPriceDto[]) => {
        const map: Record<number, { price: number; is_custom: number }> = {}
        rows.forEach(r => { map[r.packageId] = { price: r.price, is_custom: r.is_custom } })
        setPrices(map)
        setLoadedClient(selectedClientId)
      })
      .catch(() => {})
  }, [selectedClientId, loadedClient])

  const getPrice = (pkgId: number) => prices[pkgId]?.price ?? 0
  const setPrice = (pkgId: number, val: number) => setPrices(prev => ({
    ...prev, [pkgId]: { price: val, is_custom: prev[pkgId]?.is_custom ?? 0 },
  }))

  const save = async () => {
    if (!selectedClientId) return showToast('Select a client first')
    const priceList = customPkgs.map(p => ({ packageId: p.packageId, price: getPrice(p.packageId) }))
    try {
      const r = await fetch('/api/billing/package-prices', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId, prices: priceList }),
      })
      const d = await r.json()
      if (d.ok) showToast('Package prices saved ✓')
      else showToast('Error saving prices')
    } catch { showToast('Error saving prices') }
  }

  const TH: React.CSSProperties = { padding: '5px 8px', fontSize: 9.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap', background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>📦 Package Price Matrix</span>
        <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border2)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)' }}>
          <option value="">Select client…</option>
          {configs.map(c => <option key={c.clientId} value={c.clientId}>{c.clientName}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={save} style={{ marginLeft: 'auto' }}>💾 Save Prices</button>
      </div>
      {customPkgs.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>No custom packages found</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'left' }}>Box</th>
              <th style={{ ...TH, textAlign: 'center' }}>Dims</th>
              <th style={{ ...TH, textAlign: 'right' }}>Our Cost</th>
              <th style={{ ...TH, textAlign: 'right' }}>Charge</th>
              <th style={{ ...TH, textAlign: 'right' }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {customPkgs.map(p => {
              const dims = (p.length && p.width && p.height) ? `${p.length}×${p.width}×${p.height}"` : '—'
              const ourCost = p.unitCost != null ? parseFloat(String(p.unitCost)) : null
              const charge = getPrice(p.packageId)
              const isCustom = (prices[p.packageId]?.is_custom || 0) > 0
              const marginHtml = ourCost != null && charge > 0
                ? (() => {
                    const m = ((charge - ourCost) / charge * 100).toFixed(0)
                    const color = Number(m) >= 30 ? 'var(--green)' : Number(m) >= 0 ? 'var(--yellow, #f59e0b)' : 'var(--red)'
                    return <span style={{ color, fontWeight: 700 }}>{m}%</span>
                  })()
                : <span style={{ color: 'var(--text4)' }}>—</span>
              return (
                <tr key={p.packageId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 600, fontSize: 12 }}>
                    {p.name}
                    {isCustom && <span title="Custom override" style={{ fontSize: 9, color: 'var(--ss-blue)', marginLeft: 4, fontWeight: 600, letterSpacing: '.3px' }}>CUSTOM</span>}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>{dims}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontSize: '11.5px' }}>
                    {ourCost != null
                      ? <span style={{ color: 'var(--text2)' }}>${ourCost.toFixed(3)}</span>
                      : <span style={{ color: 'var(--text4)', fontSize: 10.5 }}>not set</span>}
                  </td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={charge.toFixed(2)}
                      onChange={e => setPrice(p.packageId, parseFloat(e.target.value) || 0)}
                      style={{ width: 62, textAlign: 'right', fontSize: 12, padding: '3px 5px', border: '1px solid var(--border2)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}
                    />
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{marginHtml}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Ref Rate Controls ─────────────────────────────────────────────────────────

function RefRateControls({ from, to, showToast }: { from: string; to: string; showToast: (msg: string) => void }) {
  const [fetching, setFetching] = useState(false)
  const [fetchStatus, setFetchStatus] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRates = async () => {
    setFetching(true); setFetchStatus('Starting…')
    try {
      const r = await fetch('/api/billing/fetch-ref-rates', { method: 'POST' })
      const d = await r.json()
      if (!d.ok && d.message?.includes('Already running')) {
        setFetchStatus('Already running — checking status…')
      } else if (d.total === 0) {
        setFetchStatus('All orders already have ref rates.')
        setFetching(false); return
      } else {
        setFetchStatus(`Fetching rates for ${d.orders} orders (${d.queued} unique combos)…`)
      }
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const s = await fetch('/api/billing/fetch-ref-rates/status').then(r => r.json())
        setFetchStatus(`Progress: ${s.done}/${s.total}${s.errors ? ` (${s.errors} errors)` : ''}`)
        if (!s.running) {
          clearInterval(pollRef.current!)
          setFetchStatus(`✓ Done — ${s.done} combos fetched${s.errors ? `, ${s.errors} errors` : ''}`)
          setFetching(false)
          showToast(`Ref rates fetched: ${s.done} rate combos`)
        }
      }, 5000)
    } catch {
      setFetchStatus('Error — check console')
      setFetching(false)
      showToast('Failed to start ref rate fetch')
    }
  }

  const backfill = async () => {
    setBackfilling(true)
    try {
      const r = await fetch('/api/billing/backfill-ref-rates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const d = await r.json()
      if (d.message) showToast(d.message)
      else showToast(`Backfill done — ${d.filled} orders filled, ${d.missing} missing from cache`)
    } catch { showToast('Backfill failed') }
    finally { setBackfilling(false) }
  }

  return (
    <>
      <button className="btn btn-outline btn-sm" onClick={fetchRates} disabled={fetching}>
        {fetching ? '⏳ Fetching…' : '🔄 Fetch Ref Rates'}
      </button>
      <button className="btn btn-outline btn-sm" onClick={backfill} disabled={backfilling}>
        {backfilling ? '↺ Backfilling…' : '↺ Backfill Ref Rates'}
      </button>
      {fetchStatus && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fetchStatus}</span>}
    </>
  )
}
