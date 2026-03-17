import { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'
import type { OrdersDailyStatsDto } from '@prepshipv2/contracts/orders/contracts'
import './StatsBar.css'

export default function StatsBar() {
  const [stats, setStats] = useState<OrdersDailyStatsDto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiClient.getOrderDailyStats()
        setStats(data)
      } catch (error) {
        console.error('Failed to fetch order stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  if (loading || !stats) {
    return (
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-val">—</div>
          <div className="stat-lbl">Total Orders</div>
        </div>
      </div>
    )
  }

  const shippedCount = stats.totalOrders - stats.needToShip - stats.upcomingOrders
  const shippedPercentage = stats.totalOrders > 0 ? Math.round((shippedCount / stats.totalOrders) * 100) : 0

  return (
    <div className="stats-bar">
      <div className="stat-item">
        <div className="stat-val">{stats.totalOrders}</div>
        <div className="stat-lbl">Total Orders</div>
      </div>
      <div className="stat-sep"></div>
      <div className="stat-item stat-alert">
        <div className="stat-val">{stats.needToShip}</div>
        <div className="stat-lbl">Need to Ship</div>
      </div>
      <div className="stat-sep"></div>
      <div className="stat-item">
        <div className="stat-val">{stats.upcomingOrders}</div>
        <div className="stat-lbl">Upcoming</div>
      </div>
      <div className="stat-sep"></div>
      <div className="stat-item">
        <div className="stat-progress">
          <div className="progress-bar" style={{ width: `${shippedPercentage}%` }}></div>
        </div>
        <div className="stat-lbl">Shipped {shippedPercentage}%</div>
      </div>
    </div>
  )
}
