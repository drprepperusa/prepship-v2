import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { CarrierAccountDto, InitStoreDto } from '@prepshipv2/contracts/init/contracts'
import { useOrdersWithDetails, useStores } from '../../hooks'
import { useStoreVisibilityContext } from '../../contexts/StoreVisibilityContext'
import { useToast } from '../../hooks/useToast'
import OrdersTable from '../Tables/OrdersTable'
import { ALL_COLUMNS } from '../Tables/columnDefs'
import type { TableCarrierAccount, TableOrder } from '../Tables/orders-table-parity'
import { getSortValue } from '../Tables/orders-table-parity'
import OrderPanel from '../OrderPanel/OrderPanel'
import StatsBar from '../StatsBar/StatsBar'
import { getOrdersDateRange, orderMatchesSearch, orderMatchesSku } from './orders-view-filters'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'
type OrdersDateFilter = '' | 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'custom'

interface MarkupRule {
  carrierCode?: string | null
  providerId?: number | null
  markup: number
  markupType: 'percent' | 'flat'
}

interface OrdersViewProps {
  status: OrderStatus
  selectedOrders: Set<number>
  setSelectedOrders: (orders: Set<number>) => void
  onOpenPanel: (orderId: number) => void
  onOrdersLoaded?: (orders: any[]) => void
  searchQuery?: string
  selectedClientId?: number | null
  dateFilter?: OrdersDateFilter
  setDateFilter?: (filter: OrdersDateFilter) => void
}

function convertToTableOrder(dto: any): TableOrder {
  return {
    orderId: dto.orderId,
    clientId: dto.clientId ?? null,
    orderNumber: dto.orderNumber || '',
    orderDate: dto.orderDate || new Date().toISOString(),
    orderStatus: dto.orderStatus || null,
    clientName: dto.clientName || null,
    customerEmail: dto.customerEmail || null,
    storeId: dto.storeId ?? null,
    shipTo: dto.shipTo || { name: '', city: '', state: '', postalCode: '' },
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
    selectedRate: dto.selectedRate || undefined,
    label: dto.label || undefined,
    externalShipped: dto.externalShipped || false,
    shippingAmount: dto.shippingAmount || undefined,
    raw: dto.raw,
    rateDims: dto.rateDims || null,
  }
}

function getDefaultColOrder(): string[] {
  return ALL_COLUMNS.map((column) => column.key)
}

function getDefaultColVis(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {}
  ALL_COLUMNS.forEach(c => { defaults[c.key] = c.defaultVisible })
  return defaults
}

function getDefaultColWidths(): Record<string, number> {
  const widths: Record<string, number> = {}
  ALL_COLUMNS.forEach((column) => {
    widths[column.key] = column.width
  })
  return widths
}

