import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useOrdersWithDetails } from '../../hooks'
import OrdersTable from '../Tables/OrdersTable'
import { ALL_COLUMNS } from '../Tables/columnDefs'
import OrderPanel from '../OrderPanel/OrderPanel'
import StatsBar from '../StatsBar/StatsBar'

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
    clientName: dto.clientName || undefined,
    shipTo: dto.shipTo || { name: '', city: '', state: '' },
    items: Array.isArray(dto.items) ? (dto.items as any[]).map((i: any) => ({
      sku: i.sku || '',
      name: i.name || '',
      quantity: i.quantity || 1,
      imageUrl: i.imageUrl || null,
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

// Compute shift window: noon PT shift. Shift day starts at 6PM and ends at 6PM next day.
function getShiftWindow() {
  const now = new Date()
  // PT offset: -8 (PST) or -7 (PDT) — use America/Los_Angeles
  const ptStr = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  const ptNow = new Date(ptStr)
  
  // Shift boundary is noon PT each day (orders from noon yesterday to noon today)
  const shiftStart = new Date(ptNow)
  shiftStart.setHours(12, 0, 0, 0)
  
  // If current time is before noon, shift started yesterday noon
  if (ptNow.getHours() < 12) {
    shiftStart.setDate(shiftStart.getDate() - 1)
  }
  
  const shiftEnd = new Date(shiftStart)
  shiftEnd.setDate(shiftEnd.getDate() + 1)
  
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', 
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles'
  })
  
  return `${fmt(shiftStart)} → ${fmt(shiftEnd)} PT`
}

// ── Column management helpers ────────────────────────────────────────────────
const LS_COL_ORDER = 'prepship_col_order'
const LS_COL_VIS = 'prepship_col_vis'

function loadColOrder(): string[] {
  try {
    const raw = localStorage.getItem(LS_COL_ORDER)
    if (raw) return JSON.parse(raw)
  } catch {}
  return ALL_COLUMNS.map(c => c.key)
}

function loadColVis(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_COL_VIS)
    if (raw) return JSON.parse(raw)
  } catch {}
  const defaults: Record<string, boolean> = {}
  ALL_COLUMNS.forEach(c => { defaults[c.key] = c.defaultVisible })
  return defaults
}

