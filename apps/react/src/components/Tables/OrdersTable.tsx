import { useEffect, useState } from 'react'
import { ALL_COLUMNS } from './columnDefs'
import { ageColor, ageDisplay, fmtWeight } from '../../utils/orders'
import { applyCarrierMarkup, formatLabelCreated, getAwaitingMarginDisplay, getRateBaseTotal, type TableMarkupRule } from './orders-table-display'
import type { TableCarrierAccount, TableOrder, TableOrderItem, TableRate } from './orders-table-parity'
import {
  getDiagnosticAccountNickname,
  getDiagnosticCarrierCode,
  getDiagnosticProviderId,
  getDiagnosticServiceCode,
  getOrderDimensions,
  getSelectedRateProviderId,
  getSelectedRateTotal,
  getShipAcct,
  getStoreName,
  isExternallyFulfilledOrder,
} from './orders-table-parity'

export { ALL_COLUMNS } from './columnDefs'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'

interface OrdersTableProps {
  status: OrderStatus
  orders: TableOrder[]
  markups?: TableMarkupRule[]
  selectedOrders: Set<number>
  onSelectOrder: (orderId: number, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  onOpenPanel: (orderId: number) => void
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  focusedRowIndex?: number
  panelOrderId?: number | null
  visibleColKeys?: string[]
  storeMap?: Record<number, string>
  carrierAccounts?: TableCarrierAccount[]
  columnWidths: Record<string, number>
  onColumnWidthsChange: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void
}

const CARRIER_NAMES: Record<string, string> = {
  stamps_com: 'USPS',
  usps: 'USPS',
  ups: 'UPS',
  ups_walleted: 'UPS',
  fedex: 'FedEx',
  fedex_walleted: 'FedEx',
  dhl_express: 'DHL',
  asendia_us: 'Asendia',
  ontrac: 'OnTrac',
  lasership: 'LaserShip',
  amazon_swa: 'Amazon',
  globegistics: 'Globegistics',
}

const SERVICE_NAMES: Record<string, string> = {
  usps_priority_mail: 'Priority Mail',
  usps_priority_mail_express: 'Priority Express',
  usps_first_class_mail: 'First Class',
  usps_ground_advantage: 'Ground Advantage',
  usps_media_mail: 'Media Mail',
  usps_library_mail: 'Library Mail',
  usps_parcel_select: 'Parcel Select',
  ups_ground: 'UPS Ground',
  ups_ground_saver: 'UPS Ground Saver',
  ups_surepost: 'UPS SurePost',
  ups_surepost_1_lb_or_greater: 'UPS SurePost (≥1 lb)',
  ups_surepost_less_than_1_lb: 'UPS SurePost (<1 lb)',
  ups_3_day_select: 'UPS 3 Day Select',
  ups_2nd_day_air: 'UPS 2nd Day Air',
  ups_2nd_day_air_am: 'UPS 2nd Day Air AM',
  ups_next_day_air_saver: 'UPS Next Day Air Saver',
  ups_next_day_air: 'UPS Next Day Air',
  ups_next_day_air_early_am: 'UPS Next Day Air Early AM',
  ups_worldwide_express: 'UPS Worldwide Express',
  fedex_ground: 'FedEx Ground',
  fedex_home_delivery: 'FedEx Home Delivery',
  fedex_2day: 'FedEx 2Day',
  fedex_2day_am: 'FedEx 2Day AM',
  fedex_2_day: 'FedEx 2Day',
  fedex_express_saver: 'FedEx Express Saver',
  fedex_priority_overnight: 'FedEx Priority Overnight',
  fedex_standard_overnight: 'FedEx Standard Overnight',
  fedex_first_overnight: 'FedEx First Overnight',
}

const CLIENT_PALETTES = [
  { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  { bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
  { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  { bg: '#f3e8ff', color: '#6b21a8', border: '#c4b5fd' },
  { bg: '#ffe4e6', color: '#9f1239', border: '#fda4af' },
  { bg: '#e0f2fe', color: '#075985', border: '#7dd3fc' },
  { bg: '#f0fdf4', color: '#14532d', border: '#4ade80' },
  { bg: '#fff7ed', color: '#9a3412', border: '#fdba74' },
  { bg: '#f1f5f9', color: '#334155', border: '#94a3b8' },
]

const clientColorCache: Record<string, { bg: string; color: string; border: string }> = {}

function trunc(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function clientPalette(name: string) {
  if (!clientColorCache[name]) {
    let hash = 0
    for (let index = 0; index < name.length; index += 1) {
      hash = (hash * 31 + name.charCodeAt(index)) & 0xffff
    }
    clientColorCache[name] = CLIENT_PALETTES[hash % CLIENT_PALETTES.length]
  }
  return clientColorCache[name]
}

function carrierLabel(code?: string | null): string {
  if (!code) return '—'
  if (CARRIER_NAMES[code]) return CARRIER_NAMES[code]
  if (code.startsWith('ups')) return 'UPS'
  if (code.startsWith('fedex')) return 'FedEx'
  return code.replace(/_/g, ' ').toUpperCase()
}

function carrierBadgeClass(code?: string | null): string {
  if (!code) return 'carrier-other'
  if (code.includes('ups')) return 'carrier-ups'
  if (code.includes('fedex')) return 'carrier-fedex'
  if (code.includes('stamps') || code.includes('usps')) return 'carrier-usps'
  return 'carrier-other'
}

function serviceLabel(code?: string | null, fallback?: string | null): string {
  if (code && SERVICE_NAMES[code]) return SERVICE_NAMES[code]
  if (fallback) return fallback
  if (!code) return '—'
  return code.replace(/_/g, ' ')
}

function formatCarrierDisplay(rate?: TableRate | null, fallbackCode = 'Unknown'): string {
  if (!rate) return fallbackCode
  if (rate.carrierNickname && !rate.carrierNickname.startsWith('se-')) return rate.carrierNickname
  if (rate._label && !rate._label.startsWith('se-')) return rate._label
  return CARRIER_NAMES[rate.carrierCode || ''] || fallbackCode
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${mm}/${dd}/${yy} ${hour12}:${minutes} ${ampm}`
}

function formatCurrency(value?: number | null) {
  if (value == null) return '—'
  return `$${value.toFixed(2)}`
}

function getItems(order: TableOrder): TableOrderItem[] {
  return order.items.filter((item) => !item.adjustment)
}

function getPrimaryItem(order: TableOrder): TableOrderItem | null {
  const items = getItems(order)
  return items[0] || order.items[0] || null
}

function getTotalQty(order: TableOrder): number {
  return getItems(order).reduce((sum, item) => sum + (item.quantity || 1), 0)
}

function getUniqueSkus(order: TableOrder): string[] {
  return [...new Set(getItems(order).map((item) => item.sku).filter(Boolean) as string[])]
}

function getMergedItems(order: TableOrder): Array<TableOrderItem & { _key: string }> {
  const merged: Array<TableOrderItem & { _key: string }> = []
  for (const item of getItems(order)) {
    const key = `${item.sku || ''}|${item.name || ''}`
    const existing = merged.find((entry) => entry._key === key)
    if (existing) existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
    else merged.push({ ...item, _key: key })
  }
  return merged
}

function hasCompleteDims(order: TableOrder): boolean {
  return getOrderDimensions(order) != null
}

function isException(order: TableOrder): boolean {
  if (order.orderStatus !== 'awaiting_shipment') return false
  return ageDisplay(order.orderDate) !== 'now' && (ageColor(order.orderDate) === 'red' || !(order.weight?.value && order.weight.value > 0))
}

function isShippedOrder(order: TableOrder): boolean {
  return order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
}

function CarrierBadge({ code }: { code?: string | null }) {
  return <span className={`carrier-badge ${carrierBadgeClass(code)}`}>{carrierLabel(code)}</span>
}

function ClientBadge({ name }: { name: string }) {
  const palette = clientPalette(name)
  return (
    <span
      className="client-badge"
      style={{ background: palette.bg, color: palette.color, borderColor: palette.border }}
    >
      {trunc(name, 14)}
    </span>
  )
}

function buildDisplayedRate(order: TableOrder, markups: TableMarkupRule[]) {
  if (order.label?.cost != null) {
    return {
      total: order.label.cost,
      carrierCode: order.label.carrierCode,
    }
  }

  if (order.orderStatus !== 'awaiting_shipment') {
    const rawCost = getSelectedRateTotal(order)
    if (rawCost == null) return null
    return {
      total: applyCarrierMarkup(rawCost, order.selectedRate?.carrierCode, markups, getSelectedRateProviderId(order)),
      carrierCode: order.selectedRate?.carrierCode,
    }
  }

  const rawCost = getRateBaseTotal(order.bestRate)
  if (rawCost == null) return null
  return {
    total: applyCarrierMarkup(rawCost, order.bestRate?.carrierCode, markups, order.bestRate?.shippingProviderId),
    carrierCode: order.bestRate?.carrierCode,
  }
}

function buildMarginDisplay(order: TableOrder, markups: TableMarkupRule[]) {
  if (order.orderStatus !== 'awaiting_shipment') {
    if (order.label?.rawCost != null && order.label.cost != null) {
      const diff = order.label.cost - order.label.rawCost
      if (diff <= 0) return null
      const pct = order.label.rawCost > 0 ? Math.round((diff / order.label.rawCost) * 100) : 0
      return { diff, pct }
    }

    const rawCost = getSelectedRateTotal(order)
    const markedCost = rawCost != null
      ? applyCarrierMarkup(rawCost, order.selectedRate?.carrierCode, markups, getSelectedRateProviderId(order))
      : null
    if (rawCost == null || markedCost == null) return null
    const diff = markedCost - rawCost
    if (diff <= 0) return null
    return {
      diff,
      pct: rawCost > 0 ? Math.round((diff / rawCost) * 100) : 0,
    }
  }

  return getAwaitingMarginDisplay(order.bestRate, markups)
}

export default function OrdersTable({
  status,
  orders,
  markups = [],
  selectedOrders,
  onSelectOrder,
  onSelectAll,
  onOpenPanel,
  sortKey = 'date',
  sortDir = 'desc',
  onSort,
  focusedRowIndex = -1,
  panelOrderId = null,
  visibleColKeys,
  storeMap = {},
  carrierAccounts = [],
  columnWidths,
  onColumnWidthsChange,
}: OrdersTableProps) {
  const [resizing, setResizing] = useState<{ col: string; startX: number } | null>(null)

  const autoHidden = new Set<string>()
  if (status !== 'awaiting_shipment') autoHidden.add('age')
  if (status === 'awaiting_shipment') autoHidden.add('tracking')

  const columns = (visibleColKeys
    ? visibleColKeys.map((key) => ALL_COLUMNS.find((column) => column.key === key)).filter(Boolean) as typeof ALL_COLUMNS
    : ALL_COLUMNS.filter((column) => column.defaultVisible)
  ).filter((column) => !autoHidden.has(column.key))

  useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - resizing.startX
      onColumnWidthsChange((prev) => ({
        ...prev,
        [resizing.col]: Math.max(40, (prev[resizing.col] || 0) + delta),
      }))
      setResizing((prev) => prev ? { ...prev, startX: event.clientX } : null)
    }

    const handleMouseUp = () => setResizing(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onColumnWidthsChange, resizing])

  const handleResizeStart = (colKey: string, event: React.MouseEvent) => {
    event.preventDefault()
    setResizing({ col: colKey, startX: event.clientX })
  }

  const allSelected = orders.length > 0 && orders.every((order) => selectedOrders.has(order.orderId))
  const someSelected = orders.some((order) => selectedOrders.has(order.orderId))

  const getColumnWidth = (key: string) => columnWidths[key] ?? ALL_COLUMNS.find((column) => column.key === key)?.width ?? 80

  const renderItemNameCell = (order: TableOrder) => {
    const item = getPrimaryItem(order)
    const items = getItems(order)
    const uniqueSkus = getUniqueSkus(order)
    const isMultiSku = uniqueSkus.length > 1
    const itemColumnWidth = getColumnWidth('itemname')

    if (isMultiSku) {
      const mergedItems = getMergedItems(order)
      const visibleItems = mergedItems.slice(0, 5)
      const overflow = mergedItems.length - visibleItems.length
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '3px 0', maxWidth: `${itemColumnWidth}px`, overflow: 'hidden' }}>
          {visibleItems.map((entry) => (
            <div key={entry._key} style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: '22px', height: '22px', borderRadius: '3px', objectFit: 'cover', flexShrink: 0 }}
                  onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <span style={{ width: '22px', height: '22px', flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '3px', display: 'inline-block' }} />
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11.5px', minWidth: 0 }}>
                  {entry.name || entry.sku || '—'}
                </span>
                {(entry.quantity || 1) > 1 && (
                  <span style={{ background: 'var(--ss-blue-bg)', color: 'var(--ss-blue)', fontSize: '9.5px', fontWeight: 700, padding: '0 4px', borderRadius: '3px', flexShrink: 0 }}>
                    ×{entry.quantity}
                  </span>
                )}
              </span>
            </div>
          ))}
          {overflow > 0 && <div style={{ fontSize: '10.5px', color: 'var(--text3)', paddingLeft: '27px' }}>+{overflow} more</div>}
        </div>
      )
    }

    const extra = items.length > 1 ? ` ×${getTotalQty(order)}` : ''
    return (
      <div
        className="cell-itemname"
        title={item?.name || '—'}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: `${itemColumnWidth}px` }}
      >
        {item?.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item?.name || '—'}
          {extra ? <span style={{ color: 'var(--text3)', fontSize: '10.5px' }}> {extra}</span> : null}
        </span>
      </div>
    )
  }

  const renderSkuCell = (order: TableOrder) => {
    const uniqueSkus = getUniqueSkus(order)
    if (uniqueSkus.length > 1) {
      const mergedItems = getMergedItems(order).slice(0, 5)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '3px 0' }}>
          {mergedItems.map((entry) => (
            <div key={entry._key} style={{ display: 'flex', alignItems: 'center', height: '22px', gap: '3px', minWidth: 0 }}>
              {entry.sku ? <span className="sku-link" style={{ fontSize: '11px' }}>{entry.sku}</span> : <span style={{ color: 'var(--text4)', fontSize: '11px' }}>—</span>}
            </div>
          ))}
        </div>
      )
    }

    return <span className="sku-link" style={{ fontFamily: 'monospace', fontSize: '11px' }}>{getPrimaryItem(order)?.sku || '—'}</span>
  }

  const renderCarrierCell = (order: TableOrder) => {
    if (isShippedOrder(order)) {
      if (order.externalShipped) {
        return <span style={{ fontSize: '10px', color: 'var(--text2)' }}>Externally Shipped</span>
      }

      const carrierCode = order.selectedRate?.carrierCode || order.label?.carrierCode || order.carrierCode
      const serviceCode = order.selectedRate?.serviceCode || order.label?.serviceCode || order.serviceCode
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1.3 }}>
          <CarrierBadge code={carrierCode} />
          <span style={{ fontSize: '10px', color: 'var(--text2)' }}>{trunc(serviceLabel(serviceCode, order.selectedRate?.serviceName), 26)}</span>
        </div>
      )
    }

    if (!(order.weight?.value && order.weight.value > 0) || !hasCompleteDims(order)) {
      return <span style={{ fontSize: '10.5px', color: 'var(--text3)' }}>— add dims</span>
    }

    if (!order.bestRate) return <span style={{ color: 'var(--text3)', fontSize: '11px' }}>—</span>

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1.3 }}>
        <CarrierBadge code={order.bestRate.carrierCode} />
        <span style={{ fontSize: '10px', color: 'var(--text2)' }}>{trunc(serviceLabel(order.bestRate.serviceCode, order.bestRate.serviceName), 26)}</span>
      </div>
    )
  }

  const renderAccountCell = (order: TableOrder) => {
    if (isShippedOrder(order)) {
      if (isExternallyFulfilledOrder(order)) {
        return (
          <span
            style={{
              display: 'inline-block',
              background: '#f0f0f0',
              color: '#666',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: 600,
            }}
            title="Label purchased outside ShipStation"
          >
            Ext. Label
          </span>
        )
      }

      if (order.externalShipped) {
        return (
          <div style={{ lineHeight: 1.4 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)' }}>Externally Shipped</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>$0.00</div>
          </div>
        )
      }

      if (order.selectedRate) {
        return (
          <div style={{ lineHeight: 1.4, whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)' }}>{order.selectedRate.providerAccountNickname || 'External'}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
              {trunc(serviceLabel(order.selectedRate.serviceCode || order.label?.serviceCode || order.serviceCode, order.selectedRate.serviceName), 22)}
            </div>
          </div>
        )
      }

      if (!order.label?.cost && !order.label?.trackingNumber && !order.label?.shippingProviderId && !order.selectedRate) {
        return (
          <span
            style={{
              display: 'inline-block',
              background: '#f0f0f0',
              color: '#666',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: 600,
            }}
            title="Label purchased outside ShipStation"
          >
            Ext. Label
          </span>
        )
      }

      let accountName = getShipAcct(order, carrierAccounts) || '—'
      if (order.label?.shippingProviderId) {
        const account = carrierAccounts.find((entry) => entry.shippingProviderId === order.label?.shippingProviderId)
        if (account) accountName = account._label || account.nickname || account.accountNumber || account.name || accountName
      } else {
        const effectiveCode = order.label?.carrierCode || order.carrierCode
        if (effectiveCode) accountName = CARRIER_NAMES[effectiveCode] || effectiveCode.replace(/_/g, ' ').toUpperCase()
      }

      return (
        <div style={{ lineHeight: 1.4, whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)' }}>{accountName}</div>
          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
            {trunc(serviceLabel(order.label?.serviceCode || order.serviceCode), 22)}
          </div>
        </div>
      )
    }

    if (!(order.weight?.value && order.weight.value > 0) || !hasCompleteDims(order)) {
      return <span style={{ fontSize: '10.5px', color: 'var(--text3)' }}>— add dims</span>
    }

    if (!order.bestRate) return <span style={{ color: 'var(--text3)', fontSize: '11px' }}>—</span>

    return (
      <div style={{ lineHeight: 1.4, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)' }}>
          {formatCarrierDisplay(order.bestRate, carrierLabel(order.bestRate.carrierCode || order.carrierCode))}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
          {trunc(serviceLabel(order.bestRate.serviceCode, order.bestRate.serviceName), 22)}
        </div>
      </div>
    )
  }

  const renderBestRateCell = (order: TableOrder) => {
    if (order.externalShipped && isShippedOrder(order)) {
      return (
        <span
          style={{
            fontSize: '10.5px',
            color: 'var(--text3)',
            background: 'var(--surface3)',
            border: '1px solid var(--border2)',
            borderRadius: '4px',
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}
        >
          Externally Shipped
        </span>
      )
    }

    const rateDisplay = buildDisplayedRate(order, markups)
    if (!rateDisplay) {
      if (order.orderStatus === 'awaiting_shipment' && (!(order.weight?.value && order.weight.value > 0) || !hasCompleteDims(order))) {
        return <span style={{ fontSize: '10.5px', color: 'var(--text3)' }}>— add dims</span>
      }
      return <span style={{ color: 'var(--text3)', fontSize: '11px' }}>—</span>
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CarrierBadge code={rateDisplay.carrierCode} />
        <div style={{ color: 'var(--green)', fontWeight: 700 }}>{formatCurrency(rateDisplay.total)}</div>
      </div>
    )
  }

  const renderOrderLocalCell = (order: TableOrder) => {
    const parts: string[] = []
    if (order.weight?.value && order.weight.value > 0) parts.push(`w:${order.weight.value}${order.weight.units?.[0] || 'o'}`)
    if (order.label?.trackingNumber) parts.push('track:✓')
    if (order.bestRate) parts.push('best:✓')
    return parts.length ? parts.join(' ') : '—'
  }

  const getCellContent = (order: TableOrder, colKey: string) => {
    const item = getPrimaryItem(order)
    const totalQty = getTotalQty(order)
    const uniqueSkus = getUniqueSkus(order)
    const isMultiSku = uniqueSkus.length > 1
    const labelCreated = formatLabelCreated(order.label?.createdAt)
    const marginDisplay = buildMarginDisplay(order, markups)

    switch (colKey) {
      case 'select':
        return null
      case 'date':
        return <span style={{ fontSize: '11.5px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>{formatDate(order.orderDate)}</span>
      case 'client':
        return <ClientBadge name={order.clientName || 'Untagged'} />
      case 'orderNum':
        return (
          <span className="order-num" onClick={(event) => { event.stopPropagation(); onOpenPanel(order.orderId) }}>
            {order.orderNumber}
          </span>
        )
      case 'customer':
        return <div className="customer-name">{order.shipTo?.name || '—'}</div>
      case 'itemname':
        return renderItemNameCell(order)
      case 'sku':
        return renderSkuCell(order)
      case 'qty':
        return totalQty > 1
          ? <span style={{ display: 'inline-block', padding: '1px 6px', border: '2px solid var(--red)', borderRadius: '4px', color: 'var(--red)', fontWeight: 700 }}>{totalQty}</span>
          : <span style={{ fontWeight: 700, color: 'var(--text2)' }}>{totalQty || '—'}</span>
      case 'weight':
        return order.weight?.value ? <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{fmtWeight(order.weight.value)}</span> : <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
      case 'shipto': {
        const parts = [order.shipTo?.city, order.shipTo?.state, order.shipTo?.postalCode].filter(Boolean)
        return <span style={{ fontSize: '11.5px', color: 'var(--text2)' }}>{parts.join(', ') || '—'}</span>
      }
      case 'carrier':
        return renderCarrierCell(order)
      case 'custcarrier':
        return renderAccountCell(order)
      case 'total':
        return <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(order.orderTotal || 0)}</span>
      case 'bestrate':
        return renderBestRateCell(order)
      case 'margin':
        return marginDisplay ? (
          <div style={{ lineHeight: 1.3, textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>+${marginDisplay.diff.toFixed(2)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{marginDisplay.pct}%</div>
          </div>
        ) : <span style={{ color: 'var(--text4)', fontSize: '11px' }}>—</span>
      case 'tracking': {
        const tracking = order.label?.trackingNumber
        return tracking
          ? <span style={{ fontFamily: 'monospace', fontSize: '10.5px', color: 'var(--ss-blue)' }}>{tracking}</span>
          : <span style={{ color: 'var(--text4)' }}>—</span>
      }
      case 'labelcreated':
        return <span style={{ fontSize: '11px', color: labelCreated ? 'var(--text2)' : 'var(--text4)', whiteSpace: 'nowrap' }}>{labelCreated || '—'}</span>
      case 'age': {
        const color = ageColor(order.orderDate)
        const textColor = color === 'red' ? 'var(--red)' : color === 'orange' ? '#d97706' : 'var(--text3)'
        const dotColor = color === 'red' ? 'var(--red)' : color === 'orange' ? '#d97706' : 'var(--green)'
        return (
          <div className="age-wrap">
            <span className="age-dot" style={{ background: dotColor }}></span>
            <span style={{ fontSize: '11px', color: textColor }}>{ageDisplay(order.orderDate)}</span>
          </div>
        )
      }
      case 'test_carrierCode':
        return <span style={{ fontSize: '14px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text2)' }}>{getDiagnosticCarrierCode(order)}</span>
      case 'test_shippingProviderID':
        return <span style={{ fontSize: '14px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text2)' }}>{String(getDiagnosticProviderId(order))}</span>
      case 'test_clientID':
        return <span style={{ fontSize: '14px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text2)' }}>{String(order.clientId ?? '—')}</span>
      case 'test_serviceCode':
        return (
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text2)' }} title={getDiagnosticServiceCode(order)}>
            {getDiagnosticServiceCode(order)}
          </span>
        )
      case 'test_bestRate':
        return order.bestRate ? (
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text2)' }} title={JSON.stringify(order.bestRate)}>
            {`${order.bestRate.carrierCode || '?'}|${order.bestRate.serviceCode || '?'}|$${(((order.bestRate.shipmentCost || 0) + (order.bestRate.otherCost || 0))).toFixed(2)}`}
          </span>
        ) : <span style={{ fontSize: '10px', color: 'var(--text3)' }}>—</span>
      case 'test_orderLocal':
        return <span style={{ fontSize: '9px', color: 'var(--text2)' }}>{renderOrderLocalCell(order)}</span>
      case 'test_shippingAccount':
        return <span style={{ fontSize: '14px', textAlign: 'center', color: 'var(--text2)' }}>{getDiagnosticAccountNickname(order)}</span>
      default:
        return '—'
    }
  }

  return (
    <div className="orders-table-wrapper">
      <table className="orders-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sortKey === column.key
              const sortClass = column.sortable ? `sortable ${isSorted ? `sort-${sortDir}` : ''}` : ''
              const label = column.key === 'bestrate' && status !== 'awaiting_shipment' ? 'Selected Rate' : column.label
              return (
                <th
                  key={column.key}
                  data-col={column.key}
                  style={{ width: `${getColumnWidth(column.key)}px`, position: 'relative' }}
                  className={sortClass}
                  onClick={() => column.sortable && onSort?.(column.key)}
                >
                  {column.key === 'select' ? (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(ref) => {
                        if (ref) (ref as HTMLInputElement).indeterminate = someSelected && !allSelected
                      }}
                      onChange={(event) => onSelectAll(event.target.checked)}
                    />
                  ) : (
                    <>
                      {label}
                      {column.sortable && isSorted && <span className="sort-arrow"></span>}
                    </>
                  )}
                  {column.key !== 'select' && (
                    <div
                      className="col-resizer"
                      onMouseDown={(event) => handleResizeStart(column.key, event)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => {
            const isKbFocus = index === focusedRowIndex
            const isPanelOpen = order.orderId === panelOrderId
            const isSelected = selectedOrders.has(order.orderId)
            const rowClass = [
              isSelected ? 'row-selected' : '',
              isPanelOpen ? 'row-panel-open' : '',
              isKbFocus ? 'row-kb-focus' : '',
              getUniqueSkus(order).length > 1 ? 'multi-sku-row' : '',
              isException(order) ? 'row-exception' : '',
            ].filter(Boolean).join(' ')
            const storeName = getStoreName(order, storeMap)
            const palette = clientPalette(storeName)

            return (
              <tr
                key={order.orderId}
                className={rowClass}
                onClick={() => onOpenPanel(order.orderId)}
                style={{ cursor: 'pointer' }}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={`${order.orderId}-${column.key}`}
                    data-col={column.key}
                    style={{
                      width: `${getColumnWidth(column.key)}px`,
                      borderLeft: columnIndex === 0 ? `3px solid ${palette.border}` : undefined,
                    }}
                    onClick={(event) => column.key === 'select' && event.stopPropagation()}
                  >
                    {column.key === 'select' ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => {
                          event.stopPropagation()
                          onSelectOrder(order.orderId, event.target.checked)
                        }}
                      />
                    ) : (
                      getCellContent(order, column.key)
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
