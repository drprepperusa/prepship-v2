import { useEffect, useState } from 'react'
import { useStoreOrders, useStores } from '../../hooks'
import './Sidebar.css'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'
type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing'

interface SidebarProps {
  currentStatus: OrderStatus
  onSelectStatus: (status: OrderStatus) => void
  onShowView: (view: ViewType) => void
  mobileMenuOpen: boolean
}

export default function Sidebar({ currentStatus, onSelectStatus, onShowView, mobileMenuOpen }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<OrderStatus>>(new Set(['awaiting_shipment']))
  const [statusCounts, setStatusCounts] = useState<Record<OrderStatus, number>>({
    awaiting_shipment: 0,
    shipped: 0,
    cancelled: 0,
  })

  // Fetch store orders
  const { storeCounts } = useStoreOrders(currentStatus)
  const { stores } = useStores()

  useEffect(() => {
    // Fetch status counts from API
    fetchStatusCounts()
  }, [])

  const fetchStatusCounts = async () => {
    try {
      const response = await fetch('/api/orders/summary')
      const data = await response.json()
      setStatusCounts(data.summary || statusCounts)
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

  const statuses: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled']
  const statusLabels: Record<OrderStatus, string> = {
    awaiting_shipment: 'Awaiting Shipment',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
  }

  return (
    <div className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-wordmark">PREP<span>SHIP</span></div>
        <div className="logo-sub">DR PREPPER Fulfillment</div>
      </div>

      <div className="sidebar-search">
        <input 
          type="text" 
          placeholder="Search Orders…"
          onChange={() => {
            // TODO: Implement search
          }}
        />
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
                {stores.map((store) => {
                  const count = storeCounts[store.clientId] || 0
                  return (
                    <div key={store.clientId} className="ss-store">
                      <span className="ss-store-name">{store.name}</span>
                      <span className="ss-store-count">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        <div className="sidebar-divider"></div>

        <div className="sidebar-tools">
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('inventory')}
          >
            <span className="sidebar-tool-icon">📦</span> Inventory
          </div>
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('locations')}
          >
            <span className="sidebar-tool-icon">📍</span> Locations
          </div>
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('packages')}
          >
            <span className="sidebar-tool-icon">📐</span> Packages
          </div>
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('rates')}
          >
            <span className="sidebar-tool-icon">💰</span> Rate Shop
          </div>
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('analysis')}
          >
            <span className="sidebar-tool-icon">📊</span> Analysis
          </div>
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('settings')}
          >
            <span className="sidebar-tool-icon">⚙️</span> Settings
          </div>
          <div 
            className="sidebar-tool-item"
            onClick={() => onShowView('billing')}
          >
            <span className="sidebar-tool-icon">🧾</span> Billing
          </div>
          <div className="sidebar-tool-item">
            <span className="sidebar-tool-icon">📋</span> Manifests
          </div>
        </div>
      </div>

      <div className="sidebar-bottom">
        <div><span className="conn-dot"></span>ShipStation Connected</div>
        <div style={{ marginTop: '2px' }}>DR PREPPER USA · Gardena CA</div>
      </div>
    </div>
  )
}
