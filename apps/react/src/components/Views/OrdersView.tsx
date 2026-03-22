import { useState, useEffect } from 'react'
import { useOrdersWithDetails } from '../../hooks/useOrdersWithDetails'
import './OrdersView.css'

interface OrdersViewProps {
  searchQuery?: string
  activeStore?: number | null
  dateFilter?: '' | 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'custom'
  onDateFilterChange?: (filter: any) => void
}

export default function OrdersView({ 
  searchQuery = '', 
  activeStore, 
  dateFilter = '',
  onDateFilterChange 
}: OrdersViewProps) {
  const [status, setStatus] = useState<'awaiting_shipment' | 'shipped' | 'cancelled'>('awaiting_shipment')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  
  const { orders, isLoading, error } = useOrdersWithDetails()

  const filteredOrders = orders.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(orders.length / pageSize)

  return (
    <div className="orders-view">
      <div className="orders-header">
        <h1>Orders</h1>
        <div className="orders-controls">
          <select 
            value={status} 
            onChange={(e) => {
              setStatus(e.target.value as any)
              setPage(1)
            }}
            className="status-filter"
          >
            <option value="awaiting_shipment">Awaiting Shipment</option>
            <option value="shipped">Shipped</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {isLoading && <div className="loading">Loading orders...</div>}
      {error && <div className="error">Failed to load orders: {error.message}</div>}

      <div className="orders-table-container">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data">No orders found</td>
              </tr>
            ) : (
              filteredOrders.map((order: any) => (
                <tr key={order.orderId}>
                  <td className="order-id">{order.orderNumber}</td>
                  <td>{order.customerEmail || '—'}</td>
                  <td>{order.items?.length || 0} items</td>
                  <td>${(order.orderTotal || 0).toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${status}`}>
                      {status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && orders.length > 0 && (
        <div className="orders-pagination">
          <button 
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {page} of {totalPages}
          </span>
          <button 
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
