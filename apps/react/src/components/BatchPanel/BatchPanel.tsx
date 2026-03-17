import { useState, useCallback, useEffect } from 'react'
import { useToast } from '../../hooks/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Order {
  orderId: number
  orderNumber: string
  shipTo?: { name?: string; city?: string; state?: string; postalCode?: string }
  items?: Array<{ sku: string; name: string; quantity: number; adjustment?: boolean }>
  weight?: { value: number; units?: string }
  carrierCode?: string
  serviceCode?: string
  orderTotal?: number
  shippingAccountName?: string
  bestRate?: { cost?: number; carrierCode?: string; serviceCode?: string; shippingProviderId?: number }
  _enrichedWeight?: { value: number }
  _enrichedDims?: { length?: number; width?: number; height?: number }
}

interface RateResult {
  serviceCode: string
  serviceName?: string
  carrierCode: string
  shipmentCost: number
  otherCost?: number
  shippingProviderId?: number
  cost?: number
}

interface BatchPanelProps {
  selectedOrderIds: number[]
  orders?: Order[]
  onClose: () => void
  onRefresh?: () => void
}

// ── Service name map ───────────────────────────────────────────────────────────

const SERVICE_NAMES: Record<string, string> = {
  'usps_priority_mail': 'USPS Priority Mail',
  'usps_priority_mail_express': 'USPS Priority Express',
  'usps_first_class_mail': 'USPS First Class',
  'usps_ground_advantage': 'USPS Ground Advantage',
  'ups_ground': 'UPS Ground',
  'ups_next_day_air': 'UPS Next Day Air',
  'ups_2nd_day_air': 'UPS 2nd Day Air',
  'fedex_ground': 'FedEx Ground',
  'fedex_home_delivery': 'FedEx Home Delivery',
  'fedex_2day': 'FedEx 2Day',
}

function svcName(code: string, fallback?: string) {
  return SERVICE_NAMES[code] || fallback || code
}

function carrierLabel(code: string) {
  if (code === 'stamps_com' || code === 'usps') return 'USPS'
  if (code.startsWith('fedex')) return 'FedEx'
  if (code.startsWith('ups')) return 'UPS'
  return code.toUpperCase()
}

// ── Best Rate State ────────────────────────────────────────────────────────────

const orderBestRate: Record<number, RateResult> = {}

// ── Carrier Markups ────────────────────────────────────────────────────────────

interface MarkupData {
  carrierCode: string
  markup: number // percentage
  markupType: 'percent' | 'flat'
}

async function fetchMarkups(): Promise<MarkupData[]> {
  try {
    const res = await fetch('/api/accounts/markups')
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : data.markups || []
  } catch {
    return []
  }
}

