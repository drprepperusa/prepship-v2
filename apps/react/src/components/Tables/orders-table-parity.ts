export interface TableOrderItem {
  sku?: string | null
  name?: string | null
  quantity?: number | null
  imageUrl?: string | null
  adjustment?: boolean
}

export interface TableRate {
  providerAccountId?: number | null
  providerAccountNickname?: string | null
  shippingProviderId?: number | null
  carrierCode?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  carrierNickname?: string | null
  _label?: string | null
  cost?: number | null
  shipmentCost?: number | null
  otherCost?: number | null
}

export interface TableLabel {
  trackingNumber?: string | null
  carrierCode?: string | null
  serviceCode?: string | null
  shippingProviderId?: number | null
  cost?: number | null
  rawCost?: number | null
  shipDate?: string | null
  createdAt?: string | number | null
}

export interface TableOrder {
  orderId: number
  clientId?: number | null
  clientName?: string | null
  orderNumber: string
  orderStatus?: string | null
  orderDate: string
  storeId?: number | null
  customerEmail?: string | null
  shipTo?: {
    name?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
  } | null
  carrierCode?: string | null
  serviceCode?: string | null
  trackingNumber?: string | null
  weight?: { value?: number | null; units?: string | null } | null
  orderTotal?: number | null
  shippingAmount?: number | null
  externalShipped?: boolean
  bestRate?: TableRate | null
  selectedRate?: TableRate | null
  label?: TableLabel | null
  items: TableOrderItem[]
  raw?: unknown
  rateDims?: { length?: number | null; width?: number | null; height?: number | null } | null
  shippingAccountName?: string | null
  internalNotes?: string | null
}

