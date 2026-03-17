import { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'
import type { OrdersDailyStatsDto } from '@prepshipv2/contracts/orders/contracts'
import './StatsBar.css'

// Shift window: 12pm PT to 12pm PT next day (ships at 6PM boundary)
function getShiftWindow() {
  const now = new Date()
  const ptStr = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  const ptNow = new Date(ptStr)
  
  const shiftStart = new Date(ptNow)
  shiftStart.setHours(12, 0, 0, 0)
  
  if (ptNow.getHours() < 12) {
    shiftStart.setDate(shiftStart.getDate() - 1)
  }
  
  const shiftEnd = new Date(shiftStart)
  shiftEnd.setDate(shiftEnd.getDate() + 1)
  
  const fmtDate = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${m}/${day}`
  }

  const fmtTime = (d: Date) => {
    const h = d.getHours()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}pm ${ampm}`
  }

  return `📅 ${fmtDate(shiftStart)}, ${fmtTime(shiftStart)} PT → ${fmtDate(shiftEnd)}, ${fmtTime(shiftEnd)} PT (shifts at 6 PM)`
}

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
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const shiftWindow = getShiftWindow()

  if (loading || !stats) {
    return (
      <div className="stats-wrap">
        <div className="shift-banner">{shiftWindow}</div>
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-val">—</div>
            <div className="stat-lbl">Total Orders</div>
          </div>
        </div>
      </div>
    )
  }

  const shippedCount = stats.totalOrders - stats.needToShip - stats.upcomingOrders
  const shippedPercentage = stats.totalOrders > 0 ? Math.round((shippedCount / stats.totalOrders) * 100) : 0

  return (
    <div className="stats-wrap">
      {/* Daily Strip / Shift Window Banner (gap #5) */}
      <div className="shift-banner">
        <span style={{ marginRight: '16px' }}>{shiftWindow}</span>
      </div>

      {/* Stats Bar (gap #6: neutral gray background) */}
      <div className="stats-bar">
        <div className="stat-item" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px' }}>📦</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="stat-val">{stats.totalOrders}</div>
            <div className="stat-lbl">Total Orders</div>
          </div>
        </div>
        <div className="stat-sep"></div>
        <div className="stat-item stat-alert" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px' }}>🚚</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="stat-val">{stats.needToShip}</div>
            <div className="stat-lbl">Need to Ship</div>
          </div>
        </div>
        <div className="stat-sep"></div>
        <div className="stat-item" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px' }}>🔔</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="stat-val">{stats.upcomingOrders}</div>
            <div className="stat-lbl">Upcoming</div>
          </div>
        </div>
        <div className="stat-sep"></div>
        <div className="stat-item" style={{ minWidth: '120px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '3px' }}>
            {shippedCount} of {stats.totalOrders} shipped
          </div>
          <div className="stat-progress" style={{ width: '100%' }}>
            <div className="progress-bar" style={{ width: `${shippedPercentage}%` }}></div>
          </div>
          <div className="stat-lbl" style={{ color: shippedPercentage >= 80 ? 'var(--green)' : 'var(--text3)' }}>
            {shippedPercentage}%
          </div>
        </div>
      </div>
    </div>
  )
}
