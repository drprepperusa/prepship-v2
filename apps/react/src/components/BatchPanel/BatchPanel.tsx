/**
 * BatchPanel — Batch shipping for 2+ selected orders
 * 
 * Uses useReducer for atomic state transitions (no more module-scoped orderBestRate)
 * AbortController for cancellable rate fetching
 * Proper React patterns throughout
 */

import { useReducer, useCallback, useEffect, useRef } from 'react'
import { useToast } from '../../hooks/useToast'
import { useMarkups } from '../../contexts/MarkupsContext'
import { useStores } from '../../contexts/StoresContext'

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
  bestRate?: { cost?: number; shipmentCost?: number; otherCost?: number; carrierCode?: string; serviceCode?: string; serviceName?: string; shippingProviderId?: number }
  _enrichedWeight?: { value: number }
  _enrichedDims?: { length?: number; width?: number; height?: number }
}

interface RateResult {
  serviceCode: string
  serviceName?: string
  carrierCode: string
  shipmentCost?: number
  otherCost?: number
  shippingProviderId?: number
  cost: number
}

interface BatchPanelProps {
  selectedOrderIds: number[]
  orders?: Order[]
  onClose: () => void
  onRefresh?: () => void
}

// ── Batch State Machine ────────────────────────────────────────────────────────

interface OrderRateState {
  status: 'idle' | 'pending' | 'ok' | 'error'
  display?: string
  cost?: number
  rate?: RateResult
}

interface BatchState {
  phase: 'idle' | 'rating' | 'creating' | 'queuing'
  rateResults: Record<number, OrderRateState>
  bestRates: Record<number, RateResult>
  rateSummary: { rated: number; failed: number; total: number; totalCost: number } | null
  // Override dims
  panelWeight: string
  panelL: string
  panelW: string
  panelH: string
  testMode: boolean
}

type BatchAction =
  | { type: 'SET_DIM'; field: 'panelWeight' | 'panelL' | 'panelW' | 'panelH'; value: string }
  | { type: 'SET_TEST_MODE'; value: boolean }
  | { type: 'START_RATING'; orderIds: number[] }
  | { type: 'ORDER_RATED'; orderId: number; rate: RateResult; cost: number }
  | { type: 'ORDER_RATE_ERROR'; orderId: number; error: string }
  | { type: 'RATING_COMPLETE'; rated: number; failed: number; total: number; totalCost: number }
  | { type: 'START_CREATING' }
  | { type: 'START_QUEUING' }
  | { type: 'PHASE_IDLE' }
  | { type: 'RESET' }

function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case 'SET_DIM':
      return { ...state, [action.field]: action.value }
    case 'SET_TEST_MODE':
      return { ...state, testMode: action.value }
    case 'START_RATING': {
      const init: Record<number, OrderRateState> = {}
      action.orderIds.forEach(id => { init[id] = { status: 'pending' } })
      return { ...state, phase: 'rating', rateResults: init, bestRates: {}, rateSummary: null }
    }
    case 'ORDER_RATED':
      return {
        ...state,
        rateResults: { ...state.rateResults, [action.orderId]: { status: 'ok', cost: action.cost, rate: action.rate, display: `${action.rate.carrierCode} · ${action.rate.serviceName || action.rate.serviceCode}` } },
        bestRates: { ...state.bestRates, [action.orderId]: action.rate },
      }
    case 'ORDER_RATE_ERROR':
      return { ...state, rateResults: { ...state.rateResults, [action.orderId]: { status: 'error', display: action.error } } }
    case 'RATING_COMPLETE':
      return { ...state, phase: 'idle', rateSummary: { rated: action.rated, failed: action.failed, total: action.total, totalCost: action.totalCost } }
    case 'START_CREATING':
      return { ...state, phase: 'creating' }
    case 'START_QUEUING':
      return { ...state, phase: 'queuing' }
    case 'PHASE_IDLE':
      return { ...state, phase: 'idle' }
    case 'RESET':
      return initialBatchState
    default:
      return state
  }
}

