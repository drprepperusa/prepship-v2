import { useState, useEffect } from 'react'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

interface Order {
  orderId: number
  orderNumber: string
  orderDate: string
  clientName?: string
  shipTo: { name: string; city: string; state: string }
  items: Array<{ sku: string; name: string; quantity: number }>
  weight?: { value: number }
  carrierCode?: string
  serviceCode?: string
  trackingNumber?: string
  orderTotal?: number
  shippingAccountName?: string
  bestRate?: { cost?: number; carrierCode?: string }
  shippingAmount?: number
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
  focusedRowIndex?: number
  panelOrderId?: number | null
}

// All available columns — V2 shows ~8 by default (gap #8)
const ALL_COLUMNS = [
  { key: 'select',      label: '',                 width: 34,  sortable: false, defaultVisible: true  },
  { key: 'date',        label: 'Order Date',       width: 100, sortable: true,  defaultVisible: true  },
  { key: 'client',      label: 'Client',           width: 90,  sortable: true,  defaultVisible: true  },
  { key: 'orderNum',    label: 'Order #',          width: 120, sortable: true,  defaultVisible: true  },
  { key: 'customer',    label: 'Recipient',        width: 130, sortable: true,  defaultVisible: true  },
  { key: 'itemname',    label: 'Item Name',        width: 200, sortable: true,  defaultVisible: true  },
  { key: 'sku',         label: 'SKU',              width: 90,  sortable: true,  defaultVisible: true  },
  { key: 'qty',         label: 'Qty',              width: 40,  sortable: true,  defaultVisible: true  },
  { key: 'weight',      label: 'Weight',           width: 80,  sortable: true,  defaultVisible: false },
  { key: 'shipto',      label: 'Ship To',          width: 120, sortable: true,  defaultVisible: false },
  { key: 'carrier',     label: 'Carrier',          width: 100, sortable: true,  defaultVisible: false },
  { key: 'custcarrier', label: 'Shipping Account', width: 130, sortable: true,  defaultVisible: false },
  { key: 'total',       label: 'Order Total',      width: 85,  sortable: true,  defaultVisible: false },
  { key: 'bestrate',    label: 'Best Rate',        width: 80,  sortable: false, defaultVisible: true  },
  { key: 'tracking',    label: 'Tracking #',       width: 120, sortable: false, defaultVisible: false },
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
  focusedRowIndex = -1,
  panelOrderId = null,
}: OrdersTableProps) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {}
    ALL_COLUMNS.forEach(col => { widths[col.key] = col.width })
    return widths
  })

  // Only show default-visible columns initially (gap #8)
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  )

  const columns = ALL_COLUMNS.filter(c => visibleCols.has(c.key))

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

  // Date format: MM/DD/YY (gap #7)
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    const h = d.getHours()
    const min = String(d.getMinutes()).padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${mm}/${dd}/${yy} ${h12}:${min} ${ampm}`
  }

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '—'
    return `$${val.toFixed(2)}`
  }

  const getCellContent = (order: Order, colKey: string) => {
    const item = getPrimaryItem(order)
    switch (colKey) {
      case 'select':
        return null
      case 'date':
        return <span style={{ fontSize: '11.5px', whiteSpace: 'nowrap' }}>{formatDate(order.orderDate)}</span>
      case 'client':
        return <span style={{ fontSize: '11.5px', color: 'var(--text2)' }}>{order.clientName || '—'}</span>
      case 'orderNum':
        return (
          <span className="order-num" onClick={(e) => { e.stopPropagation(); onOpenPanel(order.orderId) }}>
            {order.orderNumber}
          </span>
        )
      case 'customer':
        return <span style={{ fontWeight: 600 }}>{order.shipTo?.name || '—'}</span>
      case 'itemname':
        return (
          <span style={{ fontSize: '11.5px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
            {item?.name || '—'}
          </span>
        )
      case 'sku':
        return <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{item?.sku || '—'}</span>
      case 'qty':
        return item?.quantity || 1
      case 'weight':
        return order.weight?.value ? `${order.weight.value}oz` : '—'
      case 'shipto':
        return order.shipTo ? `${order.shipTo.city}, ${order.shipTo.state}` : '—'
      case 'carrier':
        return order.carrierCode ? (
          <span style={{ fontSize: '11px' }}>
            {order.carrierCode}
            {order.serviceCode && <span style={{ color: 'var(--text3)' }}> • {order.serviceCode}</span>}
          </span>
        ) : '—'
      case 'custcarrier':
        return <span style={{ fontSize: '11px' }}>{order.shippingAccountName || '—'}</span>
      case 'total':
        return <span style={{ fontWeight: 600 }}>{formatCurrency(order.orderTotal)}</span>
      case 'bestrate':
        return order.bestRate?.cost ? (
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{formatCurrency(order.bestRate.cost)}</span>
        ) : '—'
      case 'tracking':
        return order.trackingNumber ? (
          <span style={{ fontFamily: 'monospace', fontSize: '10.5px', color: 'var(--ss-blue)' }}>{order.trackingNumber}</span>
        ) : '—'
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
            {columns.map(col => {
              const isSorted = sortKey === col.key
              const sortClass = col.sortable ? `sortable ${isSorted ? `sort-${sortDir}` : ''}` : ''
              return (
                <th
                  key={col.key}
                  data-col={col.key}
                  style={{ width: `${columnWidths[col.key]}px`, position: 'relative' }}
                  className={sortClass}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  {col.key === 'select' ? (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(ref) => {
                        if (ref) (ref as any).indeterminate = someSelected && !allSelected
                      }}
                      onChange={(e) => onSelectAll(e.target.checked)}
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
                    />
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => {
            const isKbFocus = idx === focusedRowIndex
            const isPanelOpen = order.orderId === panelOrderId
            const isSelected = selectedOrders.has(order.orderId)
            let rowClass = ''
            if (isPanelOpen) rowClass = 'row-panel-open'
            else if (isKbFocus) rowClass = 'row-kb-focus'
            else if (isSelected) rowClass = 'row-selected'

            return (
              <tr
                key={order.orderId}
                className={rowClass}
                onClick={() => onOpenPanel(order.orderId)}
                style={{ cursor: 'pointer' }}
              >
                {columns.map(col => (
                  <td
                    key={`${order.orderId}-${col.key}`}
                    data-col={col.key}
                    style={{ width: `${columnWidths[col.key]}px` }}
                    onClick={(e) => col.key === 'select' && e.stopPropagation()}
                  >
                    {col.key === 'select' ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
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
            )
          })}
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
