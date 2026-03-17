import { useState, useEffect } from 'react'

interface Order {
  orderId: number
  orderNumber: string
  orderDate: string
  shipTo: { name: string; address: string; city: string; state: string; zip: string }
  shipFrom?: { name: string; address: string; city: string; state: string; zip: string }
  items: Array<{ sku: string; name: string; quantity: number }>
  weight?: { value: number; unit: string }
  carrierCode?: string
  serviceCode?: string
  trackingNumber?: string
  orderTotal?: number
  notes?: string
}

interface OrderPanelProps {
  orderId: number | null
  onClose: () => void
}

export default function OrderPanel({ orderId, onClose }: OrderPanelProps) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [selectedCarrier, setSelectedCarrier] = useState('')
  const [selectedService, setSelectedService] = useState('')

  useEffect(() => {
    if (orderId) {
      fetchOrder(orderId)
    } else {
      setOrder(null)
    }
  }, [orderId])

  const fetchOrder = async (id: number) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/orders/${id}`)
      const data = await response.json()
      setOrder(data.order)
      setNotes(data.order?.notes || '')
      setSelectedCarrier(data.order?.carrierCode || '')
      setSelectedService(data.order?.serviceCode || '')
    } catch (error) {
      console.error('Failed to fetch order:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!order) {
    return (
      <div className="order-panel">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
          {loading ? (
            <>
              <div className="spinner"></div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>Loading order…</div>
            </>
          ) : (
            <div style={{ fontSize: '13px', textAlign: 'center' }}>Select an order to view details</div>
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
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Ship To</div>
          <div style={{ fontSize: '12px', color: 'var(--text)' }}>
            <div style={{ fontWeight: '600' }}>{order.shipTo?.name}</div>
            <div style={{ color: 'var(--text2)', marginTop: '2px' }}>{order.shipTo?.address}</div>
            <div style={{ color: 'var(--text2)' }}>{order.shipTo?.city}, {order.shipTo?.state} {order.shipTo?.zip}</div>
          </div>
        </div>

        {/* Ship From (if available) */}
        {order.shipFrom && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Ship From</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>
              <div style={{ fontWeight: '600' }}>{order.shipFrom.name}</div>
              <div style={{ color: 'var(--text2)', marginTop: '2px' }}>{order.shipFrom.address}</div>
              <div style={{ color: 'var(--text2)' }}>{order.shipFrom.city}, {order.shipFrom.state} {order.shipFrom.zip}</div>
            </div>
          </div>
        )}

        {/* Items */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Items ({order.items.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {order.items.map((item, idx) => (
              <div key={idx} style={{ fontSize: '12px', padding: '6px 8px', backgroundColor: 'var(--surface2)', borderRadius: '4px' }}>
                <div style={{ fontWeight: '600', color: 'var(--text)' }}>{item.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                  SKU: {item.sku} • Qty: {item.quantity}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weight & Dimensions */}
        {order.weight && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Weight & Dimensions</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>
              {order.weight.value} {order.weight.unit}
            </div>
          </div>
        )}

        {/* Shipping / Label Section */}
        <div style={{ marginBottom: '14px', padding: '10px', backgroundColor: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Create Label</div>

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
              <option value="usps">USPS</option>
              <option value="ups">UPS</option>
              <option value="fedex">FedEx</option>
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
              <option value="priority">Priority Mail</option>
              <option value="ground">Ground</option>
              <option value="express">Express</option>
            </select>
          </div>

          <button
            style={{
              width: '100%',
              padding: '7px',
              backgroundColor: 'var(--ss-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--ss-blue2)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--ss-blue)')}
          >
            🖨️ Create Label
          </button>
        </div>

        {/* Tracking */}
        {order.trackingNumber && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Tracking</div>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--ss-blue)', fontWeight: '600', wordBreak: 'break-all' }}>
              {order.trackingNumber}
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add internal notes…"
            style={{
              width: '100%',
              padding: '7px',
              fontSize: '12px',
              border: '1px solid var(--border2)',
              borderRadius: '4px',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              minHeight: '80px',
              resize: 'vertical',
            }}
          />
        </div>

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
