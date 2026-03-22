import { useEffect, useMemo, useState } from 'react'
import { StoresProvider } from './contexts/StoresContext'
import { MarkupsProvider } from './contexts/MarkupsContext'
import { ToastProvider } from './contexts/ToastContext'
import { StoreVisibilityProvider } from './contexts/StoreVisibilityContext'
import { useInitStores } from './hooks'
import Sidebar from './components/Sidebar/Sidebar'
import OrdersView from './components/Views/OrdersView'
import './App.css'

type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing' | 'manifests'
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'
type OrdersDateFilter = '' | 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'custom'

const ZOOM_OPTIONS = [
  { value: 75, label: '75% — Very Compact' },
  { value: 85, label: '85% — Compact' },
  { value: 100, label: '100% — Default' },
  { value: 115, label: '115% — Comfortable' },
  { value: 125, label: '125% — Large' },
  { value: 150, label: '150% — Extra Large' },
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: 'Awaiting Shipment',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}

const VIEW_LABELS: Record<Exclude<ViewType, 'orders' | 'manifests'>, string> = {
  inventory: 'Inventory',
  locations: 'Locations',
  packages: 'Packages',
  rates: 'Rates',
  analysis: 'Analysis',
  settings: 'Settings',
  billing: 'Billing',
}

function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="view-content">
      <div className="react-placeholder-card">
        <div className="react-placeholder-eyebrow">React Parity Rebuild</div>
        <h2>{title}</h2>
        <p>The root shell now uses the same frame contract as the V2 web app. Feature modules can be rebuilt inside this layout next.</p>
      </div>
    </div>
  )
}