function applyMarkup(cost: number, carrier: string, markups: MarkupData[]): number {
  const m = markups.find(mx => mx.carrierCode === carrier)
  if (!m) return cost
  if (m.markupType === 'percent') return cost * (1 + m.markup / 100)
  return cost + m.markup
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BatchPanel({ selectedOrderIds, orders = [], onClose, onRefresh }: BatchPanelProps) {
  // Don't render if < 2 orders selected
  if (selectedOrderIds.length < 2) return null

  const { showToast } = useToast()
  const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.orderId))

  const totalUnits = selectedOrders.reduce((s, o) =>
    s + (o.items || []).filter(i => !i.adjustment).reduce((ss, i) => ss + (i.quantity || 1), 0), 0)
  const totalValue = selectedOrders.reduce((s, o) => s + (o.orderTotal || 0), 0)
  const skus = [...new Set(selectedOrders.flatMap(o =>
    (o.items || []).filter(i => !i.adjustment).map(i => i.sku)))]
  const sameSku = skus.length === 1 ? skus[0] : null

  // State
  const [panelWeight, setPanelWeight] = useState('')
  const [panelL, setPanelL] = useState('')
  const [panelW, setPanelW] = useState('')
  const [panelH, setPanelH] = useState('')
  const [testMode, setTestMode] = useState(false)
  const [rateResults, setRateResults] = useState<Record<number, { status: 'pending' | 'ok' | 'error'; display?: string; cost?: number }>>({})
  const [rateSummary, setRateSummary] = useState<{ rated: number; failed: number; total: number; totalCost: number } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'rating' | 'creating' | 'queuing'>('idle')
  const [markups, setMarkups] = useState<MarkupData[]>([])

  // Load markups on mount
  useEffect(() => {
    fetchMarkups().then(setMarkups)
  }, [])

  const getOrderParams = useCallback((o: Order) => {
    const wt = parseFloat(panelWeight) || (o._enrichedWeight || o.weight)?.value || 0
    const l = parseFloat(panelL) || o._enrichedDims?.length || 0
    const w = parseFloat(panelW) || o._enrichedDims?.width || 0
    const h = parseFloat(panelH) || o._enrichedDims?.height || 0
    return { wt, l, w, h }
  }, [panelWeight, panelL, panelW, panelH])

  // ── Rate Shop ──────────────────────────────────────────────────────────────

  const handleRateShop = async () => {
    setIsProcessing(true); setPhase('rating')
    const init: typeof rateResults = {}
    selectedOrders.forEach(o => { init[o.orderId] = { status: 'pending' } })
    setRateResults({ ...init })

    let rated = 0, failed = 0, totalCost = 0

    for (const o of selectedOrders) {
      const p = getOrderParams(o)
      const zip = (o.shipTo?.postalCode || '').replace(/\D/g, '').slice(0, 5)
      if (!p.wt || !zip) {
        setRateResults(prev => ({ ...prev, [o.orderId]: { status: 'error', display: 'Missing weight/zip' } }))
        failed++; continue
      }
      try {
        const res = await fetch('/api/rates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromPostalCode: '90248', toPostalCode: zip,
            weight: { value: p.wt, units: 'ounces' },
            dimensions: { units: 'inches', length: p.l, width: p.w, height: p.h },
          }),
        })
        const rates: RateResult[] = await res.json()
        if (!Array.isArray(rates) || rates.length === 0) throw new Error('No rates')
        const sorted = rates
          .map(r => ({ ...r, cost: applyMarkup((r.shipmentCost || 0) + (r.otherCost || 0), r.carrierCode, markups) }))
          .sort((a, b) => a.cost - b.cost)
        const best = sorted[0]
        orderBestRate[o.orderId] = best
        const cost = best.cost || 0
        totalCost += cost
        rated++
        setRateResults(prev => ({
          ...prev,
          [o.orderId]: {
            status: 'ok',
            display: `${carrierLabel(best.carrierCode)} · ${svcName(best.serviceCode, best.serviceName)}`,
            cost,
          },
        }))
      } catch (e: any) {
        failed++
        setRateResults(prev => ({ ...prev, [o.orderId]: { status: 'error', display: e.message || 'No rates' } }))
      }
    }

    setRateSummary({ rated, failed, total: selectedOrders.length, totalCost })
    setIsProcessing(false); setPhase('idle')
  }

  // ── Create Labels ──────────────────────────────────────────────────────────

  const handleCreateLabels = async () => {
    const missingRate = selectedOrders.find(o => !orderBestRate[o.orderId])
    if (missingRate) {
      showToast(`⚠ Rate Shop first — order ${missingRate.orderNumber} has no rate`)
      return
    }
    setIsProcessing(true); setPhase('creating')
    let created = 0, failed = 0
    const failures: string[] = []
    const downloads: Array<{ orderNumber: string; tracking: string; labelUrl: string }> = []

    for (const o of selectedOrders) {
      const best = orderBestRate[o.orderId]
      if (!best?.serviceCode || !best?.carrierCode) {
        failed++; failures.push(`${o.orderNumber} (no rate)`)
        continue
      }
      const p = getOrderParams(o)
      try {
        const res = await fetch('/api/labels/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: o.orderId,
            serviceCode: best.serviceCode,
            carrierCode: best.carrierCode,
            shippingProviderId: best.shippingProviderId,
            packageCode: 'package',
            ...(p.wt ? { weightOz: p.wt } : {}),
            ...(p.l && p.w && p.h ? { length: p.l, width: p.w, height: p.h } : {}),
            ...(testMode ? { testLabel: true } : {}),
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const d = await res.json()
        created++
        if (d.labelUrl) downloads.push({ orderNumber: o.orderNumber, tracking: d.trackingNumber, labelUrl: d.labelUrl })
      } catch (e: any) {
        failed++; failures.push(`${o.orderNumber} (${e.message || 'unknown'})`)
      }
    }

    if (failed === 0) showToast(`✅ Created ${created}/${selectedOrders.length} labels`)
    else if (created === 0) showToast(`❌ Failed to create ${failed}/${selectedOrders.length} labels: ${failures.slice(0, 3).join(', ')}`)
    else showToast(`⚠️ Created ${created}, ${failed} failed: ${failures.slice(0, 2).join(', ')}`)

    for (const { orderNumber, tracking, labelUrl } of downloads) {
      try {
        const a = document.createElement('a')
        a.href = labelUrl; a.download = `label-${tracking || orderNumber}.pdf`
        a.target = '_blank'; a.rel = 'noopener'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch {}
    }

    setIsProcessing(false); setPhase('idle')
    if (created > 0) { onRefresh?.(); onClose() }
  }

  // ── Send to Queue ──────────────────────────────────────────────────────────

  const handleSendToQueue = async () => {
    const missingRates = selectedOrders.filter(o => {
      const r = orderBestRate[o.orderId]
      return !r || !r.serviceCode || !r.carrierCode
    })
    if (missingRates.length > 0) {
      showToast(`⚠ Rate shop first — ${missingRates.length} order(s) missing rates`)
      return
    }

    setIsProcessing(true); setPhase('queuing')
    let queued = 0, failed = 0
    const failures: Array<{ orderNumber: string; error: string }> = []

    for (const o of selectedOrders) {
      const best = orderBestRate[o.orderId]
      if (!best?.serviceCode || !best?.carrierCode) {
        failed++; failures.push({ orderNumber: o.orderNumber, error: 'No rate' })
        continue
      }
      const p = getOrderParams(o)
      try {
        const labelRes = await fetch('/api/labels/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: o.orderId,
            carrierCode: best.carrierCode,
            serviceCode: best.serviceCode,
            shippingProviderId: best.shippingProviderId,
            weightOz: p.wt,
            packageCode: 'package',
            length: p.l, width: p.w, height: p.h,
            testLabel: testMode,
          }),
        })
        if (!labelRes.ok) throw new Error(await labelRes.text())
        const labelData = await labelRes.json()

        const queueRes = await fetch('/api/queue/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: o.orderId, labelId: labelData.labelId }),
        })
        if (!queueRes.ok) throw new Error(await queueRes.text())
        queued++
      } catch (e: any) {
        failed++; failures.push({ orderNumber: o.orderNumber, error: e.message || 'Failed' })
      }
    }

    setIsProcessing(false); setPhase('idle')
    if (failed === 0) {
      showToast(`✅ Queued ${queued} orders`)
      onRefresh?.(); onClose()
    } else {
      const msg = failures.map(f => `${f.orderNumber}: ${f.error}`).join(' | ')
      showToast(`⚠ ${queued} queued, ${failed} failed: ${msg}`)
    }
  }

  const statesMap: Record<string, number> = {}
  selectedOrders.forEach(o => {
    const st = o.shipTo?.state || '?'
    statesMap[st] = (statesMap[st] || 0) + 1
  })
  const stateList = Object.entries(statesMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([st, n]) => `${st} (${n})`).join(', ')

  const phaseLabel = phase === 'rating' ? 'Shopping rates…' : phase === 'creating' ? 'Creating labels…' : phase === 'queuing' ? 'Queuing…' : ''

  // ── Render as right sidebar panel ─────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: 360,
      zIndex: 8000,
      backgroundColor: 'var(--surface)',
      borderLeft: '2px solid var(--ss-blue)',
      boxShadow: '-4px 0 20px rgba(0,0,0,.15)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '2px solid var(--ss-blue)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 28 }}>📦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Batch Ship</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{selectedOrders.length} orders · {totalUnits} units · ${totalValue.toFixed(2)}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px' }}>
        {/* SKU info */}
        {sameSku ? (
          <div style={{ background: 'var(--ss-blue-bg)', border: '1px solid var(--ss-blue)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ss-blue)', letterSpacing: '.4px', marginBottom: 3 }}>Same SKU</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{selectedOrders[0]?.items?.find(i => !i.adjustment)?.name || sameSku}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{sameSku}</div>
          </div>
        ) : (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>⚠ Multi-SKU — {skus.length} different products</div>
          </div>
        )}

        {/* Destinations */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.4px', marginBottom: 4 }}>Destinations</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text2)', marginBottom: 14 }}>{stateList}</div>

        {/* Shared dims override */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.4px', marginBottom: 8 }}>Override Weight & Dims (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Weight (oz)', val: panelWeight, set: setPanelWeight },
              { label: 'Length (in)', val: panelL, set: setPanelL },
              { label: 'Width (in)', val: panelW, set: setPanelW },
              { label: 'Height (in)', val: panelH, set: setPanelH },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' }}>{f.label}</label>
                <input type="number" step="0.1" min="0" value={f.val} onChange={e => f.set(e.target.value)} placeholder="—"
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid var(--border2)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Orders list with rate results */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.4px', marginBottom: 6 }}>Selected Orders</div>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 14 }}>
          {selectedOrders.map(o => {
            const r = rateResults[o.orderId]
            return (
              <div key={o.orderId} style={{ padding: '7px 10px', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--ss-blue)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderNumber}</span>
                <span style={{ color: 'var(--text3)', fontSize: 10, margin: '0 6px', flexShrink: 0 }}>{o.shipTo?.state} {(o.shipTo?.postalCode || '').slice(0, 5)}</span>
                {r ? (
                  r.status === 'pending' ? (
                    <span style={{ color: 'var(--text4)', fontSize: 10, flexShrink: 0 }}>⏳</span>
                  ) : r.status === 'ok' ? (
                    <span style={{ fontSize: 10, flexShrink: 0 }}>
                      <strong style={{ color: 'var(--green)' }}>${r.cost?.toFixed(2)}</strong>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--red)', fontSize: 10, flexShrink: 0 }}>❌</span>
                  )
                ) : (
                  <span style={{ color: 'var(--text4)', fontSize: 10, flexShrink: 0 }}>—</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Rate summary */}
        {rateSummary && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span style={{ fontSize: 12 }}>{rateSummary.rated} of {rateSummary.total} rated{rateSummary.failed > 0 && <span style={{ color: 'var(--red)' }}> · {rateSummary.failed} failed</span>}</span>
              <span style={{ color: 'var(--green)', fontSize: 13 }}>Total: ${rateSummary.totalCost.toFixed(2)}</span>
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>Avg: ${rateSummary.rated ? (rateSummary.totalCost / rateSummary.rated).toFixed(2) : '0.00'}/order</div>
          </div>
        )}

        {/* Test mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px', background: '#f3e8ff', borderRadius: 6, border: '1px solid #e9d5ff' }}>
          <input type="checkbox" id="batch-test-mode" checked={testMode} onChange={e => setTestMode(e.target.checked)} style={{ cursor: 'pointer' }} />
          <label htmlFor="batch-test-mode" style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🧪 Test mode (no charges)</label>
        </div>

        {/* Action buttons */}
        <button
          onClick={handleRateShop}
          disabled={isProcessing}
          style={{ width: '100%', padding: '10px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isProcessing ? 0.7 : 1, marginBottom: 8 }}
        >
          💰 Rate Shop All
        </button>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={handleCreateLabels}
            disabled={isProcessing || !rateSummary || rateSummary.rated === 0}
            style={{ flex: 1, padding: '11px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (isProcessing || !rateSummary || rateSummary.rated === 0) ? 0.7 : 1 }}
          >
            🖨️ Print Labels
          </button>
          <button
            onClick={handleSendToQueue}
            disabled={isProcessing || !rateSummary || rateSummary.rated === 0}
            style={{ flex: 1, padding: '11px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (isProcessing || !rateSummary || rateSummary.rated === 0) ? 0.7 : 1 }}
          >
            📥 Send to Queue
          </button>
        </div>

        {phaseLabel && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--ss-blue-bg)', color: 'var(--ss-blue)', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
            ⏳ {phaseLabel}
          </div>
        )}

        {markups.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            Carrier markups applied: {markups.map(m => `${m.carrierCode} +${m.markup}${m.markupType === 'percent' ? '%' : '$'}`).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}
