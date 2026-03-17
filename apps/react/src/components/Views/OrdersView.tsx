import { useState, useEffect } from 'react'
import OrdersTable from '../Tables/OrdersTable'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

interface Order {
  orderId: number
  orderNumber: string
  orderDate: string
  shipTo: { name: string; city: string; state: string }
  items: Array<{ sku: string; name: string; quantity: number }>
  weight?: { value: number }
  carrierCode?: string
  serviceCode?: string
  trackingNumber?: string
  orderTotal?: number
}

interface OrdersViewProps {
  status: OrderStatus
  selectedOrders: Set<number>
  setSelectedOrders: (orders: Set<number>) => void
  onOpenPanel: (orderId: number) => void
}

export default function OrdersView({ status, selectedOrders, setSelectedOrders, onOpenPanel }: OrdersViewProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchOrders()
  }, [status])

  useEffect(() => {
    let filtered = orders
    if (searchText.trim()) {
      const query = searchText.toLowerCase()
      filtered = orders.filter(o =>
        o.orderNumber.toLowerCase().includes(query) ||
        o.shipTo?.name?.toLowerCase().includes(query) ||
        o.items.some(i => i.sku?.toLowerCase().includes(query) || i.name?.toLowerCase().includes(query))
      )
    }
    setFilteredOrders(filtered)
  }, [orders, searchText])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/orders?status=${status}`)
      const data = await response.json()
      setOrders(data.orders || [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  const handleSelectOrder = (orderId: number, selected: boolean) => {
    const newSelected = new Set(selectedOrders)
    if (selected) {
      newSelected.add(orderId)
    } else {
      newSelected.delete(orderId)
    }
    setSelectedOrders(newSelected)
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedOrders(new Set(filteredOrders.map(o => o.orderId)))
    } else {
      setSelectedOrders(new Set())
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div className="spinner"></div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>Loading orders…</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="filterbar">
        <div className="search-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search orders, SKUs, names…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ paddingRight: '26px', width: '100%' }}
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              style={{
                position: 'absolute',
                right: '7px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text3)',
                fontSize: '13px',
                padding: '2px',
              }}
            >
              ✕
            </button>
          )}
        </div>
        <select className="filter-sel" style={{ marginLeft: '8px' }}>
          <option value="">All SKUs</option>
        </select>
        <select className="filter-sel">
          <option value="">All Dates</option>
          <option value="this-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="last-30" selected>Last 30 Days</option>
          <option value="last-90">Last 90 Days</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => handleSelectAll(true)} style={{ marginLeft: 'auto' }}>
          Select All
        </button>
        <button className="btn btn-ghost btn-sm">📋 SKU Sort</button>
        <button className="btn btn-ghost btn-sm">📥 Export CSV</button>
      </div>

      <div className="content-split" style={{ flex: 1, overflow: 'hidden' }}>
        <div className="orders-section">
          <div className="orders-wrap">
            <OrdersTable
              status={status}
              orders={filteredOrders}
              selectedOrders={selectedOrders}
              onSelectOrder={handleSelectOrder}
              onSelectAll={handleSelectAll}
              onOpenPanel={onOpenPanel}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