export default function OrdersView({ status, selectedOrders, setSelectedOrders, onOpenPanel, onOrdersLoaded, searchQuery, selectedClientId, dateFilter: propDateFilter, setDateFilter: propSetDateFilter }: OrdersViewProps) {
  const { showToast } = useToast()
  const [searchText, setSearchText] = useState(searchQuery || '')
  const [skuFilter, setSkuFilter] = useState('all')
  const dateFilter = propDateFilter ?? (status === 'awaiting_shipment' ? '' : 'last-30')
  const setDateFilter = propSetDateFilter || (() => {})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)
  const [panelOrderId, setPanelOrderId] = useState<number | null>(null)
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1)
  const tableRef = useRef<HTMLDivElement>(null)

  const [colOrder, setColOrder] = useState<string[]>(getDefaultColOrder)
  const [colVis, setColVis] = useState<Record<string, boolean>>(getDefaultColVis)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(getDefaultColWidths)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [dragColKey, setDragColKey] = useState<string | null>(null)
  const [markups, setMarkups] = useState<MarkupRule[]>([])
  const [storeMap, setStoreMap] = useState<Record<number, string>>({})
  const [carrierAccounts, setCarrierAccounts] = useState<TableCarrierAccount[]>([])
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  const { stores } = useStores()

  // Reset date filter to sensible default when switching status tabs
  useEffect(() => {
    setDateFilter(status === 'awaiting_shipment' ? '' : 'last-30')
  }, [status])

  useEffect(() => {
    setSearchText(searchQuery || '')
  }, [searchQuery])

  useEffect(() => {
    let cancelled = false

    async function loadPageContext() {
      try {
        const [markupsResponse, storesResponse, carrierAccountsResponse, prefsResponse] = await Promise.all([
          fetch('/api/settings/rbMarkups'),
          fetch('/api/stores'),
          fetch('/api/carrier-accounts'),
          fetch('/api/settings/colPrefs'),
        ])

        if (!cancelled && markupsResponse.ok) {
          const data = await markupsResponse.json() as Record<string, { type?: string; value?: number } | number>
          const next: MarkupRule[] = Object.entries(data || {}).flatMap(([key, value]) => {
            const record = typeof value === 'number' ? { type: 'flat', value } : value
            if (!record || typeof record !== 'object') return []
            const markup = typeof record.value === 'number' ? record.value : 0
            const markupType: 'percent' | 'flat' = record.type === 'pct' || record.type === 'percent' ? 'percent' : 'flat'
            if (/^\d+$/.test(key)) {
              return [{ providerId: Number(key), carrierCode: null, markup, markupType }]
            }
            return [{ carrierCode: key, providerId: null, markup, markupType }]
          })
          setMarkups(next)
        }

        if (!cancelled && storesResponse.ok) {
          const stores = await storesResponse.json() as InitStoreDto[]
          setStoreMap(Object.fromEntries(
            (Array.isArray(stores) ? stores : []).map((store) => [store.storeId, store.storeName]),
          ))
        }

        if (!cancelled && carrierAccountsResponse.ok) {
          const accounts = await carrierAccountsResponse.json() as CarrierAccountDto[]
          setCarrierAccounts(Array.isArray(accounts) ? accounts : [])
        }

        if (!cancelled && prefsResponse.ok) {
          const prefs = await prefsResponse.json() as {
            hidden?: string[]
            order?: string[]
            widths?: Record<string, number>
          }
          const defaultOrder = getDefaultColOrder()
          const validOrder = Array.isArray(prefs.order)
            ? prefs.order.filter((key): key is string => defaultOrder.includes(key))
            : []
          const missing = defaultOrder.filter((key) => !validOrder.includes(key))
          setColOrder(validOrder.length > 0 ? [...validOrder, ...missing] : defaultOrder)

          const nextVis = getDefaultColVis()
          if (Array.isArray(prefs.hidden)) {
            prefs.hidden.forEach((key) => {
              if (key in nextVis) nextVis[key] = false
            })
          }
          setColVis(nextVis)

          if (prefs.widths && typeof prefs.widths === 'object') {
            setColumnWidths((prev) => ({ ...prev, ...prefs.widths }))
          }
        }
      } catch {
        if (!cancelled) setMarkups([])
      } finally {
        if (!cancelled) setPrefsLoaded(true)
      }
    }

    loadPageContext()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!prefsLoaded) return

    const timer = window.setTimeout(() => {
      void fetch('/api/settings/colPrefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: colOrder,
          hidden: Object.keys(colVis).filter((key) => key !== 'select' && !colVis[key]),
          widths: columnWidths,
        }),
      }).catch(() => {})
    }, 400)

    return () => window.clearTimeout(timer)
  }, [colOrder, colVis, columnWidths, prefsLoaded])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false)
      }
    }
    if (colMenuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colMenuOpen])

  const visibleColKeys = useMemo(
    () => colOrder.filter(key => colVis[key]),
    [colOrder, colVis],
  )

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

  const dateRange = useMemo(
    () => getOrdersDateRange(dateFilter, { start: dateFrom, end: dateTo }),
    [dateFilter, dateFrom, dateTo],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [status, rowsPerPage, dateFilter, dateFrom, dateTo])

  const { orders, loading, error, refetch, total, pages, goToPage } = useOrdersWithDetails(status, {
    pageSize: rowsPerPage,
    page: currentPage,
    dateStart: dateRange?.start?.toISOString(),
    dateEnd: dateRange?.end?.toISOString(),
    clientId: selectedClientId,
  })

  const skuList = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => {
      if (Array.isArray(o.items)) {
        ;(o.items as any[]).forEach((i: any) => {
          if (i.sku) set.add(i.sku)
        })
      }
    })
    return Array.from(set).sort()
  }, [orders])

  const { useStoreVisibility } = useStoreVisibilityContext()

  const filteredOrders = useMemo(() => {
    let filtered = orders as TableOrder[]

    filtered = filtered.filter((order) => orderMatchesSearch(order, searchText))
    filtered = filtered.filter((order) => orderMatchesSku(order, skuFilter))
    
    // Filter by visibility: only show orders from visible clients
    filtered = filtered.filter((order) => useStoreVisibility(order.clientId ?? 0))
    
    // Filter by selected client's storeIds
    if (selectedClientId !== null && selectedClientId !== undefined) {
      const selectedClient = stores.find((s) => s.clientId === selectedClientId)
      if (selectedClient && Array.isArray(selectedClient.storeIds)) {
        const selectedStoreIds = new Set(selectedClient.storeIds)
        filtered = filtered.filter((order) => order.storeId !== null && selectedStoreIds.has(order.storeId))
      }
    }

    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, sortKey, { storeMap, carrierAccounts })
      const bVal = getSortValue(b, sortKey, { storeMap, carrierAccounts })

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [orders, searchText, skuFilter, sortKey, sortDir, storeMap, carrierAccounts, selectedClientId, stores, useStoreVisibility])

  const tableOrders = useMemo(() => filteredOrders.map(convertToTableOrder), [filteredOrders])

  useEffect(() => {
    onOrdersLoaded?.(tableOrders)
  }, [tableOrders, onOrdersLoaded])

  const handleExportCSV = () => {
    const params = new URLSearchParams()
    params.set('orderStatus', status)
    if (dateRange?.start) params.set('dateStart', dateRange.start.toISOString())
    if (dateRange?.end) params.set('dateEnd', dateRange.end.toISOString())
    const url = `/api/orders/export?${params}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showToast('CSV exported successfully. Check your Downloads folder.', 'success')
  }

  const handlePicklist = async () => {
    const params = new URLSearchParams()
    params.set('orderStatus', status)
    if (dateRange?.start) params.set('dateStart', dateRange.start.toISOString())
    if (dateRange?.end) params.set('dateEnd', dateRange.end.toISOString())

    let data: { skus: any[]; orderStatus: string }
    try {
      const r = await fetch(`/api/orders/picklist?${params}`)
      data = await r.json()
      if (!r.ok) throw new Error((data as any)?.error || 'Server error')
    } catch (e: any) {
      showToast(`Picklist error: ${e.message}`, 'error')
      return
    }

    if (!data.skus?.length) {
      showToast('No items found for current filter', 'info')
      return
    }

    const now = new Date().toLocaleString()
    const totalUnits = data.skus.reduce((s: number, r: any) => s + r.totalQty, 0)
    const totalSkus = data.skus.length

    const rows = data.skus.map((s: any, i: number) => {
      const img = s.imageUrl
        ? `<img src="${s.imageUrl}" style="width:48px;height:48px;object-fit:cover;border-radius:5px;border:1px solid #e0e0e0" onerror="this.style.display='none'">`
        : `<div style="width:48px;height:48px;background:#f5f5f5;border-radius:5px;border:1px solid #e0e0e0;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`
      return `<tr>
        <td style="font-size:11px;color:#888;text-align:center">${i + 1}</td>
        <td style="font-size:12px;font-weight:700;color:#333">${s.clientName || '—'}</td>
        <td style="text-align:center">${img}</td>
        <td>
          <div style="font-weight:600;font-size:13px;color:#1a1a1a;margin-bottom:3px">${s.name || '—'}</div>
          <div style="font-family:monospace;font-size:11px;color:#666;background:#f5f5f5;display:inline-block;padding:1px 6px;border-radius:3px">${s.sku}</div>
        </td>
        <td style="text-align:center"><span style="font-size:26px;font-weight:800;color:#1a1a1a">${s.totalQty}</span></td>
        <td style="text-align:center"><div style="width:34px;height:34px;border:2px solid #ccc;border-radius:6px;margin:0 auto"></div></td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>PrepShip Pick List — ${now}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a1a; padding: 24px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #1a1a1a; }
.header h1 { font-size: 22px; font-weight: 800; }
.header .meta { font-size: 12px; color: #555; margin-top: 4px; }
.stats { display: flex; gap: 24px; }
.stat { text-align: right; }
.stat .n { font-size: 28px; font-weight: 800; line-height: 1; }
.stat .l { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
table { width: 100%; border-collapse: collapse; }
thead th { background: #1a1a1a; color: #fff; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
thead th:nth-child(1), thead th:nth-child(3), thead th:nth-child(5), thead th:nth-child(6) { text-align: center; }
tbody tr:nth-child(even) td { background: #fafafa; }
td { padding: 10px; border-bottom: 1px solid #e8e8e8; vertical-align: middle; }
@media print { @page { size: letter portrait; margin: 12mm; } body { padding: 0; } }
</style></head><body>
<div class="header">
  <div>
    <h1>📦 PrepShip Pick List</h1>
    <div class="meta">Generated: ${now} · Status: ${status.replace(/_/g, ' ')}</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="n">${totalSkus}</div><div class="l">SKUs</div></div>
    <div class="stat"><div class="n">${totalUnits}</div><div class="l">Total Units</div></div>
  </div>
</div>
<table>
  <thead><tr><th>#</th><th>Client</th><th>IMG</th><th>Item / SKU</th><th>Qty to Pick</th><th>✓ Done</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload = () => window.print();<\/script>
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
    else showToast('⚠️ Allow popups to print pick list', 'error')
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'date' || key === 'age' ? 'desc' : 'asc')
    }
  }

  const handleSelectOrder = (orderId: number, selected: boolean) => {
    const newSelected = new Set(selectedOrders)
    if (selected) newSelected.add(orderId)
    else newSelected.delete(orderId)
    setSelectedOrders(newSelected)
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedOrders(new Set(filteredOrders.map((o: any) => o.orderId)))
      return
    }
    setSelectedOrders(new Set())
  }

  const handleRowsPerPageChange = (newSize: number) => {
    setRowsPerPage(newSize)
    setCurrentPage(1)
  }

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!tableOrders.length) return

    const active = document.activeElement
    const tableEl = tableRef.current
    if (!tableEl) return
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

  const firstRow = (currentPage - 1) * rowsPerPage + 1
  const lastRow = Math.min(currentPage * rowsPerPage, total)
  const showCustomDateWrap = dateFilter === 'custom'

  return (
    <div id="view-orders" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="filterbar">
        <div className="search-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>

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

        <select
          className="filter-sel"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as OrdersDateFilter)}
        >
          <option value="">All Dates</option>
          <option value="this-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="last-30">Last 30 Days</option>
          <option value="last-90">Last 90 Days</option>
          <option value="custom">Custom…</option>
        </select>

        <div style={{ display: showCustomDateWrap ? 'flex' : 'none', alignItems: 'center', gap: '4px' }}>
          <input
            type="date"
            className="filter-sel"
            style={{ padding: '4px 6px', fontSize: '11.5px', width: 'auto' }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span style={{ color: 'var(--text3)', fontSize: '11px' }}>–</span>
          <input
            type="date"
            className="filter-sel"
            style={{ padding: '4px 6px', fontSize: '11.5px', width: 'auto' }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div ref={colMenuRef} className="col-toggle-wrap" style={{ position: 'relative' }}>
          <button
            id="colBtnFilter"
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
                    setColVis(getDefaultColVis())
                    setColOrder(getDefaultColOrder())
                    setColumnWidths(getDefaultColWidths())
                  }}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          )}
        </div>

        <button id="btnSelectAll" className="btn btn-ghost btn-sm" onClick={() => handleSelectAll(true)}>
          Select All
        </button>
        <button
          id="btnSkuSort"
          className={`btn btn-ghost btn-sm${sortKey === 'sku' ? ' btn-outline' : ''}`}
          onClick={handleSkuSort}
          title="Sort by SKU"
          style={sortKey === 'sku' ? { color: 'var(--ss-blue)', borderColor: 'var(--ss-blue)', gap: '4px' } : { gap: '4px' }}
        >
          📋 SKU Sort
        </button>
        <button
          id="btnExportCSV"
          className="btn btn-ghost btn-sm"
          onClick={handleExportCSV}
          title="Export orders to CSV"
          style={{ gap: '4px' }}
        >
          📥 Export CSV
        </button>
        <button
          id="picklistBtn"
          className="btn btn-ghost btn-sm"
          onClick={handlePicklist}
          style={{ marginLeft: 'auto', display: status === 'awaiting_shipment' ? undefined : 'none', fontSize: '11.5px', gap: '4px' }}
        >
          🖨️ Picklist
        </button>
      </div>

      <StatsBar />

      <div className="content-split" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'row', position: 'relative' }}>
        <div className="orders-section" style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: '75px' }}>
          <div className="orders-wrap" ref={tableRef} tabIndex={0} onFocus={() => { if (focusedRowIndex < 0 && tableOrders.length > 0) setFocusedRowIndex(0) }}>
            <OrdersTable
              status={status}
              orders={tableOrders}
              markups={markups}
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
              storeMap={storeMap}
              carrierAccounts={carrierAccounts}
              columnWidths={columnWidths}
              onColumnWidthsChange={setColumnWidths}
            />
          </div>
        </div>

        <div className="pagination-bar" style={{ position: 'fixed', bottom: 0, left: 'var(--sidebar-w, 240px)', right: 0, zIndex: 100 }}>
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

        <OrderPanel
          orderId={panelOrderId}
          orderSnapshot={orders.find((order) => order.orderId === panelOrderId) ?? null}
          orderIds={tableOrders.map((order) => order.orderId)}
          onOpenOrder={handleOpenPanelLocal}
          onClose={handleClosePanel}
          onRefresh={refetch}
        />
      </div>
    </div>
  )
}
