import { useState, useEffect, useRef, useCallback } from 'react'
import { useOrderDetail, useShippingAccounts } from '../../hooks'
import { useRates } from '../../hooks/useRates'

interface OrderPanelProps {
  orderId: number | null
  onClose: () => void
  onRefresh?: () => void
  onSendToQueue?: (orderId: number) => void
}

// Preset box sizes
const PRESETS: Record<string, { w: number; h: number; d: number; weight: number }> = {
  'Small':         { w: 8,  h: 6,  d: 4,  weight: 0.5 },
  'Medium':        { w: 12, h: 9,  d: 4,  weight: 1.0 },
  'Large':         { w: 16, h: 12, d: 6,  weight: 2.0 },
  'Poly Mailer':   { w: 10, h: 13, d: 0,  weight: 0.5 },
}

const CARRIER_LABELS: Record<string, string> = {
  stamps_com: 'USPS',
  usps: 'USPS',
  fedex: 'FedEx',
  fedex_ground: 'FedEx',
  ups: 'UPS',
  ups_ground: 'UPS',
}

function carrierLabel(code: string) {
  if (!code) return ''
  if (code === 'stamps_com' || code === 'usps') return 'USPS'
  if (code.startsWith('fedex')) return 'FedEx'
  if (code.startsWith('ups')) return 'UPS'
  return code.toUpperCase()
}

let _toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  let el = document.getElementById('panel-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'panel-toast'
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:8px;font-size:13px;z-index:9999;max-width:420px;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:opacity .3s;pointer-events:none'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.style.background = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#1e293b'
  el.style.color = '#fff'
  el.style.opacity = '1'
  if (_toastTimer) clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => { if (el) el.style.opacity = '0' }, 4000)
}

