import { useEffect, useMemo, useState } from 'react'
import { useLocations, useOrderDetail, useOrders, useShippingAccounts } from '../../hooks'
import { useMarkups } from '../../contexts/MarkupsContext'
import { applyCarrierMarkup } from '../../utils/markups'
import type { CarrierAccountDto, LocationDto, OrderFullDto, OrderSummaryDto } from '../../types/api'
import { getOrdersDateRange, type OrdersDateFilter } from './orders-view-filters'

type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled'
type SortDirection = 'asc' | 'desc'
type SortKey = 'date' | 'age' | 'orderNum' | 'client' | 'customer' | 'itemname' | 'sku' | 'qty' | 'weight' | 'shipto' | 'carrier' | 'custcarrier' | 'total'
type TableColumnKey = 'select' | 'date' | 'client' | 'orderNum' | 'customer' | 'itemname' | 'sku' | 'qty' | 'weight' | 'shipto' | 'carrier' | 'custcarrier' | 'total' | 'bestrate' | 'margin' | 'tracking' | 'labelcreated' | 'age'
type PanelSectionKey = 'shipping' | 'items' | 'recipient'

interface OrdersViewProps {
  currentStatus: OrderStatus
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  activeStore?: number | null
  dateFilter?: OrdersDateFilter
  onDateFilterChange?: (filter: OrdersDateFilter) => void
  selectedOrderIds?: number[]
  onSelectedOrderIdsChange?: (ids: number[]) => void
  activeOrderId?: number | null
  onActiveOrderIdChange?: (id: number | null) => void
}

interface TableColumn {
  key: TableColumnKey
  label: string
  width: number
  sort: SortKey | null
}

interface OrderLineItem {
  sku: string | null
  name: string | null
  quantity: number
  imageUrl: string | null
  unitPrice: number | null
  adjustment: boolean
}

interface ClientPalette {
  bg: string
  color: string
  border: string
}

const TABLE_COLUMNS: TableColumn[] = [
  { key: 'select', label: '', width: 34, sort: null },
  { key: 'date', label: 'Order Date', width: 90, sort: 'date' },
  { key: 'client', label: 'Client', width: 100, sort: 'client' },
  { key: 'orderNum', label: 'Order #', width: 85, sort: 'orderNum' },
  { key: 'customer', label: 'Recipient', width: 175, sort: 'customer' },
  { key: 'itemname', label: 'Item Name', width: 170, sort: 'itemname' },
  { key: 'sku', label: 'SKU', width: 100, sort: 'sku' },
  { key: 'qty', label: 'Qty', width: 44, sort: 'qty' },
  { key: 'weight', label: 'Weight', width: 80, sort: 'weight' },
  { key: 'shipto', label: 'Ship To', width: 135, sort: 'shipto' },
  { key: 'carrier', label: 'Carrier', width: 145, sort: 'carrier' },
  { key: 'custcarrier', label: 'Shipping Account', width: 140, sort: 'custcarrier' },
  { key: 'total', label: 'Order Total', width: 85, sort: 'total' },
  { key: 'bestrate', label: 'Best Rate', width: 105, sort: null },
  { key: 'margin', label: 'Ship Margin', width: 90, sort: null },
  { key: 'tracking', label: 'Tracking #', width: 160, sort: null },
  { key: 'labelcreated', label: 'Label Created', width: 115, sort: null },
  { key: 'age', label: 'Age', width: 50, sort: 'age' },
]

const CLIENT_PALETTES: ClientPalette[] = [
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

const CARRIER_NAMES: Record<string, string> = {
  stamps_com: 'USPS',
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
  fedex_ground: 'FedEx Ground',
  fedex_home_delivery: 'FedEx Home Delivery',
  fedex_2day: 'FedEx 2Day',
  fedex_2_day: 'FedEx 2Day',
  fedex_2day_am: 'FedEx 2Day AM',
  fedex_express_saver: 'FedEx Express Saver',
  fedex_priority_overnight: 'FedEx Priority Overnight',
  fedex_standard_overnight: 'FedEx Standard Overnight',
  fedex_first_overnight: 'FedEx First Overnight',
}

const clientPaletteCache = new Map<string, ClientPalette>()

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value : null
}

function toNumberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const date = parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
  const time = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} ${time}`
}

function formatLabelCreated(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const month = parsed.toLocaleDateString('en-US', { month: 'short' })
  const day = parsed.getDate()
  const time = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
  return `${month} ${day}, ${time}`
}

function formatDateOnly(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-US', options)
}

function formatMoney(amount: number | null | undefined) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '—'
  return `$${amount.toFixed(2)}`
}

function formatWeight(ounces: number | null | undefined) {
  if (!ounces) return '—'
  const pounds = Math.floor(ounces / 16)
  const remaining = Math.round((ounces % 16) * 10) / 10
  if (pounds === 0) return `${remaining} oz`
  if (remaining === 0) return `${pounds} lb`
  return `${pounds} lb ${remaining} oz`
}

function ageHours(value: string | null | undefined) {
  if (!value) return 0
  return (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60)
}

function ageLabel(value: string | null | undefined) {
  const hours = ageHours(value)
  if (hours < 1) return `${Math.floor(hours * 60)}m`
  if (hours < 24) return `${Math.floor(hours)}h`
  return `${Math.floor(hours / 24)}d`
}

function getAgeColor(value: string | null | undefined) {
  const hours = ageHours(value)
  if (hours > 48) return 'var(--red)'
  if (hours > 24) return '#d97706'
  return 'var(--green)'
}

function getClientPalette(name: string) {
  const cached = clientPaletteCache.get(name)
  if (cached) return cached

  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) & 0xffff
  }
  const palette = CLIENT_PALETTES[hash % CLIENT_PALETTES.length]
  clientPaletteCache.set(name, palette)
  return palette
}

function formatServiceCode(value: string | null | undefined) {
  if (!value) return '—'
  return SERVICE_NAMES[value] ?? value.replace(/_/g, ' ')
}

function formatCarrierCode(value: string | null | undefined) {
  if (!value) return '—'
  return CARRIER_NAMES[value] ?? value.replace(/^custom_?/i, '').replace(/_/g, ' ').toUpperCase()
}

function getCarrierClass(carrierCode: string | null | undefined) {
  if (!carrierCode) return 'carrier-other'
  if (carrierCode.includes('ups')) return 'carrier-ups'
  if (carrierCode.includes('fedex')) return 'carrier-fedex'
  if (carrierCode.includes('stamps') || carrierCode.includes('usps')) return 'carrier-usps'
  return 'carrier-other'
}

function normalizeItems(source: unknown): OrderLineItem[] {
  if (!Array.isArray(source)) return []

  return source
    .map((item) => toRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map((item) => ({
      sku: toStringValue(item.sku),
      name: toStringValue(item.name),
      quantity: toNumberValue(item.quantity) ?? 1,
      imageUrl: toStringValue(item.imageUrl),
      unitPrice: toNumberValue(item.unitPrice) ?? toNumberValue(item.price),
      adjustment: Boolean(item.adjustment),
    }))
}

function getActiveItems(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const detailItems = normalizeItems(rawOrder?.items)
  const sourceItems = detailItems.length > 0 ? detailItems : normalizeItems(order.items)
  return sourceItems.filter((item) => !item.adjustment)
}

function getPrimaryItem(order: OrderSummaryDto, detail: OrderFullDto | null) {
  return getActiveItems(order, detail)[0] ?? null
}

function getMergedItems(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const grouped = new Map<string, OrderLineItem>()
  for (const item of getActiveItems(order, detail)) {
    const key = `${item.sku ?? ''}|${item.name ?? ''}`
    const existing = grouped.get(key)
    if (existing) {
      existing.quantity += item.quantity
      continue
    }
    grouped.set(key, { ...item })
  }
  return [...grouped.values()]
}

function getTotalQuantity(order: OrderSummaryDto, detail: OrderFullDto | null) {
  return getActiveItems(order, detail).reduce((sum, item) => sum + (item.quantity || 1), 0)
}

function getPrimarySku(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const primary = getPrimaryItem(order, detail)
  return (primary?.sku ?? primary?.name ?? '').toLowerCase().trim()
}

function buildSearchText(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const shipTo = getShipTo(order, detail)
  return [
    order.orderNumber,
    order.clientName,
    order.customerEmail,
    shipTo.name,
    shipTo.company,
    shipTo.street1,
    shipTo.street2,
    shipTo.city,
    shipTo.state,
    shipTo.postalCode,
    order.label?.trackingNumber,
    ...getActiveItems(order, detail).flatMap((item) => [item.sku, item.name]),
    toStringValue(rawOrder?.customerUsername),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()
}

function getShipTo(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const rawShipTo = toRecord(rawOrder?.shipTo)

  return {
    name: toStringValue(rawShipTo?.name) ?? order.shipTo?.name ?? null,
    company: toStringValue(rawShipTo?.company) ?? null,
    street1: toStringValue(rawShipTo?.street1) ?? null,
    street2: toStringValue(rawShipTo?.street2) ?? null,
    city: toStringValue(rawShipTo?.city) ?? order.shipTo?.city ?? null,
    state: toStringValue(rawShipTo?.state) ?? order.shipTo?.state ?? null,
    postalCode: toStringValue(rawShipTo?.postalCode) ?? order.shipTo?.postalCode ?? null,
    country: toStringValue(rawShipTo?.country) ?? 'US',
    phone: toStringValue(rawShipTo?.phone) ?? null,
    addressVerified: toStringValue(rawShipTo?.addressVerified) ?? null,
  }
}

function getShipToLine(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const shipTo = getShipTo(order, detail)
  const line = [shipTo.city, shipTo.state, shipTo.postalCode].filter(Boolean).join(', ')
  return line || '—'
}

function getAddressBlock(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const shipTo = getShipTo(order, detail)
  return [
    shipTo.name,
    shipTo.company,
    shipTo.street1,
    shipTo.street2,
    [shipTo.city, shipTo.state, shipTo.postalCode].filter(Boolean).join(', '),
    shipTo.country && shipTo.country !== 'US' ? shipTo.country : null,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
}

function getDimensions(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const rawDims = toRecord(rawOrder?.dimensions)

  const length = toNumberValue(rawDims?.length) ?? order.rateDims?.length ?? 0
  const width = toNumberValue(rawDims?.width) ?? order.rateDims?.width ?? 0
  const height = toNumberValue(rawDims?.height) ?? order.rateDims?.height ?? 0

  if (!length || !width || !height) return null

  return {
    length,
    width,
    height,
    units: toStringValue(rawDims?.units) ?? 'inches',
  }
}

function getRequestedService(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const requested = toStringValue(rawOrder?.requestedShippingService) ?? toStringValue(rawOrder?.serviceCode)
  return requested ?? getBestRateServiceCode(order) ?? order.selectedRate?.serviceCode ?? order.label?.serviceCode ?? order.serviceCode
}

function getConfirmation(detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const advancedOptions = toRecord(rawOrder?.advancedOptions)
  const confirmation = toStringValue(advancedOptions?.deliveryConfirmation)
  if (!confirmation || confirmation === 'none') return 'delivery'
  return confirmation
}

function getInsurance(detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const insurance = toRecord(rawOrder?.insuranceOptions)

  return {
    type: toStringValue(insurance?.provider) ?? 'none',
    value: toNumberValue(insurance?.insuredValue),
  }
}

function getWarehouseId(detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  const advancedOptions = toRecord(rawOrder?.advancedOptions)
  return toNumberValue(advancedOptions?.warehouseId)
}

function getSelectedPackage(detail: OrderFullDto | null) {
  const rawOrder = toRecord(detail?.raw)
  return toStringValue(rawOrder?.packageCode)
}

function getShipAccountDisplay(order: OrderSummaryDto, accounts: CarrierAccountDto[]) {
  if (order.selectedRate?.providerAccountNickname) return order.selectedRate.providerAccountNickname
  if (order.label?.shippingProviderId != null) {
    const account = accounts.find((candidate) => candidate.shippingProviderId === order.label.shippingProviderId)
    if (account) return account._label || account.nickname || account.code
  }
  if (order.bestRate) {
    const nickname = toStringValue(order.bestRate.carrierNickname)
    if (nickname) return nickname
  }
  return formatCarrierCode(order.label?.carrierCode ?? order.selectedRate?.carrierCode ?? order.bestRate?.carrierCode ?? order.carrierCode)
}

function getBestRateBaseCost(order: OrderSummaryDto) {
  const shipmentCost = typeof order.bestRate?.shipmentCost === 'number' ? order.bestRate.shipmentCost : 0
  const otherCost = typeof order.bestRate?.otherCost === 'number' ? order.bestRate.otherCost : 0
  const amount = typeof order.bestRate?.amount === 'number' ? order.bestRate.amount : 0
  const total = shipmentCost + otherCost
  return total > 0 ? total : amount || null
}

function getBestRateShippingProviderId(order: OrderSummaryDto) {
  return order.bestRate ? toNumberValue(order.bestRate.shippingProviderId) ?? undefined : undefined
}

function getBestRateServiceCode(order: OrderSummaryDto) {
  return order.bestRate ? toStringValue(order.bestRate.serviceCode) : null
}

function getBestRateCarrierNickname(order: OrderSummaryDto) {
  return order.bestRate ? toStringValue(order.bestRate.carrierNickname) : null
}

function getSelectedRateBaseCost(order: OrderSummaryDto) {
  const shipmentCost = typeof order.selectedRate?.shipmentCost === 'number' ? order.selectedRate.shipmentCost : 0
  const otherCost = typeof order.selectedRate?.otherCost === 'number' ? order.selectedRate.otherCost : 0
  const cost = typeof order.selectedRate?.cost === 'number' ? order.selectedRate.cost : 0
  const total = shipmentCost + otherCost
  return total > 0 ? total : cost || null
}

function getMarkupAmount(baseAmount: number, markedAmount: number) {
  return markedAmount - baseAmount
}

function getIsExternallyFulfilled(order: OrderSummaryDto) {
  if (order.externalShipped) return true
  if (order.orderStatus === 'awaiting_shipment') return false
  return !order.label?.cost && !order.label?.trackingNumber && order.selectedRate == null
}

function getIsException(order: OrderSummaryDto) {
  if (order.orderStatus !== 'awaiting_shipment') return false
  return ageHours(order.orderDate) > 48 || !(order.weight?.value && order.weight.value > 0)
}

function getExpeditedBadge(order: OrderSummaryDto, detail: OrderFullDto | null) {
  const code = getRequestedService(order, detail)
  if (!code) return null
  if (/1[\s-]?day/i.test(code)) return { label: '🔴 1-day', color: '#dc2626' }
  if (/2[\s-]?day/i.test(code)) return { label: '🟠 2-day', color: '#d97706' }
  return null
}

function copyText(value: string) {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return
  void navigator.clipboard.writeText(value)
}

function getVisibleColumns(currentStatus: OrderStatus) {
  const hidden = new Set<TableColumnKey>()
  if (currentStatus === 'awaiting_shipment') hidden.add('tracking')
  else hidden.add('age')

  return TABLE_COLUMNS.filter((column) => !hidden.has(column.key)).map((column) => (
    column.key === 'bestrate' && currentStatus !== 'awaiting_shipment'
      ? { ...column, label: 'Selected Rate' }
      : column
  ))
}

function getSortValue(order: OrderSummaryDto, detail: OrderFullDto | null, key: SortKey, accounts: CarrierAccountDto[]) {
  switch (key) {
    case 'date':
    case 'age':
      return order.orderDate ?? ''
    case 'orderNum':
      return order.orderNumber ?? ''
    case 'client':
      return (order.clientName ?? '').toLowerCase()
    case 'customer':
      return (getShipTo(order, detail).name ?? '').toLowerCase()
    case 'itemname':
      return (getPrimaryItem(order, detail)?.name ?? '').toLowerCase()
    case 'sku':
      return (getPrimaryItem(order, detail)?.sku ?? '').toLowerCase()
    case 'qty':
      return getTotalQuantity(order, detail)
    case 'weight':
      return order.weight?.value ?? 0
    case 'shipto': {
      const shipTo = getShipTo(order, detail)
      return `${shipTo.state ?? ''}${shipTo.city ?? ''}`.toLowerCase()
    }
    case 'carrier':
      return `${order.label?.carrierCode ?? order.selectedRate?.carrierCode ?? order.bestRate?.carrierCode ?? order.carrierCode ?? ''}${order.label?.serviceCode ?? order.selectedRate?.serviceCode ?? getBestRateServiceCode(order) ?? order.serviceCode ?? ''}`.toLowerCase()
    case 'custcarrier':
      return String(getShipAccountDisplay(order, accounts)).toLowerCase()
    case 'total':
      return order.orderTotal ?? 0
  }
}

function buildEmptyPanel() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--text3)',
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.5 }}>📋</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>No order selected</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 20 }}>Click any row to view details</div>
      <div
        style={{
          textAlign: 'left',
          fontSize: 11,
          lineHeight: 2,
          color: 'var(--text4)',
          borderTop: '1px solid var(--border)',
          paddingTop: 14,
          width: '100%',
          maxWidth: 180,
        }}
      >
        <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontSize: 10, border: '1px solid var(--border2)' }}>↑↓</kbd> Navigate rows</div>
        <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontSize: 10, border: '1px solid var(--border2)' }}>Enter</kbd> Select / deselect</div>
        <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontSize: 10, border: '1px solid var(--border2)' }}>Esc</kbd> Deselect &amp; close</div>
        <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontSize: 10, border: '1px solid var(--border2)' }}>⌘C</kbd> Copy order #</div>
      </div>
    </div>
  )
}

export default function OrdersView({
  currentStatus,
  searchQuery = '',
  onSearchQueryChange,
  activeStore,
  dateFilter = '',
  onDateFilterChange,
  selectedOrderIds = [],
  onSelectedOrderIdsChange,
  activeOrderId = null,
  onActiveOrderIdChange,
}: OrdersViewProps) {
  const [page, setPage] = useState(1)
  const [skuFilter, setSkuFilter] = useState('')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [sortState, setSortState] = useState<{ key: SortKey; dir: SortDirection }>({ key: 'date', dir: 'desc' })
  const [skuSortActive, setSkuSortActive] = useState(false)
  const [preSkuSortSnapshot, setPreSkuSortSnapshot] = useState<number[] | null>(null)
  const [kbRowId, setKbRowId] = useState<number | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<PanelSectionKey, boolean>>({
    shipping: false,
    items: false,
    recipient: false,
  })

  const dateRange = dateFilter === 'custom'
    ? {
        start: customDateFrom || undefined,
        end: customDateTo || undefined,
      }
    : (() => {
        const range = getOrdersDateRange(dateFilter)
        if (!range) return { start: undefined, end: undefined }

        return {
          start: range.start.toISOString().split('T')[0],
          end: range.end.toISOString().split('T')[0],
        }
      })()

  const { orders, total, pages, currentPage, loading, error } = useOrders(currentStatus, {
    page,
    pageSize: 50,
    storeId: activeStore ?? undefined,
    dateStart: dateRange.start,
    dateEnd: dateRange.end,
  })

  const { order: activeOrderDetail, isLoading: activeOrderLoading, error: activeOrderError } = useOrderDetail(
    activeOrderId != null ? String(activeOrderId) : '',
  )
  const { locations } = useLocations()
  const { accounts: shippingAccounts } = useShippingAccounts()
  const { markups } = useMarkups()

  const orderDetailsById = useMemo(() => (
    activeOrderId != null && activeOrderDetail != null
      ? new Map<number, OrderFullDto>([[activeOrderId, activeOrderDetail]])
      : new Map<number, OrderFullDto>()
  ), [activeOrderId, activeOrderDetail])

  const selectedIdSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds])
  const visibleColumns = useMemo(() => getVisibleColumns(currentStatus), [currentStatus])

  const skuOptions = useMemo(() => {
    const skus = new Set<string>()
    for (const order of orders) {
      for (const item of normalizeItems(order.items)) {
        if (item.adjustment || !item.sku) continue
        skus.add(item.sku)
      }
    }
    return [...skus].sort((left, right) => left.localeCompare(right))
  }, [orders])

  const searchedOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return orders.filter((order) => {
      const detail = orderDetailsById.get(order.orderId) ?? null
      if (query && !buildSearchText(order, detail).includes(query)) return false
      if (skuFilter) {
        const items = getActiveItems(order, detail)
        if (!items.some((item) => item.sku === skuFilter)) return false
      }
      return true
    })
  }, [orders, orderDetailsById, searchQuery, skuFilter])

  const orderedFilteredOrders = useMemo(() => {
    const next = [...searchedOrders]

    if (skuSortActive) {
      next.sort((left, right) => {
        const leftSku = getPrimarySku(left, orderDetailsById.get(left.orderId) ?? null)
        const rightSku = getPrimarySku(right, orderDetailsById.get(right.orderId) ?? null)
        if (leftSku < rightSku) return -1
        if (leftSku > rightSku) return 1
        return getTotalQuantity(left, orderDetailsById.get(left.orderId) ?? null) - getTotalQuantity(right, orderDetailsById.get(right.orderId) ?? null)
      })
      return next
    }

    if (preSkuSortSnapshot) {
      const rank = new Map(preSkuSortSnapshot.map((orderId, index) => [orderId, index]))
      next.sort((left, right) => (rank.get(left.orderId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.orderId) ?? Number.MAX_SAFE_INTEGER))
      return next
    }

    next.sort((left, right) => {
      const leftValue = getSortValue(left, orderDetailsById.get(left.orderId) ?? null, sortState.key, shippingAccounts)
      const rightValue = getSortValue(right, orderDetailsById.get(right.orderId) ?? null, sortState.key, shippingAccounts)
      const direction = sortState.dir === 'asc' ? 1 : -1
      if (leftValue < rightValue) return -direction
      if (leftValue > rightValue) return direction
      return 0
    })

    return next
  }, [searchedOrders, skuSortActive, preSkuSortSnapshot, sortState, orderDetailsById, shippingAccounts])

  const panelOrderId = activeOrderId ?? (selectedOrderIds.length === 1 ? selectedOrderIds[0] : null)
  const panelOrder = orderedFilteredOrders.find((order) => order.orderId === panelOrderId)
    ?? orders.find((order) => order.orderId === panelOrderId)
    ?? null
  const panelDetail = panelOrderId != null ? orderDetailsById.get(panelOrderId) ?? null : null

  useEffect(() => {
    setPage(1)
  }, [currentStatus, activeStore, dateFilter, customDateFrom, customDateTo])

  useEffect(() => {
    setPreSkuSortSnapshot(null)
    setSkuSortActive(false)
  }, [currentStatus, activeStore, dateFilter, customDateFrom, customDateTo, skuFilter, searchQuery])

  useEffect(() => {
    const visibleIds = new Set(orders.map((order) => order.orderId))
    const nextSelected = selectedOrderIds.filter((id) => visibleIds.has(id))
    if (nextSelected.length !== selectedOrderIds.length) {
      onSelectedOrderIdsChange?.(nextSelected)
    }
    if (activeOrderId != null && !visibleIds.has(activeOrderId)) {
      onActiveOrderIdChange?.(null)
    }
  }, [orders, selectedOrderIds, activeOrderId, onSelectedOrderIdsChange, onActiveOrderIdChange])

  const updateSelection = (ids: number[]) => {
    const nextIds = [...new Set(ids)]
    onSelectedOrderIdsChange?.(nextIds)
    onActiveOrderIdChange?.(nextIds.length === 1 ? nextIds[0] : null)
  }

  const toggleOrderSelection = (orderId: number, checked?: boolean) => {
    const isChecked = selectedIdSet.has(orderId)
    const shouldSelect = checked ?? !isChecked
    if (shouldSelect) {
      updateSelection([...selectedOrderIds, orderId])
      return
    }

    updateSelection(selectedOrderIds.filter((id) => id !== orderId))
  }

  const selectAll = () => {
    updateSelection(orderedFilteredOrders.map((order) => order.orderId))
  }

  const clearSelection = () => {
    onSelectedOrderIdsChange?.([])
    onActiveOrderIdChange?.(null)
  }

  const toggleSort = (key: SortKey) => {
    setPreSkuSortSnapshot(null)
    setSkuSortActive(false)
    setSortState((current) => {
      if (current.key === key) {
        return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      }

      return {
        key,
        dir: key === 'date' || key === 'age' ? 'desc' : 'asc',
      }
    })
  }

  const toggleSkuSort = () => {
    if (!skuSortActive) {
      setPreSkuSortSnapshot(orderedFilteredOrders.map((order) => order.orderId))
      setSkuSortActive(true)
      return
    }

    setSkuSortActive(false)
  }

  const toggleSection = (key: PanelSectionKey) => {
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }))
  }

  const openShipStationOrder = (orderId: number) => {
    window.open(`https://ship.shipstation.com/orders/${orderId}`, '_blank', 'noopener,noreferrer')
  }

  const renderBestRatePrice = (order: OrderSummaryDto) => {
    const bestRateBaseCost = getBestRateBaseCost(order)
    if (order.orderStatus !== 'awaiting_shipment') {
      const selectedRateBase = getSelectedRateBaseCost(order)
      const markedAmount = order.label?.cost ?? order.selectedRate?.cost ?? selectedRateBase
      if (selectedRateBase == null && markedAmount == null) {
        return <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
      }

      return (
        <div style={{ lineHeight: 1.3 }}>
          <strong style={{ color: 'var(--green)', fontSize: 12 }}>{formatMoney(markedAmount ?? selectedRateBase)}</strong>
          {selectedRateBase != null && markedAmount != null && Math.abs(markedAmount - selectedRateBase) > 0.005 ? (
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatMoney(selectedRateBase)} cost</div>
          ) : null}
        </div>
      )
    }

    const hasDims = getDimensions(order, null) != null
    if (!(order.weight?.value && order.weight.value > 0) || !hasDims) {
      return <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>— add dims</span>
    }
    if (!order.bestRate) {
      return <div className="spin-center"><span className="spin-sm" /></div>
    }

    const markedAmount = applyCarrierMarkup({
      shippingProviderId: getBestRateShippingProviderId(order),
      carrierCode: order.bestRate.carrierCode ?? '',
      serviceCode: getBestRateServiceCode(order) ?? '',
      serviceName: order.bestRate.serviceName ?? '',
      amount: typeof order.bestRate.amount === 'number' ? order.bestRate.amount : 0,
      shipmentCost: typeof order.bestRate.shipmentCost === 'number' ? order.bestRate.shipmentCost : undefined,
      otherCost: typeof order.bestRate.otherCost === 'number' ? order.bestRate.otherCost : undefined,
      carrierNickname: getBestRateCarrierNickname(order),
    }, markups)

    return (
      <div style={{ lineHeight: 1.3 }}>
        <strong style={{ color: 'var(--green)', fontSize: 12 }}>{formatMoney(markedAmount)}</strong>
        {bestRateBaseCost != null && Math.abs(markedAmount - bestRateBaseCost) > 0.005 ? (
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatMoney(bestRateBaseCost)} cost</div>
        ) : null}
      </div>
    )
  }

  const renderMargin = (order: OrderSummaryDto) => {
    if (order.orderStatus !== 'awaiting_shipment') {
      const baseAmount = getSelectedRateBaseCost(order)
      const markedAmount = order.label?.cost ?? order.selectedRate?.cost ?? null
      if (baseAmount == null || markedAmount == null) {
        return <span style={{ color: 'var(--text4)', fontSize: 11 }}>—</span>
      }
      const diff = getMarkupAmount(baseAmount, markedAmount)
      if (diff <= 0.005) return <span style={{ color: 'var(--text4)', fontSize: 11 }}>—</span>
      return <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>+{formatMoney(diff)}</span>
    }

    const bestRateBaseCost = getBestRateBaseCost(order)
    if (!order.bestRate || bestRateBaseCost == null) {
      return order.weight?.value && getDimensions(order, null) ? (
        <div className="spin-center"><span className="spin-sm" /></div>
      ) : (
        <span style={{ color: 'var(--text4)', fontSize: 11 }}>—</span>
      )
    }

    const markedAmount = applyCarrierMarkup({
      shippingProviderId: getBestRateShippingProviderId(order),
      carrierCode: order.bestRate.carrierCode ?? '',
      serviceCode: getBestRateServiceCode(order) ?? '',
      serviceName: order.bestRate.serviceName ?? '',
      amount: typeof order.bestRate.amount === 'number' ? order.bestRate.amount : 0,
      shipmentCost: typeof order.bestRate.shipmentCost === 'number' ? order.bestRate.shipmentCost : undefined,
      otherCost: typeof order.bestRate.otherCost === 'number' ? order.bestRate.otherCost : undefined,
      carrierNickname: getBestRateCarrierNickname(order),
    }, markups)
    const diff = getMarkupAmount(bestRateBaseCost, markedAmount)
    if (diff <= 0.005) return <span style={{ color: 'var(--text4)', fontSize: 11 }}>—</span>

    const percent = bestRateBaseCost > 0 ? Math.round((diff / bestRateBaseCost) * 100) : 0

    return (
      <div style={{ lineHeight: 1.3, textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>+{formatMoney(diff)}</div>
        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{percent}%</div>
      </div>
    )
  }

  const renderCarrierCell = (order: OrderSummaryDto) => {
    const shipped = order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
    if (shipped) {
      if (order.externalShipped) {
        return <span style={{ fontSize: 10, color: 'var(--text2)' }}>Externally Shipped</span>
      }

      const carrierCode = order.label?.carrierCode ?? order.selectedRate?.carrierCode ?? order.carrierCode
      const serviceCode = order.label?.serviceCode ?? order.selectedRate?.serviceCode ?? order.serviceCode
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3 }}>
          <span className={`carrier-badge ${getCarrierClass(carrierCode)}`}>{formatCarrierCode(carrierCode)}</span>
          <span style={{ fontSize: 10, color: 'var(--text2)' }}>{truncate(formatServiceCode(serviceCode), 26)}</span>
        </div>
      )
    }

    const hasDims = getDimensions(order, null) != null
    if (!(order.weight?.value && order.weight.value > 0) || !hasDims) {
      return <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>— add dims</span>
    }
    if (!order.bestRate) {
      return <div className="spin-center"><span className="spin-sm" /></div>
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3 }}>
        <span className={`carrier-badge ${getCarrierClass(order.bestRate.carrierCode)}`}>{formatCarrierCode(order.bestRate.carrierCode)}</span>
        <span style={{ fontSize: 10, color: 'var(--text2)' }}>{truncate(formatServiceCode(getBestRateServiceCode(order)), 26)}</span>
      </div>
    )
  }

  const renderShippingAccountCell = (order: OrderSummaryDto) => {
    const shipped = order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
    if (shipped) {
      if (getIsExternallyFulfilled(order)) {
        return (
          <span
            style={{
              display: 'inline-block',
              background: '#f0f0f0',
              color: '#666',
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Label purchased outside ShipStation (eBay/Walmart/Amazon/etc.)"
          >
            Ext. Label
          </span>
        )
      }

      return (
        <div style={{ lineHeight: 1.4, whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{getShipAccountDisplay(order, shippingAccounts)}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }} className="svc-label">
            {truncate(formatServiceCode(order.label?.serviceCode ?? order.selectedRate?.serviceCode ?? order.serviceCode), 22)}
          </div>
        </div>
      )
    }

    const hasDims = getDimensions(order, null) != null
    if (!(order.weight?.value && order.weight.value > 0) || !hasDims) {
      return <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>— add dims</span>
    }
    if (!order.bestRate) {
      return <div className="spin-center"><span className="spin-sm" /></div>
    }

    return (
        <div style={{ lineHeight: 1.4, whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{getShipAccountDisplay(order, shippingAccounts)}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }} className="svc-label">
            {truncate(formatServiceCode(getBestRateServiceCode(order)), 22)}
          </div>
        </div>
      )
  }

  const renderOrderCell = (order: OrderSummaryDto) => (
    <div className="order-num" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, minWidth: 0 }}>
      <span
        className="od-order-link"
        title="Open detail view"
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        onClick={(event) => {
          event.stopPropagation()
          toggleOrderSelection(order.orderId, true)
        }}
      >
        {order.orderNumber ?? `#${order.orderId}`}
      </span>
      <span
        title="Copy"
        style={{ cursor: 'pointer', color: 'var(--text4)', fontSize: 9, opacity: 0.6, transition: 'opacity .1s', flexShrink: 0 }}
        onClick={(event) => {
          event.stopPropagation()
          copyText(order.orderNumber ?? String(order.orderId))
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.opacity = '0.6'
        }}
      >
        ⎘
      </span>
    </div>
  )

  const renderTableCell = (order: OrderSummaryDto, column: TableColumn) => {
    const detail = orderDetailsById.get(order.orderId) ?? null
    const items = getActiveItems(order, detail)
    const mergedItems = getMergedItems(order, detail)
    const primaryItem = items[0] ?? null
    const multiSku = new Set(items.map((item) => item.sku).filter(Boolean)).size > 1
    const expedited = getExpeditedBadge(order, detail)
    const shipTo = getShipTo(order, detail)
    const clientName = order.clientName ?? 'Untagged'
    const clientPalette = getClientPalette(clientName)

    switch (column.key) {
      case 'select':
        return (
          <input
            type="checkbox"
            checked={selectedIdSet.has(order.orderId)}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation()
              toggleOrderSelection(order.orderId, event.target.checked)
            }}
            aria-label={`Select ${order.orderNumber ?? order.orderId}`}
          />
        )
      case 'date':
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {expedited ? <div style={{ fontSize: 9.5, fontWeight: 700, color: expedited.color, marginBottom: 2 }}>{expedited.label}</div> : null}
            <div style={{ fontSize: 11.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{formatDateTime(order.orderDate)}</div>
          </div>
        )
      case 'client':
        return (
          <span
            className="client-badge"
            style={{ background: clientPalette.bg, color: clientPalette.color, borderColor: clientPalette.border }}
          >
            {truncate(clientName, 14)}
          </span>
        )
      case 'orderNum':
        return renderOrderCell(order)
      case 'customer':
        return <div className="customer-name">{shipTo.name ?? '—'}</div>
      case 'itemname':
        if (multiSku) {
          const visibleItems = mergedItems.slice(0, 5)
          const overflow = mergedItems.length - visibleItems.length
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 0', maxWidth: column.width + 90, overflow: 'hidden' }}>
              {visibleItems.map((item) => (
                <div key={`${item.sku ?? 'unknown'}-${item.name ?? 'item'}`} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 22, height: 22, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, display: 'inline-block' }} />
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, minWidth: 0 }}>
                      {item.name ?? item.sku ?? '—'}
                    </span>
                    {item.quantity > 1 ? (
                      <span style={{ background: 'var(--ss-blue-bg)', color: 'var(--ss-blue)', fontSize: 9.5, fontWeight: 700, padding: '0 4px', borderRadius: 3, flexShrink: 0 }}>
                        ×{item.quantity}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
              {overflow > 0 ? <div style={{ fontSize: 10.5, color: 'var(--text3)', paddingLeft: 27 }}>+{overflow} more</div> : null}
            </div>
          )
        }
        return (
          <div className="cell-itemname" title={primaryItem?.name ?? '—'} style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: column.width + 90 }}>
            {primaryItem?.imageUrl ? (
              <img src={primaryItem.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
            ) : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {primaryItem?.name ?? '—'}
              {items.length > 1 && !multiSku ? <span style={{ color: 'var(--text3)', fontSize: 10.5 }}> ×{getTotalQuantity(order, detail)}</span> : null}
            </span>
          </div>
        )
      case 'sku':
        if (multiSku) {
          const visibleItems = mergedItems.slice(0, 5)
          const overflow = mergedItems.length - visibleItems.length
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 0' }}>
              {visibleItems.map((item) => (
                <div key={`${item.sku ?? 'unknown'}-${item.name ?? 'item'}`} style={{ display: 'flex', alignItems: 'center', height: 22, gap: 3, minWidth: 0 }}>
                  {item.sku ? <span className="sku-link" style={{ fontSize: 11 }}>{item.sku}</span> : <span style={{ color: 'var(--text4)', fontSize: 11 }}>—</span>}
                </div>
              ))}
              {overflow > 0 ? <div style={{ height: 14 }} /> : null}
            </div>
          )
        }
        return primaryItem?.sku ? <span className="sku-link">{primaryItem.sku}</span> : '—'
      case 'qty': {
        const totalQuantity = getTotalQuantity(order, detail)
        return (
          <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text2)' }}>
            {totalQuantity > 1 ? (
              <span style={{ display: 'inline-block', padding: '1px 6px', border: '2px solid var(--red)', borderRadius: 4, color: 'var(--red)' }}>{totalQuantity}</span>
            ) : (
              totalQuantity || '—'
            )}
          </div>
        )
      }
      case 'weight':
        return order.weight?.value ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>{formatWeight(order.weight.value)}</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
      case 'shipto':
        return <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{getShipToLine(order, detail)}</span>
      case 'carrier':
        return renderCarrierCell(order)
      case 'custcarrier':
        return renderShippingAccountCell(order)
      case 'total':
        return <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatMoney(order.orderTotal ?? 0)}</span>
      case 'bestrate':
        return renderBestRatePrice(order)
      case 'margin':
        return renderMargin(order)
      case 'tracking':
        if (!order.label?.trackingNumber) {
          return <span style={{ color: 'var(--text4)', fontFamily: 'monospace', fontSize: 11 }}>—</span>
        }
        return (
          <span
            style={{ color: 'var(--ss-blue)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}
            onClick={(event) => {
              event.stopPropagation()
              copyText(order.label?.trackingNumber ?? '')
            }}
            title="Click to copy"
          >
            {order.label?.trackingNumber}
          </span>
        )
      case 'labelcreated':
        return <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{formatLabelCreated(order.label?.createdAt ?? null)}</span>
      case 'age': {
        const ageColor = getAgeColor(order.orderDate)
        return (
          <div className="age-wrap">
            <span className="age-dot" style={{ background: ageColor }} />
            <span style={{ fontSize: 11, color: ageColor === 'var(--green)' ? 'var(--text3)' : ageColor }}>{ageLabel(order.orderDate)}</span>
          </div>
        )
      }
    }
  }

  const renderBatchPanel = () => {
    const selectedOrders = orders.filter((order) => selectedIdSet.has(order.orderId))
    const firstOrder = selectedOrders[0] ?? null
    const firstDims = firstOrder ? getDimensions(firstOrder, null) : null
    const firstWeight = firstOrder?.weight?.value ?? 0
    const firstWeightLb = Math.floor(firstWeight / 16)
    const firstWeightOz = Math.round(firstWeight % 16)

    return (
      <>
        <div className="panel-topbar">
          <button className="panel-topbar-btn" type="button" onClick={clearSelection}>Clear Selection</button>
          <div className="panel-ordnum">📦 {selectedOrderIds.length} order{selectedOrderIds.length === 1 ? '' : 's'} selected</div>
          <button className="panel-close" type="button" onClick={clearSelection}>✕</button>
        </div>

        <div className="panel-body">
          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Batch Actions</span>
            </div>
            <div className="panel-section-body">
              <div style={{ padding: 12, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Selected orders:</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text2)', lineHeight: 1.4, wordBreak: 'break-all' }}>
                  {selectedOrders.map((order) => order.orderNumber ?? `#${order.orderId}`).sort().join(', ')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="create-label-btn" type="button" style={{ flex: 1 }} disabled title="TODO: wire batch label actions in the React parity port">
                  🖨️ Create + Print Label
                </button>
                <button
                  className="create-label-btn"
                  type="button"
                  style={{ flex: 1, background: '#16a34a' }}
                  disabled
                  title="TODO: wire print-queue actions in the React parity port"
                >
                  📥 Send to Queue
                </button>
              </div>

              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Shipping Parameters (from 1st order):</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10, marginBottom: 2 }}>Weight</div>
                    <div style={{ color: 'var(--text2)', fontWeight: 600 }}>{firstOrder ? `${firstWeightLb} lb ${firstWeightOz} oz` : '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10, marginBottom: 2 }}>Dimensions</div>
                    <div style={{ color: 'var(--text2)', fontWeight: 600 }}>
                      {firstDims ? `${firstDims.length} × ${firstDims.width} × ${firstDims.height} in` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--text4)', lineHeight: 1.5 }}>
                TODO: batch shipping controls still need to be wired to the React label/create flows.
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const renderSinglePanel = () => {
    if (!panelOrder) return buildEmptyPanel()

    const items = getActiveItems(panelOrder, panelDetail)
    const mergedItems = getMergedItems(panelOrder, panelDetail)
    const shipTo = getShipTo(panelOrder, panelDetail)
    const dims = getDimensions(panelOrder, panelDetail)
    const requestedService = getRequestedService(panelOrder, panelDetail)
    const confirmation = getConfirmation(panelDetail)
    const insurance = getInsurance(panelDetail)
    const warehouseId = getWarehouseId(panelDetail)
    const packageCode = getSelectedPackage(panelDetail)
    const panelIndex = orderedFilteredOrders.findIndex((order) => order.orderId === panelOrder.orderId)
    const prevOrderId = panelIndex > 0 ? orderedFilteredOrders[panelIndex - 1]?.orderId ?? null : null
    const nextOrderId = panelIndex >= 0 && panelIndex < orderedFilteredOrders.length - 1 ? orderedFilteredOrders[panelIndex + 1]?.orderId ?? null : null
    const currentWeight = panelOrder.weight?.value ?? 0
    const currentWeightLb = Math.floor(currentWeight / 16)
    const currentWeightOz = Math.round(currentWeight % 16)
    const selectedAccountValue = panelOrder.label?.shippingProviderId ?? panelOrder.selectedRate?.shippingProviderId ?? getBestRateShippingProviderId(panelOrder) ?? null
    const selectedAccountString = selectedAccountValue != null ? String(selectedAccountValue) : ''
    const serviceValue = panelOrder.label?.serviceCode ?? panelOrder.selectedRate?.serviceCode ?? getBestRateServiceCode(panelOrder) ?? panelOrder.serviceCode ?? ''
    const shipped = panelOrder.orderStatus !== 'awaiting_shipment'
    const trackingNumber = panelOrder.label?.trackingNumber ?? null
    const deliveryLine = panelOrder.label?.shipDate
      ? `Shipped: ${formatDateOnly(panelOrder.label.shipDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'Delivery: —'
    const addressBlock = getAddressBlock(panelOrder, panelDetail)

    // TODO: Wire these controls to the React rate/package/create-label flows once the operator actions are migrated.
    return (
      <>
        <div className="panel-topbar">
          <button
            type="button"
            onClick={() => {
              if (prevOrderId == null) return
              updateSelection([prevOrderId])
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: prevOrderId != null ? 'pointer' : 'default',
              color: prevOrderId != null ? 'var(--text2)' : 'var(--text4)',
              fontSize: 14,
              padding: '2px 4px',
              borderRadius: 4,
            }}
            title="Previous order"
            disabled={prevOrderId == null}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              if (nextOrderId == null) return
              updateSelection([nextOrderId])
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: nextOrderId != null ? 'pointer' : 'default',
              color: nextOrderId != null ? 'var(--text2)' : 'var(--text4)',
              fontSize: 14,
              padding: '2px 4px',
              borderRadius: 4,
            }}
            title="Next order"
            disabled={nextOrderId == null}
          >
            ›
          </button>
          <div className="panel-ordnum">
            <span className="od-order-link" title="Keep order selected">{panelOrder.orderNumber ?? `#${panelOrder.orderId}`}</span>{' '}
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)' }}>
              {panelIndex >= 0 ? `${panelIndex + 1}/${orderedFilteredOrders.length}` : ''}
            </span>
          </div>
          <button className="panel-topbar-btn" type="button" title="TODO: batch menu parity still needs live actions">Batch ▾</button>
          <button className="panel-topbar-btn" type="button" title="TODO: print menu parity still needs live actions">Print ▾</button>
          <a
            className="panel-topbar-btn"
            href={`https://ship.shipstation.com/orders/${panelOrder.orderId}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', fontSize: 10, color: 'var(--text3)' }}
            title="Open in ShipStation"
          >
            ↗ SS
          </a>
          {shipped ? null : (
            <button className="panel-topbar-btn" type="button" style={{ color: '#b45309', borderColor: '#fbbf24' }} title="TODO: external ship action parity still needs wiring">
              ✈ Mark as Shipped
            </button>
          )}
          <button className="panel-close" type="button" onClick={clearSelection}>✕</button>
        </div>

        <div className="panel-body">
          <div className={`panel-section${collapsedSections.shipping ? ' collapsed' : ''}`} id="sec-shipping">
            <div className="panel-section-header" onClick={() => toggleSection('shipping')}>
              <span className="panel-section-arrow">▶</span>
              <span className="panel-section-title">Shipping</span>
              <div className="panel-section-icons">
                <span className="panel-section-icon" title="Settings">⚙</span>
                <span className="panel-section-icon" title="Grid">⊞</span>
              </div>
            </div>

            <div className="ship-req">
              Requested: <span className="ship-req-link">{(requestedService ?? 'Standard').replace(/_/g, ' ')}</span>
              {!panelOrder.carrierCode ? <span style={{ marginLeft: 4 }}>(unmapped)</span> : null}
            </div>

            <div className="panel-section-body">
              <div className="ship-field-row">
                <span className="ship-field-label">Ship From</span>
                <div className="ship-field-value">
                  <select className="ship-select" style={{ flex: 1 }} value={warehouseId != null ? String(warehouseId) : ''} disabled>
                    {locations.length === 0 ? <option value="">Loading…</option> : null}
                    {locations.map((location: LocationDto) => (
                      <option key={location.locationId} value={location.locationId}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <button className="ship-icon-btn" type="button" title="Manage locations" disabled>📍</button>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Ship Acct</span>
                <div className="ship-field-value">
                  <select className="ship-select" style={{ flex: 1 }} value={selectedAccountString} disabled>
                    <option value="">— Select Account —</option>
                    {shippingAccounts.map((account) => (
                      <option key={account.shippingProviderId} value={account.shippingProviderId}>
                        {account._label || account.nickname || account.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Service</span>
                <div className="ship-field-value">
                  <select className="ship-select" style={{ flex: 1 }} value={serviceValue} disabled>
                    <option value="">{serviceValue ? formatServiceCode(serviceValue) : 'Select Service'}</option>
                  </select>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Weight</span>
                <div className="ship-field-value">
                  <input type="number" className="ship-input ship-input-sm" value={currentWeightLb} readOnly />
                  <span className="ship-input-unit">lb</span>
                  <input type="number" className="ship-input ship-input-sm" value={currentWeightOz} readOnly />
                  <span className="ship-input-unit">oz</span>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Size</span>
                <div className="ship-field-value" style={{ gap: 3, flexWrap: 'wrap' }}>
                  <input type="number" className="ship-input ship-input-sm" value={dims?.length ?? ''} readOnly />
                  <span className="ship-input-unit">L</span>
                  <input type="number" className="ship-input ship-input-sm" value={dims?.width ?? ''} readOnly />
                  <span className="ship-input-unit">W</span>
                  <input type="number" className="ship-input ship-input-sm" value={dims?.height ?? ''} readOnly />
                  <span className="ship-input-unit">H (in)</span>
                </div>
              </div>

              <div className="ship-field-row" style={{ borderBottom: 'none', paddingBottom: 2 }}>
                <span className="ship-field-label">Package</span>
                <div className="ship-field-value">
                  <select className="ship-select" style={{ flex: 1 }} value={packageCode ?? ''} disabled>
                    <option value="">{packageCode ?? '— Select Package —'}</option>
                  </select>
                  <button className="ship-icon-btn" type="button" title="Manage packages" disabled>📐</button>
                </div>
              </div>

              <div id="p-package-dims" style={{ padding: '0 0 6px 98px', fontSize: 10, fontWeight: 600, color: 'var(--green,#16a34a)', borderBottom: '1px solid var(--border)', display: dims ? 'block' : 'none' }}>
                {dims ? `${dims.length} × ${dims.width} × ${dims.height} in` : ''}
              </div>

              {shipped ? null : (
                <div style={{ padding: '4px 0' }}>
                  <button className="btn btn-primary btn-sm" type="button" style={{ fontSize: 11.5, gap: 4 }} disabled>🔍 Browse Rates</button>
                </div>
              )}

              <div className="ship-field-row">
                <span className="ship-field-label">Confirmation</span>
                <div className="ship-field-value">
                  <select className="ship-select" value={confirmation} disabled>
                    <option value={confirmation}>{confirmation.replace(/_/g, ' ')}</option>
                  </select>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Insurance</span>
                <div className="ship-field-value" style={{ gap: 5, flexWrap: 'wrap' }}>
                  <select className="ship-select" value={insurance.type} style={{ flex: 1 }} disabled>
                    <option value={insurance.type}>{insurance.type === 'none' ? 'None' : insurance.type}</option>
                  </select>
                  <input
                    type="number"
                    className="ship-input ship-input-sm"
                    value={insurance.value != null ? insurance.value.toFixed(2) : ''}
                    placeholder="$0.00"
                    style={{ width: 68, display: insurance.value != null ? 'block' : 'none' }}
                    readOnly
                  />
                </div>
              </div>

              <div className="ship-rate-row">
                <span style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 500, width: 90, flexShrink: 0 }}>Rate</span>
                {shipped ? (
                  <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                    {getIsExternallyFulfilled(panelOrder)
                      ? '📦 Ext. label — purchased externally'
                      : `${formatMoney(panelOrder.label?.cost ?? panelOrder.selectedRate?.cost ?? getSelectedRateBaseCost(panelOrder))} · ${getShipAccountDisplay(panelOrder, shippingAccounts)} · ${formatServiceCode(serviceValue)}`}
                  </span>
                ) : (
                  <>
                    <span className="ship-rate-val" id="panel-rate-val">
                      {panelOrder.bestRate ? `${formatMoney(applyCarrierMarkup({
                        shippingProviderId: getBestRateShippingProviderId(panelOrder),
                        carrierCode: panelOrder.bestRate.carrierCode ?? '',
                        serviceCode: getBestRateServiceCode(panelOrder) ?? '',
                        serviceName: panelOrder.bestRate.serviceName ?? '',
                        amount: typeof panelOrder.bestRate.amount === 'number' ? panelOrder.bestRate.amount : 0,
                        shipmentCost: typeof panelOrder.bestRate.shipmentCost === 'number' ? panelOrder.bestRate.shipmentCost : undefined,
                        otherCost: typeof panelOrder.bestRate.otherCost === 'number' ? panelOrder.bestRate.otherCost : undefined,
                        carrierNickname: getBestRateCarrierNickname(panelOrder),
                      }, markups))} · ${getShipAccountDisplay(panelOrder, shippingAccounts)} · ${formatServiceCode(getBestRateServiceCode(panelOrder))}` : '—'}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span className="ship-scout" title="Refresh rates">🔄 <span id="panel-scout-label">Scout Review</span></span>
                  </>
                )}
              </div>

              {shipped ? null : (
                <button className="save-sku-btn" id="saveSkuBtn" type="button" disabled title="TODO: SKU defaults save parity still needs wiring">
                  💾 Save weights and dims as SKU defaults
                </button>
              )}
            </div>
          </div>

          {shipped ? null : (
            <div className="create-label-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="create-label-btn" type="button" style={{ flex: 1 }} disabled>
                🖨️ Create + Print Label <span className="create-label-caret">▾</span>
              </button>
              <button className="create-label-btn" type="button" style={{ flex: 1, background: '#16a34a' }} disabled>
                📥 Send to Queue
              </button>
              <button className="btn btn-ghost btn-sm" type="button" style={{ fontSize: 10.5, color: 'var(--text3)', padding: '4px 7px' }} disabled>
                Test
              </button>
            </div>
          )}

          {shipped && trackingNumber ? (
            <div className="delivery-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📦 Tracking:</span>
              <span
                style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => copyText(trackingNumber)}
                title="Click to copy"
              >
                {trackingNumber}
              </span>
              <button className="btn btn-sm btn-ghost" type="button" style={{ marginLeft: 'auto', fontSize: 10.5 }} disabled>
                🖨️ Reprint
              </button>
            </div>
          ) : null}

          <div className="delivery-row" id="panel-delivery-row">{deliveryLine}</div>

          <div className={`panel-section${collapsedSections.items ? ' collapsed' : ''}`} id="sec-items">
            <div className="panel-section-header" onClick={() => toggleSection('items')}>
              <span className="panel-section-arrow">▶</span>
              <span className="panel-section-title">Items</span>
              <div className="panel-section-icons">
                <span className="panel-section-icon">★</span>
                <span className="panel-section-icon">⊞</span>
              </div>
            </div>
            <div className="panel-section-body">
              {items.length === 0 ? <div style={{ paddingTop: 12, color: 'var(--text3)', fontSize: 11.5 }}>No items found for this order.</div> : null}
              {mergedItems.map((item) => (
                <div key={`${item.sku ?? 'unknown'}-${item.name ?? 'item'}`} className="item-row">
                  <div className="item-img">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 42, height: 42, borderRadius: 5, objectFit: 'cover' }} /> : '📦'}
                  </div>
                  <div className="item-info">
                    <div className="item-name">{item.name ?? 'Unknown Item'}</div>
                    <div className="item-sku">SKU: {item.sku ?? '—'}</div>
                    <div className="item-price-row">
                      {formatMoney(item.unitPrice)} × {item.quantity} = <strong>{formatMoney((item.unitPrice ?? 0) * item.quantity)}</strong>
                    </div>
                  </div>
                  <div className="item-qty">{item.quantity}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={`panel-section${collapsedSections.recipient ? ' collapsed' : ''}`} id="sec-recipient">
            <div className="panel-section-header" onClick={() => toggleSection('recipient')}>
              <span className="panel-section-arrow">▶</span>
              <span className="panel-section-title">Recipient</span>
              <div className="panel-section-icons">
                <span className="panel-section-icon">⊞</span>
              </div>
            </div>
            <div className="panel-section-body">
              <div className="recip-header">
                <span className="recip-title">Ship To</span>
                <span className="recip-edit" onClick={() => copyText(addressBlock)} title="Copy address">📋</span>
                <span className="recip-edit" title="TODO: recipient edit parity still needs wiring">Edit</span>
              </div>
              <div className="recip-name">{shipTo.name ?? '—'}</div>
              <div className="recip-addr">{addressBlock || '—'}</div>
              {shipTo.phone ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{shipTo.phone}</div> : null}
              <div id="panel-addr-type" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, marginBottom: 2 }}>
                {panelOrder.residential ?? panelOrder.sourceResidential ? '🏠 Residential' : '🏢 Commercial'}
                {panelOrder.residential != null ? ' (manual)' : ' (auto)'}
                {' — '}
                <a href="#" onClick={(event) => event.preventDefault()} style={{ color: 'var(--ss-blue)' }}>change</a>
              </div>
              <div className="recip-validated">
                {shipTo.addressVerified && shipTo.addressVerified !== 'Not Validated' ? '🏠 Address Validated' : '⚠ Address Not Validated'}
                <span className="recip-revert">Revert</span>
              </div>
              <div className="recip-tax">
                Tax Information: <span style={{ color: 'var(--text3)' }}>0 Tax IDs added</span>
                <span className="recip-tax-add">Add</span>
              </div>
              <div className="recip-sold" style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', marginBottom: 4 }}>Sold To</div>
                <div className="recip-sold-name">{toStringValue(toRecord(panelDetail?.raw)?.customerUsername) ?? shipTo.name ?? '—'}</div>
                {panelOrder.customerEmail ? <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{panelOrder.customerEmail}</div> : null}
              </div>

              {activeOrderLoading ? <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--text3)' }}>Loading full order detail…</div> : null}
              {activeOrderError ? <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--red)' }}>Failed to load full order detail.</div> : null}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div id="view-orders">
        <div className="filterbar">
          <div className="search-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              id="searchInput"
              placeholder="Search orders, SKUs, names…"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              style={{ paddingRight: 26, width: '100%' }}
            />
            <button
              id="searchClear"
              type="button"
              onClick={() => onSearchQueryChange?.('')}
              style={{
                display: searchQuery ? 'flex' : 'none',
                position: 'absolute',
                right: 7,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text3)',
                fontSize: 13,
                padding: 2,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <select className="filter-sel" id="skuFilter" value={skuFilter} onChange={(event) => setSkuFilter(event.target.value)}>
            <option value="">All SKUs</option>
            {skuOptions.map((sku) => (
              <option key={sku} value={sku}>{sku}</option>
            ))}
          </select>

          <select
            className="filter-sel"
            id="dateFilter"
            value={dateFilter}
            onChange={(event) => onDateFilterChange?.(event.target.value as OrdersDateFilter)}
          >
            <option value="">All Dates</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="last-30">Last 30 Days</option>
            <option value="last-90">Last 90 Days</option>
            <option value="custom">Custom…</option>
          </select>

          <div id="customDateWrap" style={{ display: dateFilter === 'custom' ? 'flex' : 'none', alignItems: 'center', gap: 4 }}>
            <input
              type="date"
              id="dateFrom"
              className="filter-sel"
              style={{ padding: '4px 6px', fontSize: 11.5, width: 'auto' }}
              value={customDateFrom}
              onChange={(event) => setCustomDateFrom(event.target.value)}
            />
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>–</span>
            <input
              type="date"
              id="dateTo"
              className="filter-sel"
              style={{ padding: '4px 6px', fontSize: 11.5, width: 'auto' }}
              value={customDateTo}
              onChange={(event) => setCustomDateTo(event.target.value)}
            />
          </div>

          <div className="col-toggle-wrap">
            <button className="btn btn-outline btn-sm" type="button" id="colBtnFilter" style={{ display: 'none' }}>⊞ Columns</button>
          </div>
          <button id="btnSelectAll" className="btn btn-ghost btn-sm" type="button" onClick={selectAll}>Select All</button>
          <button
            id="btnSkuSort"
            className="btn btn-ghost btn-sm"
            type="button"
            style={{
              gap: 4,
              borderColor: skuSortActive ? 'var(--ss-blue)' : undefined,
              background: skuSortActive ? 'var(--ss-blue-bg)' : undefined,
              color: skuSortActive ? 'var(--ss-blue)' : undefined,
            }}
            onClick={toggleSkuSort}
          >
            {skuSortActive ? '📋 SKU Sort ✓' : '📋 SKU Sort'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            style={{ fontSize: 11.5, gap: 4 }}
            id="exportBtn"
            onClick={() => {
              window.open(`/api/orders/export?orderStatus=${currentStatus}&pageSize=5000`, '_blank', 'noopener,noreferrer')
            }}
          >
            📥 Export CSV
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            style={{ fontSize: 11.5, gap: 4, marginLeft: 'auto', display: currentStatus === 'awaiting_shipment' ? '' : 'none' }}
            id="picklistBtn"
            disabled
            title="TODO: picklist parity still needs wiring"
          >
            🖨️ Picklist
          </button>
        </div>

        <div id="daily-strip" style={{ display: 'none' }} />

        <div className="content-split">
          <div className="orders-section" id="ordersSection">
            <div className="orders-wrap">
              {loading ? (
                <div id="loadingState" className="loading">
                  <div className="spinner" />
                  <div style={{ fontSize: 12, marginTop: 4 }}>Loading orders…</div>
                </div>
              ) : null}

              {!loading && error ? (
                <div id="loadingState" className="loading">
                  <div style={{ color: 'var(--red)', fontSize: 12.5 }}>⚠️ Error: {error.message}</div>
                </div>
              ) : null}

              {!loading && !error && orderedFilteredOrders.length > 0 ? (
                <table className="orders-table" id="ordersTable">
                  <thead id="tableHead">
                    <tr>
                      {visibleColumns.map((column) => {
                        const sortable = column.sort != null
                        const sorted = sortable && sortState.key === column.sort
                        return (
                          <th
                            key={column.key}
                            data-col={column.key}
                            style={{ width: column.width, position: 'relative' }}
                            className={sortable ? `${sorted ? `sortable sort-${sortState.dir}` : 'sortable'}` : undefined}
                            onClick={sortable ? () => toggleSort(column.sort as SortKey) : undefined}
                          >
                            {column.label}
                            {sortable ? <span className="sort-arrow" /> : null}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody id="ordersBody">
                    {orderedFilteredOrders.map((order) => {
                      const detail = orderDetailsById.get(order.orderId) ?? null
                      const items = getActiveItems(order, detail)
                      const uniqueSkus = new Set(items.map((item) => item.sku).filter(Boolean))
                      const multiSku = uniqueSkus.size > 1
                      const rowClasses = [
                        'order-row',
                        selectedIdSet.has(order.orderId) ? 'row-selected' : '',
                        panelOrderId === order.orderId ? 'row-panel-open' : '',
                        kbRowId === order.orderId ? 'row-kb-focus' : '',
                        multiSku ? 'multi-sku-row' : '',
                        getIsException(order) ? 'row-exception' : '',
                      ].filter(Boolean).join(' ')
                      const clientColor = getClientPalette(order.clientName ?? 'Untagged').border
                      const expedited = getExpeditedBadge(order, detail)

                      return (
                        <tr
                          key={order.orderId}
                          id={`row-${order.orderId}`}
                          className={rowClasses}
                          style={{ borderLeft: `3px solid ${clientColor}`, background: expedited ? 'rgba(34,197,94,.08)' : undefined }}
                          onClick={() => toggleOrderSelection(order.orderId)}
                          onDoubleClick={() => openShipStationOrder(order.orderId)}
                          onMouseEnter={() => setKbRowId(order.orderId)}
                        >
                          {visibleColumns.map((column) => (
                            <td key={column.key} data-col={column.key}>
                              {renderTableCell(order, column)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : null}

              {!loading && !error && orderedFilteredOrders.length === 0 ? (
                <div id="emptyState" className="empty-state">
                  <div className="empty-icon">📭</div>
                  <div>No orders match your filters</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="order-panel" id="orderPanel">
            <div className="panel-inner" id="panelInner">
              {selectedOrderIds.length >= 2 ? renderBatchPanel() : renderSinglePanel()}
            </div>
          </div>
        </div>
      </div>

      <div className="pagination-bar" id="paginationBar">
        <button className="btn btn-outline btn-sm" type="button" id="prevBtn" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          ← Prev
        </button>
        <span id="pageInfo">Page {pages === 0 ? 0 : currentPage} of {pages || 0}</span>
        <span id="totalInfo">{total.toLocaleString()} total</span>
        <button className="btn btn-outline btn-sm" type="button" id="nextBtn" disabled={pages === 0 || currentPage >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>
          Next →
        </button>
      </div>
    </>
  )
}