const initialBatchState: BatchState = {
  phase: 'idle',
  rateResults: {},
  bestRates: {},
  rateSummary: null,
  panelWeight: '',
  panelL: '',
  panelW: '',
  panelH: '',
  testMode: false,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function svcName(code: string, fallback?: string | null) {
  const SERVICE_NAMES: Record<string, string> = {
    usps_priority_mail: 'USPS Priority Mail',
    usps_priority_mail_express: 'USPS Priority Express',
    usps_first_class_mail: 'USPS First Class',
    usps_ground_advantage: 'USPS Ground Advantage',
    ups_ground: 'UPS Ground',
    ups_next_day_air: 'UPS Next Day Air',
    ups_2nd_day_air: 'UPS 2nd Day Air',
    fedex_ground: 'FedEx Ground',
    fedex_home_delivery: 'FedEx Home Delivery',
    fedex_2day: 'FedEx 2Day',
  }
  return SERVICE_NAMES[code] || fallback || code
}

function carrierLabel(code: string) {
  if (code === 'stamps_com' || code === 'usps') return 'USPS'
  if (code.startsWith('fedex')) return 'FedEx'
  if (code.startsWith('ups')) return 'UPS'
  return code.toUpperCase()
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BatchPanel({ selectedOrderIds, orders = [], onClose, onRefresh }: BatchPanelProps) {
  const [state, dispatch] = useReducer(batchReducer, initialBatchState)
  const { showToast } = useToast()
  const { markups, applyMarkup } = useMarkups()
  const { selectedStoreId } = useStores()
  const abortRef = useRef<AbortController | null>(null)

  // Don't render if < 2 orders
  if (selectedOrderIds.length < 2) return null

  const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.orderId))

  const totalUnits = selectedOrders.reduce((s, o) =>
    s + (o.items || []).filter(i => !i.adjustment).reduce((ss, i) => ss + (i.quantity || 1), 0), 0)
  const totalValue = selectedOrders.reduce((s, o) => s + (o.orderTotal || 0), 0)
  const skus = [...new Set(selectedOrders.flatMap(o =>
    (o.items || []).filter(i => !i.adjustment).map(i => i.sku)))]
  const sameSku = skus.length === 1 ? skus[0] : null

  const getOrderParams = useCallback((o: Order) => {
    const wt = parseFloat(state.panelWeight) || (o._enrichedWeight || o.weight)?.value || 0
    const l = parseFloat(state.panelL) || o._enrichedDims?.length || 0
    const w = parseFloat(state.panelW) || o._enrichedDims?.width || 0
    const h = parseFloat(state.panelH) || o._enrichedDims?.height || 0
    return { wt, l, w, h }
  }, [state.panelWeight, state.panelL, state.panelW, state.panelH])

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // ── Rate Shop ──────────────────────────────────────────────────────────────

  const handleRateShop = async () => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    dispatch({ type: 'START_RATING', orderIds: selectedOrders.map(o => o.orderId) })

    let rated = 0, failed = 0, totalCost = 0

    for (const o of selectedOrders) {
      if (signal.aborted) break

      const p = getOrderParams(o)
      const zip = (o.shipTo?.postalCode || '').replace(/\D/g, '').slice(0, 5)
      if (!p.wt || !zip) {
        dispatch({ type: 'ORDER_RATE_ERROR', orderId: o.orderId, error: 'Missing weight/zip' })
        failed++; continue
      }

      try {
        const res = await fetch('/api/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromPostalCode: '90248',
            toPostalCode: zip,
            weight: { value: p.wt, units: 'ounces' },
            dimensions: p.l && p.w && p.h ? { units: 'inches', length: p.l, width: p.w, height: p.h } : undefined,
          }),
          signal,
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rates: Array<{ serviceCode: string; serviceName?: string; carrierCode: string; shipmentCost: number; otherCost: number; shippingProviderId?: number }> = await res.json()
        if (!Array.isArray(rates) || rates.length === 0) throw new Error('No rates')

        const enriched = rates.map(r => {
          const baseCost = (r.shipmentCost || 0) + (r.otherCost || 0)
          const markup = markups[r.shippingProviderId || ''] || markups[r.carrierCode]
          const cost = markup ? applyMarkup(baseCost, markup) : baseCost
          return { ...r, cost }
        })
        const best = enriched.sort((a, b) => a.cost - b.cost)[0]

        totalCost += best.cost
        rated++
        dispatch({ type: 'ORDER_RATED', orderId: o.orderId, rate: best, cost: best.cost })
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') break
        failed++
        dispatch({ type: 'ORDER_RATE_ERROR', orderId: o.orderId, error: (e as Error).message || 'No rates' })
      }
    }

    dispatch({ type: 'RATING_COMPLETE', rated, failed, total: selectedOrders.length, totalCost })
  }

  // ── Create Labels ──────────────────────────────────────────────────────────

  const handleCreateLabels = async () => {
    const missingRate = selectedOrders.find(o => !state.bestRates[o.orderId])
    if (missingRate) {
      showToast(`⚠ Rate Shop first — order ${missingRate.orderNumber} has no rate`)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    dispatch({ type: 'START_CREATING' })
    let created = 0, failed = 0
    const failures: string[] = []

    for (const o of selectedOrders) {
      if (signal.aborted) break
      const best = state.bestRates[o.orderId]
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
            ...(state.testMode ? { testLabel: true } : {}),
          }),
          signal,
        })
        if (!res.ok) throw new Error(await res.text())
        const d = await res.json()
        created++
        // Open label in new tab
        if (d.labelUrl) {
          const a = document.createElement('a')
          a.href = d.labelUrl
          a.download = `label-${d.trackingNumber || o.orderNumber}.pdf`
          a.target = '_blank'
          a.rel = 'noopener'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          await new Promise(r => setTimeout(r, 300))
        }
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') break
        failed++
        failures.push(`${o.orderNumber} (${(e as Error).message || 'unknown'})`)
      }
    }

    dispatch({ type: 'PHASE_IDLE' })

    if (failed === 0) showToast(`✅ Created ${created}/${selectedOrders.length} labels`)
    else if (created === 0) showToast(`❌ Failed: ${failures.slice(0, 3).join(', ')}`)
    else showToast(`⚠️ Created ${created}, ${failed} failed: ${failures.slice(0, 2).join(', ')}`)

    if (created > 0) { onRefresh?.(); onClose() }
  }

  // ── Send to Queue ──────────────────────────────────────────────────────────

  const handleSendToQueue = async () => {
    const missingRates = selectedOrders.filter(o => {
      const r = state.bestRates[o.orderId]
      return !r || !r.serviceCode || !r.carrierCode
    })
    if (missingRates.length > 0) {
      showToast(`⚠ Rate shop first — ${missingRates.length} order(s) missing rates`)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    dispatch({ type: 'START_QUEUING' })
    let queued = 0, failed = 0
    const failures: Array<{ orderNumber: string; error: string }> = []

    for (const o of selectedOrders) {
      if (signal.aborted) break
      const best = state.bestRates[o.orderId]
      if (!best?.serviceCode || !best?.carrierCode) {
        failed++; failures.push({ orderNumber: o.orderNumber, error: 'No rate' })
        continue
      }
      const p = getOrderParams(o)
      try {
        // Step 1: Create label
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
            testLabel: state.testMode,
          }),
          signal,
        })
        if (!labelRes.ok) throw new Error(await labelRes.text())
        const labelData = await labelRes.json()

        // Step 2: Add to queue
        const primaryItem = o.items?.find(i => !i.adjustment)
        const items = o.items?.filter(i => !i.adjustment) || []
        const uniqueSkus = [...new Set(items.map(i => i.sku))]
        const orderQty = items.reduce((s, i) => s + (i.quantity || 1), 0)
        const queueRes = await fetch('/api/queue/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: String(o.orderId),
            order_number: o.orderNumber,
            label_url: labelData.labelUrl || '',
            sku_group_id: uniqueSkus.length === 1 ? `SKU:${uniqueSkus[0]}` : `ORDER:${o.orderId}`,
            primary_sku: primaryItem?.sku || null,
            item_description: primaryItem?.name || null,
            order_qty: orderQty,
            multi_sku_data: uniqueSkus.length > 1
              ? items.map((item) => ({
                  sku: item.sku || '',
                  description: item.name || '',
                  qty: item.quantity || 1,
                }))
              : null,
            client_id: selectedStoreId ?? 1,
          }),
          signal,
        })
        if (!queueRes.ok) throw new Error(await queueRes.text())
        queued++
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') break
        failed++
        failures.push({ orderNumber: o.orderNumber, error: (e as Error).message || 'Failed' })
      }
    }

    dispatch({ type: 'PHASE_IDLE' })

    if (failed === 0) {
      showToast(`✅ Queued ${queued} orders`)
      onRefresh?.(); onClose()
    } else {
      const msg = failures.map(f => `${f.orderNumber}: ${f.error}`).join(' | ')
      showToast(`⚠ ${queued} queued, ${failed} failed: ${msg}`)
    }
  }

  // ── State computations ─────────────────────────────────────────────────────

  const statesMap: Record<string, number> = {}
  selectedOrders.forEach(o => {
    const st = o.shipTo?.state || '?'
    statesMap[st] = (statesMap[st] || 0) + 1
  })
  const stateList = Object.entries(statesMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([st, n]) => `${st} (${n})`).join(', ')

  const isProcessing = state.phase !== 'idle'
  const phaseLabel = state.phase === 'rating' ? 'Shopping rates…'
    : state.phase === 'creating' ? 'Creating labels…'
    : state.phase === 'queuing' ? 'Queuing…'
    : ''

  const hasRates = state.rateSummary !== null && state.rateSummary.rated > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0, bottom: 0,
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

        {/* Override dims */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.4px', marginBottom: 8 }}>Override Weight & Dims (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Weight (oz)', val: state.panelWeight, field: 'panelWeight' as const },
              { label: 'Length (in)', val: state.panelL, field: 'panelL' as const },
              { label: 'Width (in)', val: state.panelW, field: 'panelW' as const },
              { label: 'Height (in)', val: state.panelH, field: 'panelH' as const },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>{f.label}</label>
                <input
                  type="number" step="0.1" min="0" value={f.val}
                  onChange={e => dispatch({ type: 'SET_DIM', field: f.field, value: e.target.value })}
                  placeholder="—"
                  style={{ width: '100%', padding: '5px 7px', border: '1px solid var(--border2)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Orders list */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.4px', marginBottom: 6 }}>Selected Orders</div>
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 14 }}>
          {selectedOrders.map(o => {
            const r = state.rateResults[o.orderId]
            return (
              <div key={o.orderId} style={{ padding: '7px 10px', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--ss-blue)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.orderNumber}
                </span>
                <span style={{ color: 'var(--text3)', fontSize: 10, margin: '0 6px', flexShrink: 0 }}>
                  {o.shipTo?.state} {(o.shipTo?.postalCode || '').slice(0, 5)}
                </span>
                {r ? (
                  r.status === 'pending' ? <span style={{ color: 'var(--text4)', fontSize: 10, flexShrink: 0 }}>⏳</span>
                  : r.status === 'ok' ? <strong style={{ color: 'var(--green)', fontSize: 10, flexShrink: 0 }}>${r.cost?.toFixed(2)}</strong>
                  : <span style={{ color: 'var(--red)', fontSize: 10, flexShrink: 0 }} title={r.display}>❌</span>
                ) : (
                  <span style={{ color: 'var(--text4)', fontSize: 10, flexShrink: 0 }}>—</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Rate summary */}
        {state.rateSummary && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span style={{ fontSize: 12 }}>
                {state.rateSummary.rated} of {state.rateSummary.total} rated
                {state.rateSummary.failed > 0 && <span style={{ color: 'var(--red)' }}> · {state.rateSummary.failed} failed</span>}
              </span>
              <span style={{ color: 'var(--green)', fontSize: 13 }}>Total: ${state.rateSummary.totalCost.toFixed(2)}</span>
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
              Avg: ${state.rateSummary.rated ? (state.rateSummary.totalCost / state.rateSummary.rated).toFixed(2) : '0.00'}/order
            </div>
          </div>
        )}

        {/* Test mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px', background: '#f3e8ff', borderRadius: 6, border: '1px solid #e9d5ff' }}>
          <input
            type="checkbox" id="batch-test-mode"
            checked={state.testMode}
            onChange={e => dispatch({ type: 'SET_TEST_MODE', value: e.target.checked })}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="batch-test-mode" style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🧪 Test mode (no charges)</label>
        </div>

        {/* Action buttons */}
        <button
          onClick={handleRateShop}
          disabled={isProcessing}
          style={{ width: '100%', padding: '10px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.7 : 1, marginBottom: 8 }}
        >
          💰 Rate Shop All
        </button>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={handleCreateLabels}
            disabled={isProcessing || !hasRates}
            style={{ flex: 1, padding: '11px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: isProcessing || !hasRates ? 'not-allowed' : 'pointer', opacity: (isProcessing || !hasRates) ? 0.7 : 1 }}
          >
            🖨️ Print Labels
          </button>
          <button
            onClick={handleSendToQueue}
            disabled={isProcessing || !hasRates}
            style={{ flex: 1, padding: '11px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: isProcessing || !hasRates ? 'not-allowed' : 'pointer', opacity: (isProcessing || !hasRates) ? 0.7 : 1 }}
          >
            📥 Send to Queue
          </button>
        </div>

        {phaseLabel && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--ss-blue-bg)', color: 'var(--ss-blue)', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
            ⏳ {phaseLabel}
          </div>
        )}
      </div>
    </div>
  )
}
