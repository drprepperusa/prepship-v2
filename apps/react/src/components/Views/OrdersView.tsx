import { useState, useEffect } from 'react'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

interface OrdersViewProps {
  status: OrderStatus
  selectedOrders: Set<number>
  setSelectedOrders: (orders: Set<number>) => void
}

export default function OrdersView({ status, selectedOrders, setSelectedOrders }: OrdersViewProps) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
  }, [status])

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

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading orders…</div>
  }

  return (
    <div id="view-orders" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="filterbar">
        {/* Filter controls */}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="orders-table">
          <thead>
            <tr>
              <th>
                <input 
                  type="checkbox" 
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedOrders(new Set(orders.map((o) => o.orderId)))
                    } else {
                      setSelectedOrders(new Set())
                    }
                  }}
                  checked={selectedOrders.size === orders.length && orders.length > 0}
                />
              </th>
              <th>Order #</th>
              <th>Ship To</th>
              <th>Postal Code</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderId}>
                <td>
                  <input 
                    type="checkbox"
                    checked={selectedOrders.has(order.orderId)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedOrders)
                      if (e.target.checked) {
                        newSelected.add(order.orderId)
                      } else {
                        newSelected.delete(order.orderId)
                      }
                      setSelectedOrders(newSelected)
                    }}
                  />
                </td>
                <td>{order.orderNumber}</td>
                <td>{order.shipToName}</td>
                <td>{order.shipToPostalCode}</td>
                <td>{order.orderStatus}</td>
                <td>
                  <button className="btn btn-xs">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Right panel would render here */}
    </div>
  )
}
