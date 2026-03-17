import { useState, useMemo } from 'react'
import { useOrdersWithDetails } from '../../hooks'
import OrdersTable from '../Tables/OrdersTable'
import StatsBar from '../StatsBar/StatsBar'
import type { OrderSummaryDto } from '@prepshipv2/contracts/orders/contracts'

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

// Convert OrderSummaryDto to table Order format
function convertToTableOrder(dto: any): Order {
  return {
    orderId: dto.orderId,
    orderNumber: dto.orderNumber || '',
    orderDate: dto.orderDate || new Date().toISOString(),
    shipTo: dto.shipTo || { name: '', city: '', state: '' },
    items: Array.isArray(dto.items) ? (dto.items as any[]).map(i => ({
      sku: i.sku || '',
      name: i.name || '',
      quantity: i.quantity || 1,
    })) : [],
    weight: dto.weight || undefined,
    carrierCode: dto.carrierCode || undefined,
    serviceCode: dto.serviceCode || undefined,
    trackingNumber: dto.label?.trackingNumber || undefined,
    orderTotal: dto.orderTotal || undefined,
    shippingAccountName: dto.shippingAccountName || undefined,
    bestRate: dto.bestRate || undefined,
    shippingAmount: dto.shippingAmount || undefined,
  }
}

export default function OrdersView({ status, selectedOrders, setSelectedOrders, onOpenPanel }: OrdersViewProps) {
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  // Use the hook to fetch orders from the API
  const { orders, loading, error, refetch, total, pages, currentPage: apiPage, goToPage } = useOrdersWithDetails(status, {
    pageSize: rowsPerPage,
    page: currentPage,
  })

  // Filter and sort orders locally
  const filteredOrders = useMemo(() => {
    let filtered = orders
    if (searchText.trim()) {
      const query = searchText.toLowerCase()
      filtered = orders.filter(o =>
        o.orderNumber?.toLowerCase().includes(query) ||
        o.shipTo?.name?.toLowerCase().includes(query) ||
        o.clientName?.toLowerCase().includes(query)
      )
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let aVal: any = a[sortKey as keyof typeof a]
      let bVal: any = b[sortKey as keyof typeof b]

      if (sortKey === 'date') {
        aVal = new Date(a.orderDate || 0).getTime()
        bVal = new Date(b.orderDate || 0).getTime()
      } else if (sortKey === 'weight') {
        aVal = a.weight?.value || 0
        bVal = b.weight?.value || 0
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [orders, searchText, sortKey, sortDir])

  // Convert for table display
  const tableOrders = useMemo(() => filteredOrders.map(convertToTableOrder), [filteredOrders])

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

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
        <div style={{ fontSize: '13px', marginBottom: '8px' }}>⚠️ Failed to load orders</div>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '12px' }}>{error.message}</div>
        <button 
          onClick={() => refetch()} 
          className="btn btn-sm"
          style={{ backgroundColor: 'var(--ss-blue)', color: '#fff' }}
        >
          Retry
        </button>
      </div>
    )
  }

  const handleRowsPerPageChange = (newSize: number) => {
    setRowsPerPage(newSize)
    setCurrentPage(1)
  }

  const handlePrevPage = async () => {
    const newPage = Math.max(1, currentPage - 1)
    setCurrentPage(newPage)
    await goToPage(newPage)
  }

  const handleNextPage = async () => {
    const newPage = Math.min(pages, currentPage + 1)
    setCurrentPage(newPage)
    await goToPage(newPage)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <StatsBar />
      <div className="filterbar">
        <div className="search-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search orders, client, names…"
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
          <option value="">All Stores</option>
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
              orders={tableOrders}
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

      {/* Pagination Bar */}
      <div className="pagination-bar">
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
          Page {currentPage} of {pages}
        </span>
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className="btn btn-sm btn-ghost"
          style={{ marginLeft: '8px' }}
        >
          ← Prev
        </button>
        <button
          onClick={handleNextPage}
          disabled={currentPage >= pages}
          className="btn btn-sm btn-ghost"
          style={{ marginLeft: '4px' }}
        >
          Next →
        </button>
        <select
          value={rowsPerPage}
          onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
          className="filter-sel"
          style={{ marginLeft: 'auto' }}
        >
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
          <option value={100}>100 rows</option>
        </select>
      </div>
    </div>
  )
}
