import { useState, useEffect } from 'react'

interface MarkupRow {
  id: number
  carrierCode: string
  carrierName: string
  accountName: string
  markup: number
  markupType: 'percent' | 'flat'
  storeId?: number
}

interface StoreSettings {
  storeId: number
  name: string
  description: string
  defaultCarrier: string
}

type Tab = 'markups' | 'cache' | 'stores'

const CARRIERS = ['stamps_com', 'fedex', 'ups', 'dhl_express', 'amazon_shipping']
const CARRIER_LABELS: Record<string, string> = {
  stamps_com: 'USPS (Stamps.com)',
  fedex: 'FedEx',
  ups: 'UPS',
  dhl_express: 'DHL Express',
  amazon_shipping: 'Amazon Shipping',
}

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>('markups')
  const [markups, setMarkups] = useState<MarkupRow[]>([])
  const [loadingMarkups, setLoadingMarkups] = useState(true)
  const [editingMarkup, setEditingMarkup] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editType, setEditType] = useState<'percent' | 'flat'>('percent')
  const [savingMarkup, setSavingMarkup] = useState(false)
  const [cacheStats, setCacheStats] = useState<{ lastUpdated: string; ordersCount: number } | null>(null)
  const [stores, setStores] = useState<StoreSettings[]>([])
  const [editingStore, setEditingStore] = useState<StoreSettings | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  // Load markups
  useEffect(() => {
    if (tab !== 'markups') return
    setLoadingMarkups(true)
    fetch('/api/accounts/markups')
      .then(r => r.ok ? r.json() : [])
      .then(data => setMarkups(Array.isArray(data) ? data : data.markups || []))
      .catch(() => setMarkups([]))
      .finally(() => setLoadingMarkups(false))
  }, [tab])

  // Load cache stats
  useEffect(() => {
    if (tab !== 'cache') return
    fetch('/api/rates/cache-stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCacheStats({
            lastUpdated: data.lastUpdated || '',
            ordersCount: data.ordersCount || 0,
          })
        }
      })
      .catch(() => {})
  }, [tab])

  // Load stores
  useEffect(() => {
    if (tab !== 'stores') return
    fetch('/api/clients')
      .then(r => r.ok ? r.json() : [])
      .then(clients => {
        setStores((clients || []).map((c: any) => ({
          storeId: c.clientId,
          name: c.name,
          description: c.description || '',
          defaultCarrier: c.defaultCarrier || '',
        })))
      })
      .catch(() => {})
  }, [tab])

  const handleSaveMarkup = async (row: MarkupRow) => {
    setSavingMarkup(true)
    try {
      const res = await fetch(`/api/accounts/${row.id}/update-markup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markup: parseFloat(editValue) || 0, markupType: editType }),
      })
      if (!res.ok) throw new Error(await res.text())
      setMarkups(prev => prev.map(m => m.id === row.id ? { ...m, markup: parseFloat(editValue) || 0, markupType: editType } : m))
      setEditingMarkup(null)
      showMessage('✅ Markup saved')
    } catch (err: any) {
      showMessage('❌ ' + err.message, 'error')
    } finally {
      setSavingMarkup(false)
    }
  }

  const handleRefetchAllRates = async () => {
    try {
      const res = await fetch('/api/rates/refetch-all', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      showMessage('✅ All rates refetched and cache cleared')
    } catch (err: any) {
      showMessage('❌ ' + err.message, 'error')
    }
  }

  const handleClearCache = () => {
    // Clear localStorage
    Object.keys(localStorage)
      .filter(k => k.startsWith('rates_') || k.startsWith('prepship_rates'))
      .forEach(k => localStorage.removeItem(k))
    showMessage('✅ Cache cleared')
  }

  const handleSaveStore = async (store: StoreSettings) => {
    try {
      const res = await fetch(`/api/stores/${store.storeId}/update-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: store.name, description: store.description, defaultCarrier: store.defaultCarrier }),
      })
      if (!res.ok) throw new Error(await res.text())
      setStores(prev => prev.map(s => s.storeId === store.storeId ? store : s))
      setEditingStore(null)
      showMessage('✅ Store settings saved')
    } catch (err: any) {
      showMessage('❌ ' + err.message, 'error')
    }
  }

  const tabStyle = (t: Tab) => ({
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: tab === t ? '700' : '500',
    background: tab === t ? 'var(--ss-blue)' : 'var(--surface2)',
    color: tab === t ? '#fff' : 'var(--text2)',
    border: '1px solid ' + (tab === t ? 'var(--ss-blue)' : 'var(--border2)'),
    borderRadius: '4px',
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, marginBottom: '12px' }}>⚙️ Settings</h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setTab('markups')} style={tabStyle('markups')}>📊 Carrier Markups</button>
          <button onClick={() => setTab('cache')} style={tabStyle('cache')}>🗄️ Cache</button>
          <button onClick={() => setTab('stores')} style={tabStyle('stores')}>🏪 Store Settings</button>
        </div>
      </div>

      {message && (
        <div style={{
          margin: '10px 18px 0',
          padding: '10px 14px',
          background: message.type === 'success' ? '#f0fdf4' : 'rgba(220,38,38,.08)',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : 'rgba(220,38,38,.3)'}`,
          borderRadius: '6px',
          fontSize: '12px',
          color: message.type === 'success' ? '#16a34a' : '#dc2626',
          flexShrink: 0,
        }}>
          {message.text}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {/* Markups Tab */}
        {tab === 'markups' && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
              Set markup percentages or flat amounts per carrier account. Applied to all rate displays.
            </div>
            {loadingMarkups ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="spinner"></div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text3)' }}>Loading markups…</div>
              </div>
            ) : markups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                No carrier accounts found. Configure carriers first.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <thead>
                  <tr>
                    {['Carrier', 'Account', 'Markup', 'Type', 'Actions'].map(h => (
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
                  {markups.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '600' }}>
                        {CARRIER_LABELS[row.carrierCode] || row.carrierCode}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text2)' }}>
                        {row.accountName || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        {editingMarkup === row.id ? (
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--text)' }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ fontSize: '12px', fontWeight: '700', color: row.markup > 0 ? 'var(--green)' : 'var(--text3)' }}>
                            {row.markup > 0 ? `+${row.markup}` : '0'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        {editingMarkup === row.id ? (
                          <select
                            value={editType}
                            onChange={e => setEditType(e.target.value as 'percent' | 'flat')}
                            style={{ padding: '4px 6px', fontSize: '11px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--text)' }}
                          >
                            <option value="percent">%</option>
                            <option value="flat">$</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {row.markupType === 'percent' ? '%' : '$'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        {editingMarkup === row.id ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => handleSaveMarkup(row)}
                              disabled={savingMarkup}
                              style={{ padding: '3px 10px', fontSize: '11px', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMarkup(null)}
                              style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingMarkup(row.id)
                              setEditValue(String(row.markup || 0))
                              setEditType(row.markupType || 'percent')
                            }}
                            style={{ padding: '3px 10px', fontSize: '11px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: '3px', cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Cache Tab */}
        {tab === 'cache' && (
          <div style={{ maxWidth: '500px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
              Manage rate cache and force carrier re-queries.
            </div>

            {cacheStats && (
              <div style={{ padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text3)' }}>Last Updated</span>
                  <span style={{ fontWeight: '600' }}>{cacheStats.lastUpdated ? new Date(cacheStats.lastUpdated).toLocaleString() : 'Never'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3)' }}>Orders Cached</span>
                  <span style={{ fontWeight: '600' }}>{cacheStats.ordersCount.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleRefetchAllRates}
                style={{
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontWeight: '700',
                  background: 'var(--ss-blue)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                ↻ Refetch All Rates
                <div style={{ fontSize: '11px', fontWeight: '400', marginTop: '2px', opacity: 0.85 }}>
                  Clears server-side rate cache and re-queries all carriers
                </div>
              </button>

              <button
                onClick={handleClearCache}
                style={{
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontWeight: '700',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                🗑️ Clear Local Cache
                <div style={{ fontSize: '11px', fontWeight: '400', marginTop: '2px', color: 'var(--text3)' }}>
                  Clears browser localStorage rate cache
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Stores Tab */}
        {tab === 'stores' && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
              Configure per-store settings.
            </div>
            {stores.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '13px' }}>
                No stores found.
              </div>
            ) : stores.map(store => (
              <div key={store.storeId} style={{
                padding: '14px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '10px',
                background: 'var(--surface2)',
              }}>
                {editingStore?.storeId === store.storeId ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--text2)' }}>Store Name</label>
                        <input
                          type="text"
                          value={editingStore.name}
                          onChange={e => setEditingStore({ ...editingStore, name: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--text2)' }}>Default Carrier</label>
                        <select
                          value={editingStore.defaultCarrier}
                          onChange={e => setEditingStore({ ...editingStore, defaultCarrier: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                        >
                          <option value="">None</option>
                          {CARRIERS.map(c => <option key={c} value={c}>{CARRIER_LABELS[c] || c}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--text2)' }}>Description</label>
                        <input
                          type="text"
                          value={editingStore.description}
                          onChange={e => setEditingStore({ ...editingStore, description: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border2)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleSaveStore(editingStore)}
                        style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', background: 'var(--ss-blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        💾 Save
                      </button>
                      <button
                        onClick={() => setEditingStore(null)}
                        style={{ padding: '6px 14px', fontSize: '12px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>{store.name}</div>
                      {store.description && <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>{store.description}</div>}
                      {store.defaultCarrier && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Default: {CARRIER_LABELS[store.defaultCarrier] || store.defaultCarrier}</div>}
                    </div>
                    <button
                      onClick={() => setEditingStore(store)}
                      style={{ padding: '5px 12px', fontSize: '11px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
