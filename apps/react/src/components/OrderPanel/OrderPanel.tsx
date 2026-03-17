import { useState, useEffect } from 'react'
import { useOrderDetail, useShippingAccounts } from '../../hooks'
import type { RateDto } from '@prepshipv2/contracts/rates/contracts'

interface OrderPanelProps {
  orderId: number | null
  onClose: () => void
}

export default function OrderPanel({ orderId, onClose }: OrderPanelProps) {
  const { order, loading: orderLoading, error: orderError } = useOrderDetail(orderId)
  const { accounts, loading: accountsLoading } = useShippingAccounts()
  
  const [selectedCarrier, setSelectedCarrier] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [selectedRate, setSelectedRate] = useState<RateDto | null>(null)
  const [availableRates, setAvailableRates] = useState<RateDto[]>([])
  const [ratesLoading, setRatesLoading] = useState(false)

  // Fetch rates when order loads
  useEffect(() => {
    if (!order?.shipTo?.postalCode || !order?.weight?.value) {
      setAvailableRates([])
      return
    }

    const fetchRates = async () => {
      setRatesLoading(true)
      try {
        const response = await fetch(
          `/api/rates/cached?wt=${order.weight.value}&zip=${order.shipTo.postalCode}&residential=${order.residential ? 'true' : 'false'}`
        )
        const data = await response.json()
        setAvailableRates(data.rates || [])
      } catch (error) {
        console.error('Failed to fetch rates:', error)
      } finally {
        setRatesLoading(false)
      }
    }

    fetchRates()
  }, [order?.shipTo?.postalCode, order?.weight?.value, order?.residential])

  const handleCreateLabel = async () => {
    if (!orderId || !selectedCarrier || !selectedService) {
      alert('Please select a carrier and service')
      return
    }

    try {
      const response = await fetch('/api/batch/create-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [orderId] }),
      })
      
      if (response.ok) {
        alert('Label created successfully')
      } else {
        alert('Failed to create label')
      }
    } catch (error) {
      console.error('Error creating label:', error)
      alert('Error creating label')
    }
  }

  if (!order) {
    return (
      <div className="order-panel">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', flexDirection: 'column', gap: '12px' }}>
          {orderLoading ? (
            <>
              <div className="spinner"></div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>Loading order…</div>
            </>
          ) : orderError ? (
            <>
              <div style={{ fontSize: '13px', textAlign: 'center', color: 'var(--text2)' }}>
                ⚠️ {orderError.message}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text2)', marginBottom: '4px' }}>No order selected</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>Click any row to view details</div>
              <div style={{ fontSize: '11px', color: 'var(--text4)', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                <div><kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>↑↓</kbd> Navigate rows</div>
                <div><kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>Enter</kbd> Select / deselect</div>
                <div><kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>Esc</kbd> Deselect &amp; close</div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="order-panel">
      <div className="panel-inner">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>{order.orderNumber}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
              {new Date(order.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text3)',
              padding: '4px 8px',
              lineHeight: '1',
            }}
          >
            ✕
          </button>
        </div>

        {/* Ship To */}
        {order.shipTo && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Ship To</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>
              <div style={{ fontWeight: '600' }}>{order.shipTo.name}</div>
              <div style={{ color: 'var(--text2)', marginTop: '2px' }}>{order.shipTo.city}, {order.shipTo.state} {order.shipTo.postalCode}</div>
            </div>
          </div>
        )}

        {/* Store/Client Info */}
        {order.clientName && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Store / Client</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>
              {order.clientName}
            </div>
          </div>
        )}

        {/* Items */}
        {order.items && Array.isArray(order.items) && order.items.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Items ({order.items.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {order.items.map((item: any, idx: number) => (
                <div key={idx} style={{ fontSize: '12px', padding: '6px 8px', backgroundColor: 'var(--surface2)', borderRadius: '4px' }}>
                  <div style={{ fontWeight: '600', color: 'var(--text)' }}>{item.name || 'Unnamed Item'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                    SKU: {item.sku || 'N/A'} • Qty: {item.quantity || 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weight & Dimensions */}
        {order.weight && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Weight & Dimensions</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>
              {order.weight.value} oz
              {order.rateDims && (
                <div style={{ color: 'var(--text2)', marginTop: '4px', fontSize: '11px' }}>
                  {order.rateDims.length}" × {order.rateDims.width}" × {order.rateDims.height}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* Available Rates */}
        {availableRates.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Available Rates {ratesLoading && <span style={{ fontSize: '10px' }}>loading…</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflow: 'auto' }}>
              {availableRates.slice(0, 5).map((rate, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedRate(rate)}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: selectedRate === rate ? 'var(--ss-blue)' : 'var(--surface2)',
                    color: selectedRate === rate ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (selectedRate === rate ? 'var(--ss-blue)' : 'var(--border)'),
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: '600' }}>{rate.serviceName}</div>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>
                    ${(rate.shipmentCost / 100).toFixed(2)} • {rate.deliveryDays} days
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shipping / Label Section */}
        <div style={{ marginBottom: '14px', padding: '10px', backgroundColor: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Create Label</div>

          {accountsLoading ? (
            <div style={{ fontSize: '12px', color: 'var(--text2)', textAlign: 'center', padding: '8px' }}>
              Loading carriers…
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px' }}>Carrier</label>
                <select
                  value={selectedCarrier}
                  onChange={(e) => setSelectedCarrier(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 7px',
                    fontSize: '12px',
                    border: '1px solid var(--border2)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="">Select Carrier…</option>
                  {accounts.map((acc) => (
                    <option key={acc.shippingProviderId} value={acc.carrierCode}>
                      {acc.nickname || acc.code}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px' }}>Service</label>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 7px',
                    fontSize: '12px',
                    border: '1px solid var(--border2)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="">Select Service…</option>
                  {selectedRate && (
                    <option value={selectedRate.serviceCode}>{selectedRate.serviceName}</option>
                  )}
                </select>
              </div>

              <button
                onClick={handleCreateLabel}
                style={{
                  width: '100%',
                  padding: '7px',
                  backgroundColor: 'var(--ss-blue)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: selectedCarrier && selectedService ? 'pointer' : 'not-allowed',
                  opacity: selectedCarrier && selectedService ? 1 : 0.5,
                  transition: 'background 0.15s',
                }}
                disabled={!selectedCarrier || !selectedService}
                onMouseOver={(e) => {
                  if (selectedCarrier && selectedService) {
                    (e.currentTarget as any).style.background = 'var(--ss-blue2)'
                  }
                }}
                onMouseOut={(e) => (e.currentTarget.style.background = 'var(--ss-blue)')}
              >
                🖨️ Create Label
              </button>
            </>
          )}
        </div>

        {/* Tracking */}
        {order.label?.trackingNumber && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Tracking</div>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--ss-blue)', fontWeight: '600', wordBreak: 'break-all' }}>
              {order.label.trackingNumber}
            </div>
          </div>
        )}

        {/* Raw Data / Debug Info */}
        {order.raw && (
          <details style={{ marginTop: '14px', fontSize: '11px', color: 'var(--text3)' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '6px' }}>Raw Order Data</summary>
            <pre style={{
              padding: '8px',
              backgroundColor: 'var(--surface2)',
              borderRadius: '4px',
              border: '1px solid var(--border2)',
              fontSize: '10px',
              maxHeight: '200px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--text2)',
            }}>
              {typeof order.raw === 'string' ? order.raw : JSON.stringify(order.raw, null, 2)}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            style={{
              padding: '7px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            🖨️ Print Label
          </button>
          <button
            style={{
              padding: '7px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            ✕ Void Label
          </button>
          <button
            style={{
              padding: '7px',
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📋 Mark Shipped
          </button>
        </div>
      </div>
    </div>
  )
}