export default function OrdersView({ status, selectedOrders, setSelectedOrders, onOpenPanel }: OrdersViewProps) {
  const [searchText, setSearchText] = useState('')
  const [skuFilter, setSkuFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('last30')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)
  const [panelOrderId, setPanelOrderId] = useState<number | null>(null)
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1)
  const tableRef = useRef<HTMLDivElement>(null)

  // Column management state
  const [colOrder, setColOrder] = useState<string[]>(loadColOrder)
  const [colVis, setColVis] = useState<Record<string, boolean>>(loadColVis)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [dragColKey, setDragColKey] = useState<string | null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // Persist column state to localStorage
  useEffect(() => {
    localStorage.setItem(LS_COL_ORDER, JSON.stringify(colOrder))
  }, [colOrder])
  useEffect(() => {
    localStorage.setItem(LS_COL_VIS, JSON.stringify(colVis))
  }, [colVis])

  // Close col menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false)
      }
    }
    if (colMenuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colMenuOpen])

  // Compute visible col keys in order
  const visibleColKeys = useMemo(() => 
    colOrder.filter(key => colVis[key]),
    [colOrder, colVis]
  )

  // Column drag handlers
  const handleColDragStart = (key: string) => setDragColKey(key)
  const handleColDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault()
    if (!dragColKey || dragColKey === key) return
    setColOrder(prev => {
      const from = prev.indexOf(dragColKey)
      const to = prev.indexOf(key)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, dragColKey)
      return next
    })
  }
  const handleColDragEnd = () => setDragColKey(null)

  // Use the hook to fetch orders from the API
  const { orders, loading, error, refetch, total, pages, goToPage } = useOrdersWithDetails(status, {
    pageSize: rowsPerPage,
    page: currentPage,
  })

  // Build SKU list from loaded orders
  const skuList = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => {
      if (Array.isArray(o.items)) {
        (o.items as any[]).forEach((i: any) => { if (i.sku) set.add(i.sku) })
      }
    })
    return Array.from(set).sort()
  }, [orders])

  // Date filter cutoff
  const dateCutoff = useMemo(() => {
    const now = Date.now()
    if (dateFilter === 'last30') return now - 30 * 24 * 60 * 60 * 1000
    if (dateFilter === 'last90') return now - 90 * 24 * 60 * 60 * 1000
    if (dateFilter === 'thisMonth') {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime()
    }
    if (dateFilter === 'lastMonth') {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); d.setMonth(d.getMonth()-1); return d.getTime()
    }
    return 0 // 'all'
  }, [dateFilter])

  // Filter and sort orders locally
  const filteredOrders = useMemo(() => {
    let filtered = orders as any[]
    
    if (searchText.trim()) {
      const query = searchText.toLowerCase()
      filtered = filtered.filter((o: any) =>
        o.orderNumber?.toLowerCase().includes(query) ||
        o.shipTo?.name?.toLowerCase().includes(query) ||
        o.clientName?.toLowerCase().includes(query)
      )
    }

    if (skuFilter !== 'all') {
      filtered = filtered.filter((o: any) =>
        Array.isArray(o.items) && (o.items as any[]).some((i: any) => i.sku === skuFilter)
      )
    }

    if (dateCutoff > 0) {
      filtered = filtered.filter((o: any) => {
        const t = new Date(o.orderDate || 0).getTime()
        return t >= dateCutoff
      })
    }

    // Sort
    const sorted = [...filtered].sort((a: any, b: any) => {
      let aVal: any = a[sortKey]
      let bVal: any = b[sortKey]

      if (sortKey === 'date') {
        aVal = new Date(a.orderDate || 0).getTime()
        bVal = new Date(b.orderDate || 0).getTime()
      } else if (sortKey === 'weight') {
        aVal = a.weight?.value || 0
        bVal = b.weight?.value || 0
      } else if (sortKey === 'sku') {
        const getSkuVal = (o: any) => {
          const item = Array.isArray(o.items) ? o.items.find((i: any) => i.sku) : null
          return item?.sku?.toLowerCase() || ''
        }
        aVal = getSkuVal(a)
        bVal = getSkuVal(b)
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [orders, searchText, skuFilter, dateCutoff, sortKey, sortDir])

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
      setSelectedOrders(new Set(filteredOrders.map((o: any) => o.orderId)))
    } else {
      setSelectedOrders(new Set())
    }
  }

  const handleRowsPerPageChange = (newSize: number) => {
    setRowsPerPage(newSize)
    setCurrentPage(1)
  }

  // Export CSV — visible columns, current sort order
  const handleExportCSV = () => {
    const colDefs = visibleColKeys
      .map(key => ALL_COLUMNS.find(c => c.key === key))
      .filter(c => c && c.key !== 'select') as typeof ALL_COLUMNS

    const getRowValue = (order: any, colKey: string): string => {
      const item = Array.isArray(order.items) ? (order.items.find((i: any) => !('adjustment' in i)) || order.items[0]) : null
      switch (colKey) {
        case 'date': return order.orderDate ? new Date(order.orderDate).toLocaleString() : ''
        case 'client': return order.clientName || ''
        case 'orderNum': return order.orderNumber || ''
        case 'customer': return order.shipTo?.name || ''
        case 'itemname': return item?.name || ''
        case 'sku': return item?.sku || ''
        case 'qty': return String(item?.quantity || 1)
        case 'weight': return order.weight?.value ? `${order.weight.value}oz` : ''
        case 'shipto': return order.shipTo ? `${order.shipTo.city}, ${order.shipTo.state}` : ''
        case 'carrier': return [order.carrierCode, order.serviceCode].filter(Boolean).join(' • ')
        case 'custcarrier': return order.shippingAccountName || ''
        case 'total': return order.orderTotal != null ? `$${order.orderTotal.toFixed(2)}` : ''
        case 'bestrate': return order.bestRate?.cost != null ? `$${order.bestRate.cost.toFixed(2)}` : ''
        case 'tracking': return order.trackingNumber || ''
        default: return ''
      }
    }

    const headers = colDefs.map(c => c.label)
    const rows = filteredOrders.map(order =>
      colDefs.map(c => {
        const val = getRowValue(order, c.key)
        // Escape CSV: wrap in quotes if contains comma, newline, or quote
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prepship-orders-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // SKU sort toggle
  const handleSkuSort = () => {
    if (sortKey === 'sku') {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey('sku')
      setSortDir('asc')
    }
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

  const handleOpenPanelLocal = (orderId: number) => {
    setPanelOrderId(orderId)
    const idx = tableOrders.findIndex(o => o.orderId === orderId)
    if (idx >= 0) setFocusedRowIndex(idx)
    onOpenPanel(orderId)
  }

  const handleClosePanel = () => {
    setPanelOrderId(null)
    setFocusedRowIndex(-1)
  }

  // ── Keyboard navigation (gap #11) ──────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!tableOrders.length) return
    
    // Only handle when table area is focused
    const active = document.activeElement
    const tableEl = tableRef.current
    if (!tableEl) return
    // Allow when table or panel has focus, or when focused index is set
    if (!tableEl.contains(active) && panelOrderId === null && focusedRowIndex < 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(focusedRowIndex + 1, tableOrders.length - 1)
      setFocusedRowIndex(next)
      setPanelOrderId(tableOrders[next].orderId)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(focusedRowIndex - 1, 0)
      setFocusedRowIndex(prev)
      setPanelOrderId(tableOrders[prev].orderId)
    } else if (e.key === 'Enter' && focusedRowIndex >= 0) {
      e.preventDefault()
      const order = tableOrders[focusedRowIndex]
      if (order) {
        setPanelOrderId(order.orderId)
        onOpenPanel(order.orderId)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClosePanel()
    }
  }, [tableOrders, focusedRowIndex, panelOrderId, onOpenPanel])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

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

  const shiftWindow = getShiftWindow()
  const firstRow = (currentPage - 1) * rowsPerPage + 1
  const lastRow = Math.min(currentPage * rowsPerPage, total)

  return (
    <div id="view-orders" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* ── Daily Strip / Shift Window Banner (gap #5) ─────────────────── */}
      <StatsBar />

      {/* ── Filter Bar (gap #3) ───────────────────────────────────────── */}
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

        {/* All SKUs filter (was "All Stores") */}
        <select
          className="filter-sel"
          value={skuFilter}
          onChange={(e) => setSkuFilter(e.target.value)}
        >
          <option value="all">All SKUs</option>
          {skuList.map(sku => (
            <option key={sku} value={sku}>{sku}</option>
          ))}
        </select>

        {/* Date filter — Last 30 Days default */}
        <select
          className="filter-sel"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        >
          <option value="all">All Dates</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="last30">Last 30 Days</option>
          <option value="last90">Last 90 Days</option>
        </select>

        <button className="btn btn-ghost btn-sm" onClick={() => handleSelectAll(true)}>
          Select All
        </button>
        {selectedOrders.size > 1 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedOrders(new Set())}
            style={{ color: 'var(--text3)', borderColor: 'var(--border2)' }}
            title="Deselect all rows"
          >
            ✕ Deselect All ({selectedOrders.size})
          </button>
        )}
        <button 
          className={`btn btn-ghost btn-sm${sortKey === 'sku' ? ' btn-outline' : ''}`}
          onClick={handleSkuSort}
          title="Sort by SKU"
          style={sortKey === 'sku' ? { color: 'var(--ss-blue)', borderColor: 'var(--ss-blue)' } : {}}
        >
          SKU {sortKey === 'sku' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} title="Export visible columns as CSV">
          📥 Export CSV
        </button>
        <button className="btn btn-ghost btn-sm">🖨️ Picklist</button>

        {/* Columns dropdown */}
        <div ref={colMenuRef} style={{ position: 'relative' }}>
          <button 
            className="btn btn-outline btn-sm"
            onClick={() => setColMenuOpen(v => !v)}
          >
            ⊞ Columns
          </button>
          {colMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 5px)',
              right: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border2)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-lg)',
              padding: '6px 0',
              zIndex: 200,
              minWidth: '200px',
              maxHeight: '400px',
              overflowY: 'auto',
            }}>
              <div style={{ padding: '5px 12px 6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                Drag to reorder · Toggle visibility
              </div>
              {colOrder.map(key => {
                const col = ALL_COLUMNS.find(c => c.key === key)
                if (!col || col.key === 'select') return null
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => handleColDragStart(key)}
                    onDragOver={(e) => handleColDragOver(e, key)}
                    onDragEnd={handleColDragEnd}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      cursor: 'grab',
                      fontSize: '12.5px',
                      color: colVis[key] ? 'var(--text)' : 'var(--text3)',
                      background: dragColKey === key ? 'var(--ss-blue-bg)' : undefined,
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (dragColKey !== key) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (dragColKey !== key) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <span style={{ color: 'var(--text4)', fontSize: '11px', cursor: 'grab', flexShrink: 0 }}>⠿</span>
                    <input
                      type="checkbox"
                      checked={!!colVis[key]}
                      onChange={e => setColVis(prev => ({ ...prev, [key]: e.target.checked }))}
                      style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: 'var(--ss-blue)', flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                    />
                    <span style={{ flex: 1 }}>{col.label}</span>
                  </div>
                )
              })}
              <div style={{ padding: '6px 12px 4px', borderTop: '1px solid var(--border)' }}>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    const defaults: Record<string, boolean> = {}
                    ALL_COLUMNS.forEach(c => { defaults[c.key] = c.defaultVisible })
                    setColVis(defaults)
                    setColOrder(ALL_COLUMNS.map(c => c.key))
                  }}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="content-split" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div className="orders-section">
          <div className="orders-wrap" ref={tableRef} tabIndex={0} onFocus={() => { if (focusedRowIndex < 0 && tableOrders.length > 0) setFocusedRowIndex(0) }}>
            <OrdersTable
              status={status}
              orders={tableOrders}
              selectedOrders={selectedOrders}
              onSelectOrder={handleSelectOrder}
              onSelectAll={handleSelectAll}
              onOpenPanel={handleOpenPanelLocal}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              focusedRowIndex={focusedRowIndex}
              panelOrderId={panelOrderId}
              visibleColKeys={visibleColKeys}
            />
          </div>

          {/* Pagination Bar with total count (gap #9) */}
          <div className="pagination-bar">
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
              {total > 0 ? `${firstRow}–${lastRow} of ${total.toLocaleString()} orders` : 'No orders'}
            </span>
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="btn btn-sm btn-ghost"
              style={{ marginLeft: '8px' }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
              Page {currentPage} of {pages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= pages}
              className="btn btn-sm btn-ghost"
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

        {/* Right Panel — always visible (gap #2) */}
        <OrderPanel orderId={panelOrderId} onClose={handleClosePanel} />
      </div>
    </div>
  )
}
