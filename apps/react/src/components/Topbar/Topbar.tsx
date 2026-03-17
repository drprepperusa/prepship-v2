import { useState, useEffect } from 'react'
import './Topbar.css'
import { useQueue } from '../PrintQueue/QueueContext'
import { useSyncPoller } from '../../hooks/useSyncPoller'

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing' | 'manifests'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

interface TopbarProps {
  currentView: ViewType
  currentStatus: OrderStatus
  selectedOrdersCount: number
  onClearSelection: () => void
  onShowBatchPanel: () => void
  mobileMenuOpen: boolean
  onToggleMobileMenu: () => void
  onOpenPrintQueue?: () => void
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
  manifests: 'Manifests',
}

export default function Topbar({
  currentView,
  currentStatus,
  selectedOrdersCount,
  onClearSelection,
  onShowBatchPanel,
  onToggleMobileMenu,
  onOpenPrintQueue,
}: TopbarProps) {
  const { count: queueCount, setIsOpen: setQueueOpen } = useQueue()
  const syncStatus = useSyncPoller(true, 10000)
  const [zoom, setZoom] = useState(100)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)

  useEffect(() => {
    const appRoot = document.getElementById('root') || document.body
    appRoot.style.zoom = `${zoom}%`
    localStorage.setItem('prepship_zoom', zoom.toString())
  }, [zoom])

  // Restore zoom from localStorage on mount
  useEffect(() => {
    const savedZoom = localStorage.getItem('prepship_zoom')
    if (savedZoom) {
      setZoom(parseInt(savedZoom, 10))
    }
  }, [])

  const handleSync = async (full: boolean) => {
    try {
      await fetch(`/api/orders/sync?full=${full}`)
    } catch (error) {
      console.error('Sync failed:', error)
    }
  }

  const zoomLevels = [75, 85, 100, 115, 125, 150]

  const statusTitles: Record<OrderStatus, string> = {
    awaiting_shipment: 'Awaiting Shipment',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
  }

  const viewTitle = currentView === 'orders' ? statusTitles[currentStatus] : viewTitles[currentView]

  const syncState = syncStatus.syncing ? 'syncing' : syncStatus.error ? 'error' : 'done'

  return (
    <div className="topbar">
      <button
        id="mobileMenuBtn"
        onClick={onToggleMobileMenu}
        style={{ display: 'flex' }}
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
          <span>{syncStatus.lastSyncText}</span>
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

        <button className="btn btn-primary btn-sm">🖨️ Labels</button>

        {/* Print Queue Badge */}
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            setQueueOpen(true)
            onOpenPrintQueue?.()
          }}
          style={{ position: 'relative' }}
          title="Print Queue (Ctrl+P)"
        >
          🖨️ Print Queue
          {queueCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              background: '#dc2626',
              color: '#fff',
              borderRadius: '9px',
              fontSize: '10px',
              fontWeight: '700',
              padding: '1px 5px',
              lineHeight: 1.4,
              minWidth: '16px',
              textAlign: 'center',
            }}>
              {queueCount}
            </span>
          )}
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
