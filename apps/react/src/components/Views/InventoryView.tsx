import { useState } from 'react'

interface InventoryTab {
  id: 'stock' | 'receive' | 'clients' | 'history'
  label: string
  icon: string
}

export default function InventoryView() {
  const [activeTab, setActiveTab] = useState<'stock' | 'receive' | 'clients' | 'history'>('stock')

  const tabs: InventoryTab[] = [
    { id: 'stock', label: 'Stock Levels', icon: '📦' },
    { id: 'receive', label: 'Receive', icon: '📥' },
    { id: 'clients', label: 'Clients', icon: '👥' },
    { id: 'history', label: 'History', icon: '📋' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text)', margin: 0 }}>📦 Inventory</h2>
          <button 
            className="btn btn-outline btn-sm" 
            style={{ marginLeft: 'auto' }}
          >
            ↻ Refresh
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 12px',
                backgroundColor: activeTab === tab.id ? 'var(--ss-blue)' : 'var(--surface2)',
                color: activeTab === tab.id ? '#fff' : 'var(--text2)',
                border: activeTab === tab.id ? 'none' : '1px solid var(--border2)',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px' }}>
        {activeTab === 'stock' && <StockTab />}
        {activeTab === 'receive' && <ReceiveTab />}
        {activeTab === 'clients' && <ClientsTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  )
}

function StockTab() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Coming Soon</div>
      <div style={{ fontSize: '12px' }}>Stock levels and inventory tracking will appear here</div>
    </div>
  )
}

function ReceiveTab() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📥</div>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Coming Soon</div>
      <div style={{ fontSize: '12px' }}>Receive inventory items here</div>
    </div>
  )
}

function ClientsTab() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Coming Soon</div>
      <div style={{ fontSize: '12px' }}>Manage clients and their inventory</div>
    </div>
  )
}

function HistoryTab() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Coming Soon</div>
      <div style={{ fontSize: '12px' }}>Inventory transaction history</div>
    </div>
  )
}