export default function OrderPanel({ orderId, onClose, onRefresh, onSendToQueue }: OrderPanelProps) {
  const { order, loading: orderLoading, error: orderError } = useOrderDetail(orderId)
  const { accounts, loading: accountsLoading } = useShippingAccounts()
  const { fetchRates, loading: ratesLoading } = useRates()

  // Dims / weight inputs
  const [weightLbs, setWeightLbs] = useState('')
  const [dimW, setDimW] = useState('')
  const [dimH, setDimH] = useState('')
  const [dimD, setDimD] = useState('')

  // Options
  const [residential, setResidential] = useState(false)
  const [insurance, setInsurance] = useState(false)

  // Rates
  const [availableRates, setAvailableRates] = useState<any[]>([])
  const [selectedRate, setSelectedRate] = useState<any | null>(null)

  // Label state
  const [labelNumber, setLabelNumber] = useState<string | null>(null)
  const [labelId, setLabelId] = useState<string | null>(null)
  const [labelUrl, setLabelUrl] = useState<string | null>(null)
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [voidingLabel, setVoidingLabel] = useState(false)
  const [reprinting, setReprinting] = useState(false)

  // Packages list
  const [packages, setPackages] = useState<any[]>([])
  const [selectedPackageId, setSelectedPackageId] = useState<string>('')

  // Mark shipped external modal
  const [showExternalModal, setShowExternalModal] = useState(false)
  const [externalSource, setExternalSource] = useState('Manual')

  // Rate browser
  const [showRateBrowser, setShowRateBrowser] = useState(false)

  // Rate debounce timer
  const rateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load packages on mount
  useEffect(() => {
    fetch('/api/packages')
      .then(r => r.json())
      .then(data => setPackages(Array.isArray(data) ? data : data.packages || []))
      .catch(() => {})
  }, [])

  // When order loads, populate dims from order data + check for SKU defaults
  useEffect(() => {
    if (!order) return

    // Set dims from order
    const dims = (order as any).rateDims
    if (dims) {
      setDimW(String(dims.width || dims.length || ''))
      setDimH(String(dims.height || ''))
      setDimD(String(dims.length || dims.depth || ''))
    }

    // Set weight (convert oz to lbs)
    if (order.weight?.value) {
      const oz = order.weight.value
      setWeightLbs(String((oz / 16).toFixed(2)))
    }

    // Set residential
    if ((order as any).residential != null) {
      setResidential(!!(order as any).residential)
    }

    // Load existing label if order already shipped
    if ((order as any).label) {
      setLabelNumber((order as any).label.trackingNumber || null)
      setLabelId((order as any).label.labelId || null)
      setLabelUrl((order as any).label.labelUrl || null)
    }

    // Try to load SKU defaults
    const sku = (order.items as any)?.[0]?.sku
    if (sku) {
      fetch(`/api/products/${encodeURIComponent(sku)}/defaults`)
        .then(r => r.ok ? r.json() : null)
        .then(defaults => {
          if (!defaults) return
          if (defaults.weight) setWeightLbs(String((defaults.weight / 16).toFixed(2)))
          if (defaults.dims) {
            setDimW(String(defaults.dims.w || defaults.dims.width || ''))
            setDimH(String(defaults.dims.h || defaults.dims.height || ''))
            setDimD(String(defaults.dims.d || defaults.dims.depth || defaults.dims.length || ''))
          }
        })
        .catch(() => {})
    }
  }, [order?.orderId])

  // Fetch rates when dims/weight/residential change (debounced)
  const triggerRateFetch = useCallback(() => {
    if (rateTimerRef.current) clearTimeout(rateTimerRef.current)
    rateTimerRef.current = setTimeout(async () => {
      const zip = order?.shipTo?.postalCode
      const wt = parseFloat(weightLbs) || 0
      if (!zip || !wt) return

      const storeId = (order as any)?.storeId || null
      const dims = (dimW || dimH || dimD)
        ? { w: parseFloat(dimW) || 0, h: parseFloat(dimH) || 0, d: parseFloat(dimD) || 0 }
        : null

      const rates = await fetchRates(storeId, zip, wt, dims, insurance, residential)
      setAvailableRates(rates)
      if (rates.length > 0 && !selectedRate) {
        setSelectedRate(rates[0])
      }
    }, 500)
  }, [order, weightLbs, dimW, dimH, dimD, insurance, residential, fetchRates, selectedRate])

  useEffect(() => {
    triggerRateFetch()
    return () => { if (rateTimerRef.current) clearTimeout(rateTimerRef.current) }
  }, [weightLbs, dimW, dimH, dimD, insurance, residential, order?.orderId])

  // Apply preset
  const applyPreset = (name: string) => {
    const p = PRESETS[name]
    if (!p) return
    setDimW(String(p.w))
    setDimH(String(p.h))
    setDimD(String(p.d))
    if (p.weight > 0) setWeightLbs(String(p.weight))
  }

  // Apply package dims
  const applyPackage = (pkgId: string) => {
    setSelectedPackageId(pkgId)
    if (!pkgId) return
    const pkg = packages.find((p: any) => String(p.packageId || p.id) === pkgId)
    if (!pkg) return
    if (pkg.length) setDimW(String(pkg.length))
    if (pkg.height) setDimH(String(pkg.height))
    if (pkg.width) setDimD(String(pkg.width))
  }

  // Create label
  const handleCreateLabel = async () => {
    if (!orderId || !selectedRate) {
      showToast('⚠ Please select a rate first', 'error')
      return
    }
    setCreatingLabel(true)
    try {
      const wt = parseFloat(weightLbs) || 0
      const payload: Record<string, unknown> = {
        orderId,
        storeId: (order as any)?.storeId,
        serviceId: selectedRate.serviceId || selectedRate.serviceCode,
        serviceCode: selectedRate.serviceCode,
        carrierCode: selectedRate.carrierCode,
        carrierAccountId: selectedRate.accountId || selectedRate.shippingProviderId,
        shippingProviderId: selectedRate.shippingProviderId || selectedRate.accountId,
        weight: wt,
        weightOz: wt * 16,
        insurance,
        residential,
      }
      if (dimW || dimH || dimD) {
        payload.dims = { w: parseFloat(dimW) || 0, h: parseFloat(dimH) || 0, d: parseFloat(dimD) || 0 }
        payload.length = parseFloat(dimW) || 0
        payload.width = parseFloat(dimD) || 0
        payload.height = parseFloat(dimH) || 0
      }

      const response = await fetch('/api/labels/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(errText || response.statusText)
      }

      const data = await response.json()
      setLabelNumber(data.trackingNumber || data.tracking || null)
      setLabelId(data.labelId || null)
      setLabelUrl(data.labelUrl || null)
      showToast('✅ Label created: ' + (data.trackingNumber || 'OK'), 'success')
      onRefresh?.()

      // Auto-download PDF
      if (data.labelUrl) {
        const a = document.createElement('a')
        a.href = data.labelUrl
        a.download = `label-${data.trackingNumber || orderId}.pdf`
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'Failed to create label'), 'error')
    } finally {
      setCreatingLabel(false)
    }
  }

  // Void label
  const handleVoidLabel = async () => {
    if (!labelId) return
    if (!confirm('Void this label?')) return
    setVoidingLabel(true)
    try {
      const response = await fetch('/api/labels/void-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId }),
      })
      if (!response.ok) throw new Error(await response.text())
      setLabelNumber(null)
      setLabelId(null)
      setLabelUrl(null)
      showToast('✅ Label voided', 'success')
      onRefresh?.()
    } catch (err: any) {
      showToast('❌ ' + err.message, 'error')
    } finally {
      setVoidingLabel(false)
    }
  }

  // Reprint
  const handleReprint = async () => {
    if (!labelId) return
    setReprinting(true)
    try {
      const response = await fetch('/api/labels/reprint-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId }),
      })
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      showToast('✅ Reprinting...', 'success')
      if (data.labelUrl) {
        window.open(data.labelUrl, '_blank')
      }
    } catch (err: any) {
      showToast('❌ ' + err.message, 'error')
    } finally {
      setReprinting(false)
    }
  }

  // Generate return label
  const handleReturnLabel = async () => {
    if (!orderId) return
    try {
      const response = await fetch('/api/labels/generate-return-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, labelId }),
      })
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      showToast('✅ Return label generated', 'success')
      if (data.labelUrl) window.open(data.labelUrl, '_blank')
    } catch (err: any) {
      showToast('❌ ' + err.message, 'error')
    }
  }

  // Mark shipped external
  const handleMarkShippedExternal = async () => {
    if (!orderId) return
    try {
      const response = await fetch('/api/orders/mark-shipped-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, source: externalSource }),
      })
      if (!response.ok) throw new Error(await response.text())
      setShowExternalModal(false)
      showToast('✅ Marked as shipped', 'success')
      onRefresh?.()
    } catch (err: any) {
      showToast('❌ ' + err.message, 'error')
    }
  }

  // Save SKU defaults
  const handleSaveDefaults = async () => {
    const sku = (order?.items as any)?.[0]?.sku
    if (!sku) { showToast('No SKU to save defaults for', 'error'); return }
    try {
      const response = await fetch('/api/products/save-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          weight: (parseFloat(weightLbs) || 0) * 16,
          dims: { w: parseFloat(dimW) || 0, h: parseFloat(dimH) || 0, d: parseFloat(dimD) || 0 },
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      showToast(`✅ Defaults saved for ${sku}`, 'success')
    } catch (err: any) {
      showToast('❌ ' + err.message, 'error')
    }
  }

  // Send to print queue
  const handleSendToQueue = () => {
    if (orderId && onSendToQueue) {
      onSendToQueue(orderId)
      showToast('Added to print queue', 'success')
    }
  }

  if (!orderId || (!order && !orderLoading && !orderError)) {
    return (
      <div className="order-panel">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', flexDirection: 'column', gap: '12px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text2)', marginBottom: '4px' }}>No order selected</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>Click any row to view details</div>
            <div style={{ fontSize: '11px', color: 'var(--text4)', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <div><kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>↑↓</kbd> Navigate rows</div>
              <div><kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>Enter</kbd> Select</div>
              <div><kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>Esc</kbd> Close</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (orderLoading) {
    return (
      <div className="order-panel">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '8px' }}>
          <div className="spinner"></div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Loading order…</div>
        </div>
      </div>
    )
  }

  if (orderError || !order) {
    return (
      <div className="order-panel">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ fontSize: '13px', color: 'var(--text2)', textAlign: 'center' }}>
            ⚠️ {orderError?.message || 'Failed to load order'}
          </div>
        </div>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 7px',
    fontSize: '12px',
    border: '1px solid var(--border2)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--text3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    marginBottom: '3px',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    marginBottom: '6px',
  }

  return (
    <div className="order-panel">
      <div className="panel-inner">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>{order.orderNumber}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
              {new Date(order.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text3)', padding: '4px 8px', lineHeight: '1' }}
          >
            ✕
          </button>
        </div>

        {/* Ship To */}
        {order.shipTo && (
          <div style={{ marginBottom: '12px' }}>
            <div style={sectionLabel}>Ship To</div>
            <div style={{ fontSize: '12px' }}>
              <div style={{ fontWeight: '600', color: 'var(--text)' }}>{order.shipTo.name}</div>
              <div style={{ color: 'var(--text2)', marginTop: '2px', fontSize: '11px' }}>
                {order.shipTo.city}, {order.shipTo.state} {order.shipTo.postalCode}
              </div>
            </div>
          </div>
        )}

        {/* Store/Client Info */}
        {(order as any).clientName && (
          <div style={{ marginBottom: '12px' }}>
            <div style={sectionLabel}>Store</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>{(order as any).clientName}</div>
          </div>
        )}

        {/* Items */}
        {order.items && order.items.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={sectionLabel}>Items ({order.items.length})</div>
            {order.items.slice(0, 3).map((item: any, idx: number) => (
              <div key={idx} style={{ fontSize: '11px', padding: '4px 6px', backgroundColor: 'var(--surface2)', borderRadius: '4px', marginBottom: '3px' }}>
                <div style={{ fontWeight: '600', color: 'var(--text)' }}>{item.name || 'Unnamed'}</div>
                <div style={{ color: 'var(--text3)', marginTop: '1px' }}>
                  {item.sku} · Qty: {item.quantity}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Package Presets */}
        <div style={{ marginBottom: '10px' }}>
          <div style={sectionLabel}>Package Presets</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {Object.keys(PRESETS).map(name => (
              <button
                key={name}
                onClick={() => applyPreset(name)}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  border: '1px solid var(--border2)',
                  borderRadius: '3px',
                  backgroundColor: 'var(--surface2)',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Package Picker */}
        {packages.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Package Library</label>
            <select
              value={selectedPackageId}
              onChange={e => applyPackage(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select package…</option>
              {packages.map((p: any) => (
                <option key={p.packageId || p.id} value={String(p.packageId || p.id)}>
                  {p.name} ({p.length || p.l}×{p.height || p.h}×{p.width || p.w})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Weight & Dims */}
        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={sectionLabel}>Weight & Dimensions</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
            <div>
              <label style={labelStyle}>Weight (lbs)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={weightLbs}
                onChange={e => setWeightLbs(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Width (in)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={dimW}
                onChange={e => setDimW(e.target.value)}
                placeholder="0.0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Height (in)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={dimH}
                onChange={e => setDimH(e.target.value)}
                placeholder="0.0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Depth (in)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={dimD}
                onChange={e => setDimD(e.target.value)}
                placeholder="0.0"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={residential} onChange={e => setResidential(e.target.checked)} />
              Residential
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={insurance} onChange={e => setInsurance(e.target.checked)} />
              Insurance
            </label>
          </div>
        </div>

        {/* Available Rates */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Rates</span>
            {ratesLoading && <span style={{ fontSize: '10px', color: 'var(--text3)' }}>loading…</span>}
            <button
              onClick={() => setShowRateBrowser(true)}
              style={{
                marginLeft: 'auto',
                fontSize: '10px',
                padding: '2px 7px',
                border: '1px solid var(--border2)',
                borderRadius: '3px',
                background: 'var(--surface2)',
                cursor: 'pointer',
                color: 'var(--text2)',
              }}
            >
              Browse all
            </button>
          </div>

          {availableRates.length === 0 && !ratesLoading ? (
            <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '4px' }}>
              Enter weight to fetch rates
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '130px', overflowY: 'auto' }}>
              {availableRates.slice(0, 8).map((rate, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedRate(rate)}
                  style={{
                    padding: '5px 8px',
                    backgroundColor: selectedRate === rate ? 'var(--ss-blue)' : 'var(--surface2)',
                    color: selectedRate === rate ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (selectedRate === rate ? 'var(--ss-blue)' : 'var(--border)'),
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600' }}>
                      {carrierLabel(rate.carrier || rate.carrierCode || '')} {rate.service || rate.serviceName || ''}
                    </span>
                    <span style={{ fontWeight: '700' }}>${(rate.price || 0).toFixed(2)}</span>
                  </div>
                  {rate.deliveryDays && (
                    <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '1px' }}>
                      {rate.deliveryDays} day{rate.deliveryDays !== 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create Label */}
        {!labelNumber ? (
          <div style={{ marginBottom: '10px' }}>
            <button
              onClick={handleCreateLabel}
              disabled={creatingLabel || !selectedRate}
              style={{
                width: '100%',
                padding: '9px',
                backgroundColor: selectedRate ? 'var(--ss-blue)' : 'var(--surface2)',
                color: selectedRate ? '#fff' : 'var(--text3)',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: selectedRate && !creatingLabel ? 'pointer' : 'not-allowed',
                opacity: creatingLabel ? 0.7 : 1,
              }}
            >
              {creatingLabel ? '⏳ Creating…' : '🖨️ Create Label'}
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={sectionLabel}>Label Created</div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--ss-blue)', fontWeight: '600', marginBottom: '8px', wordBreak: 'break-all' }}>
              {labelNumber}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {labelUrl && (
                <a
                  href={labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '5px',
                    backgroundColor: 'var(--ss-blue)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    textAlign: 'center',
                    textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  📄 View
                </a>
              )}
              <button
                onClick={handleReprint}
                disabled={reprinting}
                style={{
                  flex: 1,
                  padding: '5px',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border2)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {reprinting ? '⏳' : '🖨️ Reprint'}
              </button>
              <button
                onClick={handleVoidLabel}
                disabled={voidingLabel}
                style={{
                  flex: 1,
                  padding: '5px',
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {voidingLabel ? '⏳' : '✕ Void'}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
          <button
            onClick={handleReturnLabel}
            style={{
              padding: '6px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🔄 Generate Return Label
          </button>
          <button
            onClick={() => setShowExternalModal(true)}
            style={{
              padding: '6px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            📋 Mark Shipped External
          </button>
          {onSendToQueue && (
            <button
              onClick={handleSendToQueue}
              style={{
                padding: '6px',
                backgroundColor: '#f0fdf4',
                color: '#16a34a',
                border: '1px solid #bbf7d0',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              📥 Send to Print Queue
            </button>
          )}
          <button
            onClick={handleSaveDefaults}
            style={{
              padding: '6px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text2)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            💾 Save Dims as SKU Defaults
          </button>
        </div>

        {/* Mark Shipped External Modal */}
        {showExternalModal && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9100,
              backgroundColor: 'rgba(0,0,0,.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setShowExternalModal(false)}
          >
            <div
              style={{
                backgroundColor: 'var(--surface)',
                borderRadius: '10px',
                padding: '20px',
                width: '320px',
                boxShadow: 'var(--shadow-lg)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '12px' }}>Mark as Shipped Externally</div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Shipping Source</label>
                <select
                  value={externalSource}
                  onChange={e => setExternalSource(e.target.value)}
                  style={inputStyle}
                >
                  <option value="eBay">eBay</option>
                  <option value="Amazon">Amazon</option>
                  <option value="Manual">Manual</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowExternalModal(false)}
                  style={{ padding: '7px 14px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkShippedExternal}
                  style={{ padding: '7px 14px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Mark Shipped
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rate Browser Modal */}
        {showRateBrowser && order && (
          <RateBrowserInline
            order={order}
            weight={parseFloat(weightLbs) || 0}
            dims={dimW ? { w: parseFloat(dimW) || 0, h: parseFloat(dimH) || 0, d: parseFloat(dimD) || 0 } : null}
            insurance={insurance}
            residential={residential}
            onSelect={rate => {
              setSelectedRate(rate)
              setShowRateBrowser(false)
            }}
            onClose={() => setShowRateBrowser(false)}
          />
        )}
      </div>
    </div>
  )
}

// ── Inline Rate Browser Modal ─────────────────────────────────────────────────

interface RateBrowserInlineProps {
  order: any
  weight: number
  dims: { w: number; h: number; d: number } | null
  insurance: boolean
  residential: boolean
  onSelect: (rate: any) => void
  onClose: () => void
}

function RateBrowserInline({ order, weight, dims, insurance, residential, onSelect, onClose }: RateBrowserInlineProps) {
  const { fetchRates, loading } = useRates()
  const [rates, setRates] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<'price' | 'deliveryDays'>('price')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterCarrier, setFilterCarrier] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    const zip = order?.shipTo?.postalCode
    if (!zip || !weight) return
    const storeId = order?.storeId || null
    fetchRates(storeId, zip, weight, dims, insurance, residential).then(r => {
      setRates(r)
    })
  }, [])

  const carriers = [...new Set(rates.map(r => r.carrier || r.carrierCode || ''))]

  const sorted = [...rates]
    .filter(r => !filterCarrier || (r.carrier || r.carrierCode) === filterCarrier)
    .sort((a, b) => {
      const av = sortKey === 'price' ? (a.price || 0) : (a.deliveryDays || 99)
      const bv = sortKey === 'price' ? (b.price || 0) : (b.deliveryDays || 99)
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const handleSort = (key: 'price' | 'deliveryDays') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setHighlighted(h => Math.min(h + 1, sorted.length - 1))
      if (e.key === 'ArrowUp') setHighlighted(h => Math.max(h - 1, 0))
      if (e.key === 'Enter' && sorted[highlighted]) onSelect(sorted[highlighted])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sorted, highlighted, onClose, onSelect])

  const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    color: 'var(--text3)',
    borderBottom: '2px solid var(--border)',
    background: 'var(--surface2)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        backgroundColor: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '10px',
          width: '700px',
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '2px solid var(--ss-blue)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: '800', flex: 1 }}>
            💰 Rate Browser — {order.orderNumber}
          </div>
          <select
            value={filterCarrier}
            onChange={e => setFilterCarrier(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--text)' }}
          >
            <option value="">All Carriers</option>
            {carriers.map(c => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
          <button
            onClick={() => {
              const zip = order?.shipTo?.postalCode
              if (zip && weight) {
                fetchRates(order?.storeId || null, zip, weight, dims, insurance, residential).then(r => setRates(r))
              }
            }}
            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', cursor: 'pointer', color: 'var(--text)' }}
          >
            ↻ Refresh
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
              <div className="spinner"></div>
              <div style={{ marginTop: '8px', fontSize: '12px' }}>Fetching rates…</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Carrier</th>
                  <th style={thStyle}>Service</th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('price')}>
                    Price {sortKey === 'price' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('deliveryDays')}>
                    Est. Delivery {sortKey === 'deliveryDays' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((rate, idx) => (
                  <tr
                    key={idx}
                    onClick={() => onSelect(rate)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: idx === highlighted ? 'var(--ss-blue-bg)' : 'transparent',
                    }}
                    onMouseEnter={() => setHighlighted(idx)}
                  >
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '600' }}>
                      {carrierLabel(rate.carrier || rate.carrierCode || '')}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                      {rate.service || rate.serviceName || ''}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700', color: 'var(--green)' }}>
                      ${(rate.price || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text2)' }}>
                      {rate.deliveryDays ? `${rate.deliveryDays} day${rate.deliveryDays !== 1 ? 's' : ''}` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                      <button
                        onClick={e => { e.stopPropagation(); onSelect(rate) }}
                        style={{
                          padding: '3px 10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: 'var(--ss-blue)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                      No rates found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text3)', flexShrink: 0 }}>
          {sorted.length} rate{sorted.length !== 1 ? 's' : ''} · Click row or press Enter to select · Esc to close
        </div>
      </div>
    </div>
  )
}
