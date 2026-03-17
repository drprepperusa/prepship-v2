import { useState, useEffect } from 'react'
import './Topbar.css'

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

interface TopbarProps {
  currentView: ViewType
  currentStatus: OrderStatus
  selectedOrdersCount: number
  onClearSelection: () => void
  onShowBatchPanel: () => void
  mobileMenuOpen: boolean
  onToggleMobileMenu: () => void
}

const viewTitles: Record<ViewType, string> = {
  orders: 'Awaiting Shipment',
  inventory: 'Inventory',
  locations: 'Locations',
  packages: 'Packages',
  rates: 'Rate Shop',
  analysis: 'Analysis',
  settings: 'Settings',
  billing: 'Billing',
}

export default function Topbar({ 
  currentView, 
  currentStatus,
  selectedOrdersCount, 
  onClearSelection,
  onShowBatchPanel,
  onToggleMobileMenu 
}: TopbarProps) {
  const [syncText, setSyncText] = useState(() => {
    const now = new Date()
    return `Synced ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
  })
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [zoom, setZoom] = useState(100)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const [colMenuOpen, setColMenuOpen] = useState(false)

  useEffect(() => {
    // Set zoom level
    document.documentElement.style.fontSize = `${16 * (zoom / 100)}px`
  }, [zoom])

  const handleSync = async (full: boolean) => {
    setSyncText('Syncing…')
    setSyncState('syncing')
    try {
      const response = await fetch(`/api/orders/sync?full=${full}`)
      if (response.ok) {
        const now = new Date()
        setSyncText(`Synced ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`)
        setSyncState('idle')
      }
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncText('Sync error')
      setSyncState('error')
    }
  }

  const zoomLevels = [75, 85, 100, 115, 125, 150]

  const statusTitles: Record<OrderStatus, string> = {
    awaiting_shipment: 'Awaiting Shipment',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
  }
  
  const viewTitle = currentView === 'orders' ? statusTitles[currentStatus] : viewTitles[currentView]

  return (
    <div className="topbar">
      <button 
        id="mobileMenuBtn" 
        onClick={onToggleMobileMenu}
        style={{ display: window.innerWidth <= 768 ? 'flex' : 'none' }}
      >
        ☰
      </button>

      <div className="topbar-title">{viewTitle}</div>

      {selectedOrdersCount > 0 && (
        <div className="batch-bar">
          <span>{selectedOrdersCount} selected</span>
          <div className="batch-btns">
            <button className="batch-btn" onClick={onShowBatchPanel}>🗂️ Batch</button>
            <button className="batch-btn" onClick={() => {}}>🖨️ Print</button>
            <button className="batch-btn" onClick={onClearSelection}>✕</button>
          </div>
        </div>
      )}

      <div className="topbar-right">
        <div className={`sync-pill ${syncState === 'syncing' ? 'syncing' : syncState === 'error' ? 'error' : 'done'}`}>
          <span className="sync-dot"></span>
          <span>{syncText}</span>
        </div>

        <button 
          className="btn btn-ghost btn-sm"
          onClick={() => handleSync(false)}
          title="Incremental sync"
        >
          ↻
        </button>

        <button 
          className="btn btn-ghost btn-sm"
          onClick={() => handleSync(true)}
          title="Full re-sync"
        >
          Full↻
        </button>

        <div className="col-toggle-wrap">
          <button 
            className="btn btn-outline btn-sm"
            onClick={() => setColMenuOpen(!colMenuOpen)}
          >
            ⊞ Columns
          </button>
          {colMenuOpen && (
            <div className="col-dropdown">
              <div className="col-dropdown-header">Toggle Columns</div>
              {/* Column options */}
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-sm">🖨️ Labels</button>

        <button className="btn btn-outline btn-sm" id="pq-toggle-btn">
          🖨️ Print Queue
          {/* <span id="pq-badge">0</span> */}
        </button>
      </div>

      <div className="col-toggle-wrap">
        <button 
          className="btn btn-outline btn-sm"
          onClick={() => setZoomMenuOpen(!zoomMenuOpen)}
          style={{ gap: '4px', minWidth: '68px' }}
        >
          🔍 <span>{zoom}%</span>
        </button>
        {zoomMenuOpen && (
          <div className="zoom-menu">
            <div style={{ padding: '4px 12px 3px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
              Zoom
            </div>
            {zoomLevels.map((level) => (
              <div 
                key={level}
                className="zoom-opt"
                onClick={() => {
                  setZoom(level)
                  setZoomMenuOpen(false)
                }}
              >
                {level}%
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
