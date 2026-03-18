import { useEffect, useState, useRef, useCallback } from 'react'
import { useStoreOrders, useStores } from '../../hooks'
import { useStoreVisibilityContext } from '../../contexts/StoreVisibilityContext'
import './Sidebar.css'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'
type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing' | 'manifests'

interface SidebarProps {
  currentStatus: OrderStatus
  onSelectStatus: (status: OrderStatus) => void
  onShowView: (view: ViewType) => void
  mobileMenuOpen: boolean
  onCloseMobileMenu?: () => void
  onSearch?: (query: string) => void
  onSelectStore?: (clientId: number) => void
  activeStore?: number | null
}

export default function Sidebar({ currentStatus, onSelectStatus, onShowView, mobileMenuOpen, onCloseMobileMenu, onSearch, onSelectStore, activeStore }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<OrderStatus>>(new Set(['awaiting_shipment']))
  const [statusCounts, setStatusCounts] = useState<Record<OrderStatus, number>>({
    awaiting_shipment: 0,
    shipped: 0,
    cancelled: 0,
  })
  const [storeCountsByStatus, setStoreCountsByStatus] = useState<Record<OrderStatus, Record<number, number>>>({
    awaiting_shipment: {},
    shipped: {},
    cancelled: {},
  })
  const [searchValue, setSearchValue] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { stores } = useStores()
  const { useStoreVisibility } = useStoreVisibilityContext()

  const { visibilityState } = useStoreVisibilityContext()

  useEffect(() => {
    fetchStatusCounts()
  }, [visibilityState])

  const fetchStatusCounts = async () => {
    try {
      // Use server-side store aggregation endpoint for fast, accurate counts
      const [awaitingRes, shippedRes, cancelledRes] = await Promise.all([
        fetch('/api/orders/store-counts?orderStatus=awaiting_shipment'),
        fetch('/api/orders/store-counts?orderStatus=shipped'),
        fetch('/api/orders/store-counts?orderStatus=cancelled'),
      ])
      
      const [awaitingCounts, shippedCounts, cancelledCounts] = await Promise.all([
        awaitingRes.json() as Promise<Record<number, number>>,
        shippedRes.json() as Promise<Record<number, number>>,
        cancelledRes.json() as Promise<Record<number, number>>,
      ])
      
      // Calculate totals from store counts
      const getTotal = (counts: Record<number, number>) => Object.values(counts).reduce((a, b) => a + b, 0)
      
      setStatusCounts({
        awaiting_shipment: getTotal(awaitingCounts),
        shipped: getTotal(shippedCounts),
        cancelled: getTotal(cancelledCounts),
      })
      
      setStoreCountsByStatus({
        awaiting_shipment: awaitingCounts,
        shipped: shippedCounts,
        cancelled: cancelledCounts,
      })
    } catch (error) {
      console.error('Failed to fetch status counts:', error)
    }
  }

  const toggleSection = (status: OrderStatus) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(status)) {
      newExpanded.delete(status)
    } else {
      newExpanded.add(status)
    }
    setExpandedSections(newExpanded)
  }

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      onSearch?.(value)
    }, 300)
  }, [onSearch])

  const handleClearSearch = () => {
    setSearchValue('')
    onSearch?.('')
  }

  const statuses: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled']
  const statusLabels: Record<OrderStatus, string> = {
    awaiting_shipment: 'Awaiting Shipment',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          onClick={onCloseMobileMenu}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,.4)',
            zIndex: 999,
            cursor: 'pointer',
          }}
        />
      )}

      <div className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} style={{
        // Mobile: fixed, slides in from left
        ...(typeof window !== 'undefined' && window.innerWidth <= 768 ? {
          position: 'fixed',
          left: mobileMenuOpen ? 0 : '-280px',
          top: 0,
          bottom: 0,
          zIndex: 1000,
          transition: 'left 0.2s ease',
        } : {}),
      }}>
        <div className="sidebar-logo">
          <div className="logo-wordmark">PREP<span>SHIP</span></div>
          <div className="logo-sub">DR PREPPER Fulfillment</div>
        </div>

        {/* Search */}
        <div className="sidebar-search" style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search Orders…"
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            style={{ paddingRight: searchValue ? '28px' : undefined }}
          />
          {searchValue && (
            <button
              onClick={handleClearSearch}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text3)',
                fontSize: '13px',
                padding: '2px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div className="sidebar-nav">
          {statuses.map((status) => (
            <div
              key={status}
              className={`ss-section ${expandedSections.has(status) ? 'expanded' : ''}`}
            >
              <div
                className={`ss-header ${currentStatus === status ? 'active' : ''}`}
                onClick={() => onSelectStatus(status)}
              >
                <span
                  className="ss-arrow"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSection(status)
                  }}
                >
                  ▶
                </span>
                <span className="ss-label">{statusLabels[status]}</span>
                <span className="ss-badge">{statusCounts[status] || '—'}</span>
              </div>
              {expandedSections.has(status) && (
                <div className="ss-stores">
                  {stores
                    .map((store) => {
                      const counts = storeCountsByStatus[status] || {}
                      const count = (store.storeIds || []).reduce((sum: number, sid: number) => sum + (counts[sid] || 0), 0)
                      return { store, count }
                    })
                    .filter(({ store }) => useStoreVisibility(store.clientId))
                    .sort(({ count: a }, { count: b }) => b - a)
                    .map(({ store, count }) => (
                      <div 
                        key={store.clientId} 
                        className={`ss-store ${activeStore === store.clientId ? 'selected' : ''}`}
                        onClick={() => { 
                          onSelectStatus(status)
                          onSelectStore?.(store.clientId)
                        }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <span className="ss-store-name">{store.name}</span>
                        <span className="ss-store-count">{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

          <div className="sidebar-divider"></div>

          <div className="sidebar-tools">
            {[
              { view: 'inventory' as ViewType, icon: '📦', label: 'Inventory' },
              { view: 'locations' as ViewType, icon: '📍', label: 'Locations' },
              { view: 'packages' as ViewType, icon: '📐', label: 'Packages' },
              { view: 'rates' as ViewType, icon: '💰', label: 'Rate Shop' },
              { view: 'analysis' as ViewType, icon: '📊', label: 'Analysis' },
              { view: 'settings' as ViewType, icon: '⚙️', label: 'Settings' },
              { view: 'billing' as ViewType, icon: '🧾', label: 'Billing' },
              { view: 'manifests' as ViewType, icon: '📋', label: 'Manifests' },
            ].map(({ view, icon, label }) => (
              <div
                key={view}
                className="sidebar-tool-item"
                onClick={() => onShowView(view)}
                style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
              >
                <span className="sidebar-tool-icon">{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div><span className="conn-dot"></span>ShipStation Connected</div>
          <div style={{ marginTop: '2px' }}>DR PREPPER USA · Gardena CA</div>
        </div>
      </div>
    </>
  )
}
