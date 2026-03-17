import { useState, useEffect } from 'react'

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

interface OrdersTableProps {
  status: OrderStatus
  orders: Order[]
  selectedOrders: Set<number>
  onSelectOrder: (orderId: number, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  onOpenPanel: (orderId: number) => void
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
}

const COLUMNS = [
  { key: 'select', label: '', width: 34, sortable: false },
  { key: 'date', label: 'Order Date', width: 90, sortable: true },
  { key: 'client', label: 'Client', width: 100, sortable: true },
  { key: 'orderNum', label: 'Order #', width: 85, sortable: true },
  { key: 'customer', label: 'Recipient', width: 175, sortable: true },
  { key: 'itemname', label: 'Item Name', width: 170, sortable: true },
  { key: 'sku', label: 'SKU', width: 100, sortable: true },
  { key: 'qty', label: 'Qty', width: 44, sortable: true },
  { key: 'weight', label: 'Weight', width: 80, sortable: true },
  { key: 'shipto', label: 'Ship To', width: 135, sortable: true },
  { key: 'carrier', label: 'Carrier', width: 145, sortable: true },
  { key: 'custcarrier', label: 'Shipping Account', width: 140, sortable: true },
  { key: 'total', label: 'Order Total', width: 85, sortable: true },
  { key: 'bestrate', label: 'Best Rate', width: 105, sortable: false },
  { key: 'margin', label: 'Ship Margin', width: 90, sortable: false },
  { key: 'tracking', label: 'Tracking #', width: 160, sortable: false },
  { key: 'labelcreated', label: 'Label Created', width: 115, sortable: false },
  { key: 'age', label: 'Age', width: 50, sortable: true },
]

export default function OrdersTable({
  orders,
  selectedOrders,
  onSelectOrder,
  onSelectAll,
  onOpenPanel,
  sortKey = 'date',
  sortDir = 'desc',
  onSort,
}: OrdersTableProps) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {}
    COLUMNS.forEach(col => {
      widths[col.key] = col.width
    })
    return widths
  })

  const [resizing, setResizing] = useState<{ col: string; startX: number } | null>(null)

  useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX
      setColumnWidths(prev => ({
        ...prev,
        [resizing.col]: Math.max(40, prev[resizing.col] + delta),
      }))
      setResizing(prev => prev ? { ...prev, startX: e.clientX } : null)
    }

    const handleMouseUp = () => setResizing(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing])

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizing({ col: colKey, startX: e.clientX })
  }

  const getPrimaryItem = (order: Order) => {
    return order.items.find(i => !('adjustment' in i)) || order.items[0]
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '—'
    return `$${val.toFixed(2)}`
  }

  const getCellContent = (order: Order, colKey: string) => {
    const item = getPrimaryItem(order)
    switch (colKey) {
      case 'select':
        return null // Handled separately
      case 'date':
        return formatDate(order.orderDate)
      case 'client':
        return '—' // TODO: fetch client name
      case 'orderNum':
        return order.orderNumber
      case 'customer':
        return order.shipTo?.name || '—'
      case 'itemname':
        return item?.name || '—'
      case 'sku':
        return item?.sku || '—'
      case 'qty':
        return item?.quantity || 1
      case 'weight':
        return order.weight?.value ? `${order.weight.value}oz` : '—'
      case 'shipto':
        return order.shipTo ? `${order.shipTo.city}, ${order.shipTo.state}` : '—'
      case 'carrier':
        return order.carrierCode ? `${order.carrierCode}${order.serviceCode ? ' • ' + order.serviceCode : ''}` : '—'
      case 'custcarrier':
        return '—' // TODO: fetch shipping account
      case 'total':
        return formatCurrency(order.orderTotal)
      case 'bestrate':
        return '—'
      case 'margin':
        return '—'
      case 'tracking':
        return order.trackingNumber || '—'
      case 'labelcreated':
        return '—'
      case 'age':
        if (!order.orderDate) return '—'
        const days = Math.floor((Date.now() - new Date(order.orderDate).getTime()) / (1000 * 60 * 60 * 24))
        return `${days}d`
      default:
        return '—'
    }
  }

  const allSelected = orders.length > 0 && orders.every(o => selectedOrders.has(o.orderId))
  const someSelected = orders.some(o => selectedOrders.has(o.orderId))

  return (
    <div className="orders-table-wrapper">
      <table className="orders-table">
        <thead>
          <tr>
            {COLUMNS.map(col => {
              const isSorted = sortKey === col.key
              const sortClass = col.sortable ? `sortable ${isSorted ? `sort-${sortDir}` : ''}` : ''
              return (
                <th
                  key={col.key}
                  data-col={col.key}
                  style={{ width: `${columnWidths[col.key]}px` }}
                  className={sortClass}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  {col.key === 'select' ? (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(ref) => {
                        if (ref) {
                          (ref as any).indeterminate = someSelected && !allSelected
                        }
                      }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectAll(true)
                        } else {
                          onSelectAll(false)
                        }
                      }}
                    />
                  ) : (
                    <>
                      {col.label}
                      {col.sortable && isSorted && <span className="sort-arrow"></span>}
                    </>
                  )}
                  {col.key !== 'select' && (
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleResizeStart(col.key, e)}
                      onClick={(e) => e.stopPropagation()}
                    ></div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr
              key={order.orderId}
              onClick={() => onOpenPanel(order.orderId)}
              style={{ cursor: 'pointer' }}
            >
              {COLUMNS.map(col => (
                <td
                  key={`${order.orderId}-${col.key}`}
                  data-col={col.key}
                  style={{ width: `${columnWidths[col.key]}px` }}
                  onClick={(e) => col.key === 'select' && e.stopPropagation()}
                >
                  {col.key === 'select' ? (
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.orderId)}
                      onChange={(e) => {
                        e.stopPropagation()
                        onSelectOrder(order.orderId, e.target.checked)
                      }}
                    />
                  ) : (
                    getCellContent(order, col.key)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div>No orders match your filters</div>
        </div>
      )}
    </div>
  )
}
