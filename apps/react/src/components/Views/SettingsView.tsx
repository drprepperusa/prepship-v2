import { useState, useEffect } from 'react'
import { useMarkups } from '../../contexts/MarkupsContext'
import { MarkupTable } from '../SettingsPanel/MarkupTable'

interface CarrierAccount {
  shippingProviderId: number
  nickname: string
  name: string
}

type Tab = 'markups' | 'cache'

export default function SettingsView() {
  const { loading: loadingMarkups, error: markupError } = useMarkups()
  const [tab, setTab] = useState<Tab>('markups')
  const [accounts, setAccounts] = useState<CarrierAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(tab === 'markups')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  // Load carrier accounts when markups tab is active
  useEffect(() => {
    if (tab !== 'markups') {
      setLoadingAccounts(false)
      return
    }
    
    setLoadingAccounts(true)
    
    fetch('/api/carrier-accounts')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: any) => {
        if (!Array.isArray(data) || data.length === 0) {
          setAccounts([])
          return
        }
        
        // Deduplicate by shippingProviderId (unique key for markups)
        const seenMap: Record<number, boolean> = {}
        const unique: CarrierAccount[] = []
        
        for (const account of data) {
          const pid = account.shippingProviderId
          if (pid && !seenMap[pid]) {
            seenMap[pid] = true
            unique.push({
              shippingProviderId: pid,
              nickname: account.nickname || account.name || '',
              name: account.name || account.nickname || ''
            })
          }
        }
        
        setAccounts(unique)
      })
      .catch(err => {
        console.error('Failed to load carrier accounts:', err)
        setAccounts([])
      })
      .finally(() => setLoadingAccounts(false))
  }, [tab])

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
      .filter(k => k.startsWith('rates_') || k.startsWith('prepship_rates') || k === 'prepship_rb_markups')
      .forEach(k => localStorage.removeItem(k))
    showMessage('✅ Cache cleared')
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
    transition: 'all 0.2s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, marginBottom: '12px' }}>⚙️ Settings</h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setTab('markups')} style={tabStyle('markups') as any}>📊 Carrier Markups</button>
          <button onClick={() => setTab('cache')} style={tabStyle('cache') as any}>🗄️ Cache</button>
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
            {markupError && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(220,38,38,.08)',
                border: '1px solid rgba(220,38,38,.3)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#dc2626',
                marginBottom: '16px',
              }}>
                ⚠️ {markupError}
              </div>
            )}
            {loadingMarkups || loadingAccounts ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="spinner" style={{ margin: '0 auto', width: '24px', height: '24px' }}></div>
                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text3)' }}>
                  Loading {loadingAccounts ? 'carrier accounts' : 'markups'}…
                </div>
              </div>
            ) : (
              <>
                {accounts.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                    {accounts.length} carrier account{accounts.length !== 1 ? 's' : ''}
                  </div>
                )}
                <MarkupTable accounts={accounts} />
              </>
            )}
          </div>
        )}

        {/* Cache Tab */}
        {tab === 'cache' && (
          <div style={{ maxWidth: '500px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
              Manage rate cache and force carrier re-queries.
            </div>

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
                  transition: 'opacity 0.2s',
                } as any}
                onMouseOver={e => (e.currentTarget as any).style.opacity = '0.9'}
                onMouseOut={e => (e.currentTarget as any).style.opacity = '1'}
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
                  transition: 'opacity 0.2s',
                } as any}
                onMouseOver={e => (e.currentTarget as any).style.opacity = '0.8'}
                onMouseOut={e => (e.currentTarget as any).style.opacity = '1'}
              >
                🗑️ Clear Local Cache
                <div style={{ fontSize: '11px', fontWeight: '400', marginTop: '2px', color: 'var(--text3)' }}>
                  Clears browser localStorage rate cache
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
