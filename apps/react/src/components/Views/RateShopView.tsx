import { useState } from 'react'
import RateBrowserModal from '../RateBrowser/RateBrowserModal'
import type { RateBrowserOrder } from '../RateBrowser/RateBrowserModal'

interface QuickRateOrder extends RateBrowserOrder {
  orderNumber: string
}

export default function RateShopView() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [zip, setZip] = useState('')
  const [weightLb, setWeightLb] = useState(0)
  const [weightOz, setWeightOz] = useState(8)
  const [length, setLength] = useState(0)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  const mockOrder: QuickRateOrder = {
    orderId: 0,
    orderNumber: 'Quick Rate Check',
    shipTo: { postalCode: zip, residential: true },
    weight: { value: weightLb * 16 + weightOz },
    dimensions: length > 0 && width > 0 && height > 0
      ? { length, width, height }
      : undefined,
  }

  const canOpen = !!zip && (weightLb > 0 || weightOz > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: '0 0 12px' }}>💰 Rate Shop</h2>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
          Quick rate lookup — enter parameters and browse all carrier rates
        </div>

        {/* Quick lookup form */}
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
          padding: '14px 16px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>To ZIP</label>
            <input
              type="text" maxLength={5} value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="90210"
              style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', width: 80 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Weight</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input type="number" min={0} value={weightLb || ''} onChange={e => setWeightLb(parseFloat(e.target.value) || 0)} placeholder="0" style={{ padding: '6px 6px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', width: 50 }} />
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>lb</span>
              <input type="number" min={0} max={15} value={weightOz || ''} onChange={e => setWeightOz(parseFloat(e.target.value) || 0)} placeholder="0" style={{ padding: '6px 6px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', width: 50 }} />
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>oz</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Dims (in) – optional</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input type="number" min={0} value={length || ''} onChange={e => setLength(parseFloat(e.target.value) || 0)} placeholder="L" style={{ padding: '6px 6px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', width: 44 }} />
              <input type="number" min={0} value={width || ''} onChange={e => setWidth(parseFloat(e.target.value) || 0)} placeholder="W" style={{ padding: '6px 6px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', width: 44 }} />
              <input type="number" min={0} value={height || ''} onChange={e => setHeight(parseFloat(e.target.value) || 0)} placeholder="H" style={{ padding: '6px 6px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', width: 44 }} />
            </div>
          </div>
          <button
            onClick={() => canOpen && setIsModalOpen(true)}
            disabled={!canOpen}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: '700',
              background: canOpen ? 'var(--ss-blue)' : 'var(--surface2)',
              color: canOpen ? '#fff' : 'var(--text3)',
              border: `1px solid ${canOpen ? 'var(--ss-blue)' : 'var(--border2)'}`,
              borderRadius: '5px',
              cursor: canOpen ? 'pointer' : 'not-allowed',
            }}
          >
            🔍 Browse All Rates
          </button>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px' }}>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>💰</div>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Quick Rate Lookup</div>
          <div style={{ fontSize: '12px' }}>
            Enter a ZIP code and weight above, then click Browse to see rates across all carriers
          </div>
          <div style={{ fontSize: '11px', marginTop: '8px', color: 'var(--text3)' }}>
            For order-specific rates, use the Rate Browser in the order panel
          </div>
        </div>
      </div>

      <RateBrowserModal
        isOpen={isModalOpen}
        order={canOpen ? mockOrder : null}
        onClose={() => setIsModalOpen(false)}
        onSelectRate={() => setIsModalOpen(false)}
      />
    </div>
  )
}