export interface TableCarrierAccount {
  shippingProviderId: number
  nickname?: string | null
  _label?: string | null
  accountNumber?: string | null
  name?: string | null
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getOrderRaw(order: TableOrder | null | undefined): Record<string, unknown> {
  return asObject(order?.raw) || asObject(order) || {}
}

export function getOrderSelectedRate(order: TableOrder | null | undefined): TableRate | null {
  return (asObject(order?.selectedRate) as TableRate | null) || null
}

export function getOrderDimensions(order: TableOrder | null | undefined): { length: number; width: number; height: number } | null {
  const rawDims = asObject(getOrderRaw(order).dimensions)
  const rateDims = asObject(order?.rateDims)
  const dims = rateDims || rawDims
  if (!dims) return null

  const length = asFiniteNumber(dims.length)
  const width = asFiniteNumber(dims.width)
  const height = asFiniteNumber(dims.height)
  if (length == null || width == null || height == null || length <= 0 || width <= 0 || height <= 0) {
    return null
  }
  return { length, width, height }
}

export function getOrderRequestedService(order: TableOrder | null | undefined): string | null {
  const requested = getOrderRaw(order).requestedShippingService
  if (typeof requested === 'string' && requested) return requested
  return typeof order?.serviceCode === 'string' && order.serviceCode ? order.serviceCode : null
}

export function getOrderNormalizedServiceCode(order: TableOrder | null | undefined): string | null {
  if (typeof order?.serviceCode === 'string' && order.serviceCode) return order.serviceCode
  const rawServiceCode = getOrderRaw(order).serviceCode
  return typeof rawServiceCode === 'string' && rawServiceCode ? rawServiceCode : null
}

export function getSelectedRateProviderId(order: TableOrder | null | undefined): number | null {
  const selectedRate = getOrderSelectedRate(order)
  if (!selectedRate) return null
  return asFiniteNumber(selectedRate.providerAccountId) ?? asFiniteNumber(selectedRate.shippingProviderId)
}

export function getSelectedRateCost(order: TableOrder | null | undefined): number | null {
  const selectedRate = getOrderSelectedRate(order)
  if (!selectedRate) return null
  return asFiniteNumber(selectedRate.cost) ?? asFiniteNumber(selectedRate.shipmentCost)
}

export function getSelectedRateTotal(order: TableOrder | null | undefined): number | null {
  const selectedRate = getOrderSelectedRate(order)
  if (!selectedRate) return null

  const shipmentCost = asFiniteNumber(selectedRate.shipmentCost)
  const otherCost = asFiniteNumber(selectedRate.otherCost) ?? 0
  if (shipmentCost != null) return shipmentCost + otherCost
  return asFiniteNumber(selectedRate.cost)
}

export function getOrderStoreId(order: TableOrder | null | undefined): number | null {
  const raw = getOrderRaw(order)
  const advancedOptions = asObject(raw.advancedOptions)
  return asFiniteNumber(advancedOptions?.storeId) ?? asFiniteNumber(order?.storeId)
}

export function getOrderBillingProviderId(order: TableOrder | null | undefined): number | null {
  const raw = getOrderRaw(order)
  const advancedOptions = asObject(raw.advancedOptions)
  return asFiniteNumber(advancedOptions?.billToMyOtherAccount)
}

export function isExternallyFulfilledOrder(order: TableOrder | null | undefined): boolean {
  return Boolean(getOrderRaw(order).externallyFulfilled)
}

export function getStoreName(order: TableOrder | null | undefined, storeMap: Record<number, string> = {}): string {
  const storeId = getOrderStoreId(order)
  if (storeId != null && storeMap[storeId]) return storeMap[storeId]
  if (order?.internalNotes) return order.internalNotes
  return order?.clientName || 'Untagged'
}

export function getShipAcct(order: TableOrder | null | undefined, carrierAccounts: TableCarrierAccount[] = []): string | null {
  const billingProviderId = getOrderBillingProviderId(order)
  if (!billingProviderId) return null

  const account = carrierAccounts.find((entry) => entry.shippingProviderId === billingProviderId)
  if (!account) return null
  return account._label || account.nickname || account.accountNumber || account.name || null
}

export function getPrimaryItem(order: TableOrder): TableOrderItem | null {
  const item = order.items.find((entry) => !entry.adjustment)
  return item || order.items[0] || null
}

export function getTotalQty(order: TableOrder): number {
  return order.items
    .filter((entry) => !entry.adjustment)
    .reduce((sum, entry) => sum + (entry.quantity || 1), 0)
}

export function getSortValue(
  order: TableOrder,
  sortKey: string,
  options: { storeMap?: Record<number, string>; carrierAccounts?: TableCarrierAccount[] } = {},
): string | number {
  const { storeMap = {}, carrierAccounts = [] } = options

  switch (sortKey) {
    case 'date':
    case 'age':
      return order.orderDate || ''
    case 'orderNum':
      return (order.orderNumber || '').toLowerCase()
    case 'client':
      return getStoreName(order, storeMap).toLowerCase()
    case 'customer':
      return (order.shipTo?.name || '').toLowerCase()
    case 'itemname':
      return ((getPrimaryItem(order)?.name || '') as string).toLowerCase()
    case 'sku':
      return ((getPrimaryItem(order)?.sku || '') as string).toLowerCase()
    case 'qty':
      return getTotalQty(order)
    case 'weight':
      return order.weight?.value || 0
    case 'shipto':
      return `${order.shipTo?.state || ''}${order.shipTo?.city || ''}`.toLowerCase()
    case 'carrier':
      return `${order.carrierCode || ''}${order.serviceCode || ''}`.toLowerCase()
    case 'custcarrier':
      return (getShipAcct(order, carrierAccounts) || '').toLowerCase()
    case 'total':
      return order.orderTotal || 0
    default:
      return ''
  }
}

export function getDiagnosticCarrierCode(order: TableOrder): string {
  const isShipped = order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
  if (isShipped) return order.selectedRate?.carrierCode || order.label?.carrierCode || order.carrierCode || '—'
  return order.bestRate?.carrierCode || '—'
}

export function getDiagnosticProviderId(order: TableOrder): number | string {
  const isShipped = order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
  if (isShipped) return getSelectedRateProviderId(order) ?? order.label?.shippingProviderId ?? '—'
  return order.bestRate?.shippingProviderId ?? '—'
}

export function getDiagnosticServiceCode(order: TableOrder): string {
  const isShipped = order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
  if (isShipped) return order.selectedRate?.serviceCode || order.label?.serviceCode || order.serviceCode || '—'
  return order.bestRate?.serviceCode || '—'
}

export function getDiagnosticAccountNickname(order: TableOrder): string {
  const isShipped = order.orderStatus !== 'awaiting_shipment' || Boolean(order.label?.trackingNumber && order.label?.carrierCode)
  if (!isShipped) return '—'
  return order.selectedRate?.providerAccountNickname || order.label?.carrierCode || '—'
}
