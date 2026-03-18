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
  selectedOrderIds?: number[]
  onPrintLabels?: (orderIds: number[]) => void
  onPrintBatch?: () => void
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
  selectedOrderIds,
  onPrintLabels,
  onPrintBatch,
}: TopbarProps) {
  const { count: queueCount, setIsOpen: setQueueOpen } = useQueue()
  const syncStatus = useSyncPoller(true, 10000)
  // Initialize zoom from localStorage on mount
  const [zoom, setZoom] = useState(() => {
    try {
      const saved = localStorage.getItem('prepship_zoom')
      return saved ? parseInt(saved, 10) : 100
    } catch {
      return 100
    }
  })
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)

  useEffect(() => {
    const appRoot = document.getElementById('root') || document.body
    appRoot.style.zoom = `${zoom}%`
    try {
      localStorage.setItem('prepship_zoom', zoom.toString())
    } catch (error) {
      console.warn('Failed to save zoom to localStorage:', error)
    }
  }, [zoom])

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
        <div className="batch-bar show">
          <span>{selectedOrdersCount} selected</span>
          <div className="batch-btns">
            <button className="batch-btn" onClick={onShowBatchPanel}>🗂️ Batch</button>
            <button className="batch-btn" onClick={onPrintBatch ?? (() => {})}>🖨️ Print</button>
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

        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (selectedOrderIds?.length) {
              onPrintLabels?.(selectedOrderIds)
            }
          }}
          disabled={!selectedOrderIds?.length}
          title={selectedOrderIds?.length ? `Reprint ${selectedOrderIds.length} label(s)` : 'Select orders to print labels'}
        >
          🖨️ Labels
        </button>

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