function PrepShipRoot() {
  const { stores: sidebarStores } = useInitStores()
  const [currentView, setCurrentView] = useState<ViewType>('orders')
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>('awaiting_shipment')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeStore, setActiveStore] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<OrdersDateFilter>('last-30')
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([])
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null)
  const [zoomPct, setZoomPct] = useState(() => {
    if (typeof window === 'undefined') return 100
    const stored = Number.parseInt(window.localStorage.getItem('prepship_zoom') ?? '100', 10)
    return Number.isNaN(stored) ? 100 : stored
  })
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)

  const activeStoreName = useMemo(
    () => sidebarStores.find((store) => store.storeId === activeStore)?.storeName ?? null,
    [sidebarStores, activeStore],
  )

  const viewTitle = currentView === 'orders'
    ? activeStoreName
      ? `${STATUS_LABELS[currentStatus]} · ${activeStoreName}`
      : STATUS_LABELS[currentStatus]
    : currentView === 'manifests'
      ? 'Manifests'
      : VIEW_LABELS[currentView as Exclude<ViewType, 'orders' | 'manifests'>]

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem('prepship_zoom', String(zoomPct))
    const mobile = window.matchMedia('(max-width:768px)').matches

    if (mobile) {
      document.body.style.zoom = ''
      document.body.style.height = ''
      return
    }

    document.body.style.zoom = `${zoomPct}%`
    document.body.style.height = `${(10000 / zoomPct).toFixed(2)}vh`

    return () => {
      document.body.style.zoom = ''
      document.body.style.height = ''
    }
  }, [zoomPct])

  useEffect(() => {
    if (!zoomMenuOpen) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.react-zoom-wrap')) return
      setZoomMenuOpen(false)
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [zoomMenuOpen])

  useEffect(() => {
    setSelectedOrderIds([])
    setActiveOrderId(null)
  }, [currentView, currentStatus, activeStore, dateFilter])

  return (
    <>
      <div className="panel-backdrop" id="panelBackdrop" />

      <Sidebar
        currentStatus={currentStatus}
        currentView={currentView}
        stores={sidebarStores}
        onSelectStatus={(status) => {
          setCurrentStatus(status)
          setCurrentView('orders')
          setActiveStore(null)
          setMobileMenuOpen(false)
        }}
        onShowView={(view) => {
          if (view === 'manifests') return
          setCurrentView(view)
          setMobileMenuOpen(false)
        }}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        onSearch={setSearchQuery}
        onSelectStore={(storeId) => {
          setActiveStore(storeId)
          setCurrentView('orders')
          setMobileMenuOpen(false)
        }}
        activeStore={activeStore}
      />

      <div className="main">
        <div
          className={`sidebar-backdrop${mobileMenuOpen ? ' show' : ''}`}
          id="sidebarBackdrop"
          onClick={() => setMobileMenuOpen(false)}
        />

        <div className="topbar">
          <button
            id="mobileMenuBtn"
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            style={{ alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4, color: 'var(--text)' }}
            aria-label="Toggle menu"
          >
            ☰
          </button>

          <div className="topbar-title" id="viewTitle">{viewTitle}</div>

          <div className={`batch-bar${currentView === 'orders' && selectedOrderIds.length > 0 ? ' show' : ''}`} id="batchBar">
            <span id="batchCount">{selectedOrderIds.length} selected</span>
            <div className="batch-btns">
              <button className="batch-btn" type="button">🗂️ Batch</button>
              <button className="batch-btn" type="button">🖨️ Print</button>
              <button
                className="batch-btn"
                type="button"
                onClick={() => {
                  setSelectedOrderIds([])
                  setActiveOrderId(null)
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {currentView === 'orders' ? (
            <div className="topbar-right" id="topbarActions">
              <div className="sync-pill done" id="syncPill">
                <span className="sync-dot" />
                <span id="syncText">Parity shell</span>
              </div>
              <button className="btn btn-ghost btn-sm" id="btnSyncIncr" type="button">↻</button>
              <button className="btn btn-ghost btn-sm" id="btnSyncFull" type="button" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text3)' }}>Full↻</button>
              <div className="col-toggle-wrap">
                <button className="btn btn-outline btn-sm" type="button">⊞ Columns</button>
              </div>
              <button className="btn btn-primary btn-sm" type="button">🖨️ Labels</button>
              <button className="btn btn-outline btn-sm" id="pq-toggle-btn" type="button" style={{ position: 'relative', gap: 4 }}>
                🖨️ Print Queue
                <span id="pq-badge" style={{ display: 'none', position: 'absolute', top: -6, right: -6, background: '#f59e0b', color: '#000', borderRadius: 99, fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, padding: '0 3px', alignItems: 'center', justifyContent: 'center' }}>0</span>
              </button>
            </div>
          ) : null}

          <div className="col-toggle-wrap react-zoom-wrap" style={{ position: 'relative' }}>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              onClick={() => setZoomMenuOpen((open) => !open)}
              id="zoomBtn"
              style={{ gap: 4, minWidth: 68 }}
            >
              🔍 <span id="zoomLabel">{zoomPct}%</span>
            </button>
            <div
              id="zoomMenu"
              style={{
                display: zoomMenuOpen ? 'block' : 'none',
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 5px)',
                background: 'var(--surface)',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-lg)',
                padding: '5px 0',
                zIndex: 200,
                minWidth: 130,
              }}
            >
              <div style={{ padding: '4px 12px 3px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text3)' }}>Zoom</div>
              {ZOOM_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`zoom-opt${zoomPct === option.value ? ' active' : ''}`}
                  type="button"
                  onClick={() => {
                    setZoomPct(option.value)
                    setZoomMenuOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {currentView === 'orders' ? (
          <OrdersView
            currentStatus={currentStatus}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            activeStore={activeStore}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            selectedOrderIds={selectedOrderIds}
            onSelectedOrderIdsChange={setSelectedOrderIds}
            activeOrderId={activeOrderId}
            onActiveOrderIdChange={setActiveOrderId}
          />
        ) : (
          <PlaceholderView title={viewTitle} />
        )}
      </div>
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <StoresProvider>
        <MarkupsProvider>
          <StoreVisibilityProvider>
            <PrepShipRoot />
          </StoreVisibilityProvider>
        </MarkupsProvider>
      </StoresProvider>
    </ToastProvider>
  )
}
