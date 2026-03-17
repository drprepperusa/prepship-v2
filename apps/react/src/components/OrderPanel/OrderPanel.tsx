import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CarrierAccountDto } from '@prepshipv2/contracts/init/contracts'
import type { OrderSummaryDto, OrderSelectedRateDto } from '@prepshipv2/contracts/orders/contracts'
import type { PackageDto } from '@prepshipv2/contracts/packages/contracts'
import type { RateDto } from '@prepshipv2/contracts/rates/contracts'
import { useLocations, useOrderDetail, useShippingAccounts } from '../../hooks'
import { useToast } from '../../hooks/useToast'
import FullRateBrowserModal from '../RateBrowser/RateBrowserModal'
import type { RateSelection } from '../RateBrowser/RateBrowserModal'

type ProductDefaultsDto = {
  sku: string
  weightOz: number
  length: number
  width: number
  height: number
  defaultPackageCode?: string | null
  packageCode?: string | null
}

type PackageOption = PackageDto & {
  packageCode?: string | null
}

type OrderPanelProps = {
  orderId: number | null
  orderSnapshot: OrderSummaryDto | null
  orderIds: number[]
  onOpenOrder: (orderId: number) => void
  onClose: () => void
  onRefresh?: () => Promise<void> | void
}

const PRESETS = {
  Small: { lb: 0, oz: 8, len: 8, wid: 6, hgt: 2 },
  Medium: { lb: 1, oz: 0, len: 12, wid: 9, hgt: 4 },
  Large: { lb: 2, oz: 0, len: 16, wid: 12, hgt: 6 },
  'Poly Mailer S': { lb: 0, oz: 8, len: 10, wid: 13, hgt: 0 },
  'Poly Mailer L': { lb: 1, oz: 0, len: 14, wid: 17, hgt: 0 },
} as const

const EXTERNAL_SOURCES = ['Amazon', 'Walmart', 'eBay', 'Etsy', 'Other']

const CARRIER_SERVICES: Record<string, Array<{ code: string; label: string }>> = {
  stamps_com: [
    { code: 'usps_media_mail', label: 'USPS Media Mail' },
    { code: 'usps_first_class_mail', label: 'USPS First Class Mail' },
    { code: 'usps_ground_advantage', label: 'USPS Ground Advantage' },
    { code: 'usps_priority_mail', label: 'USPS Priority Mail' },
    { code: 'usps_priority_mail_express', label: 'USPS Priority Express' },
    { code: 'usps_parcel_select', label: 'USPS Parcel Select' },
  ],
  ups: [
    { code: 'ups_ground', label: 'UPS Ground' },
    { code: 'ups_ground_saver', label: 'UPS Ground Saver' },
    { code: 'ups_surepost_less_than_1_lb', label: 'UPS SurePost (<1 lb)' },
    { code: 'ups_surepost_1_lb_or_greater', label: 'UPS SurePost (≥1 lb)' },
    { code: 'ups_3_day_select', label: 'UPS 3 Day Select' },
    { code: 'ups_2nd_day_air', label: 'UPS 2nd Day Air' },
    { code: 'ups_2nd_day_air_am', label: 'UPS 2nd Day Air AM' },
    { code: 'ups_next_day_air_saver', label: 'UPS Next Day Air Saver' },
    { code: 'ups_next_day_air', label: 'UPS Next Day Air' },
    { code: 'ups_next_day_air_early_am', label: 'UPS Next Day Air Early AM' },
  ],
  ups_walleted: [
    { code: 'ups_ground', label: 'UPS Ground' },
    { code: 'ups_ground_saver', label: 'UPS Ground Saver' },
    { code: 'ups_surepost_less_than_1_lb', label: 'UPS SurePost (<1 lb)' },
    { code: 'ups_surepost_1_lb_or_greater', label: 'UPS SurePost (≥1 lb)' },
    { code: 'ups_3_day_select', label: 'UPS 3 Day Select' },
    { code: 'ups_2nd_day_air', label: 'UPS 2nd Day Air' },
    { code: 'ups_next_day_air_saver', label: 'UPS Next Day Air Saver' },
    { code: 'ups_next_day_air', label: 'UPS Next Day Air' },
  ],
  fedex: [
    { code: 'fedex_ground', label: 'FedEx Ground' },
    { code: 'fedex_home_delivery', label: 'FedEx Home Delivery' },
    { code: 'fedex_2day', label: 'FedEx 2Day' },
    { code: 'fedex_express_saver', label: 'FedEx Express Saver' },
    { code: 'fedex_priority_overnight', label: 'FedEx Priority Overnight' },
    { code: 'fedex_standard_overnight', label: 'FedEx Standard Overnight' },
  ],
  fedex_walleted: [
    { code: 'fedex_ground', label: 'FedEx Ground' },
    { code: 'fedex_home_delivery', label: 'FedEx Home Delivery' },
    { code: 'fedex_2day', label: 'FedEx 2Day' },
    { code: 'fedex_express_saver', label: 'FedEx Express Saver' },
    { code: 'fedex_priority_overnight', label: 'FedEx Priority Overnight' },
    { code: 'fedex_standard_overnight', label: 'FedEx Standard Overnight' },
  ],
}

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
  fedex_express_saver: 'FedEx Express Saver',
  fedex_priority_overnight: 'FedEx Priority Overnight',
  fedex_standard_overnight: 'FedEx Standard Overnight',
}

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 40,
  minWidth: '170px',
  overflow: 'hidden',
  border: '1px solid var(--border2)',
  borderRadius: '6px',
  background: 'var(--surface)',
  boxShadow: '0 4px 16px rgba(0,0,0,.15)',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getRawOrder(order: OrderSummaryDto | null) {
  return asRecord(order?.raw) ?? {}
}

function getAdvancedOptions(order: OrderSummaryDto | null) {
  return asRecord(getRawOrder(order).advancedOptions) ?? {}
}

function getOrderDimensions(order: OrderSummaryDto | null) {
  if (order?.rateDims) {
    return order.rateDims
  }

  const rawDims = asRecord(getRawOrder(order).dimensions)
  return {
    length: asNumber(rawDims?.length) ?? 0,
    width: asNumber(rawDims?.width) ?? 0,
    height: asNumber(rawDims?.height) ?? 0,
  }
}

function getOrderShipTo(order: OrderSummaryDto | null) {
  const rawShipTo = asRecord(getRawOrder(order).shipTo)
  const fallback = order?.shipTo ?? {
    name: '',
    city: '',
    state: '',
    postalCode: '',
  }
  return {
    name: typeof rawShipTo?.name === 'string' ? rawShipTo.name : fallback.name ?? '',
    company: typeof rawShipTo?.company === 'string' ? rawShipTo.company : '',
    street1: typeof rawShipTo?.street1 === 'string' ? rawShipTo.street1 : '',
    street2: typeof rawShipTo?.street2 === 'string' ? rawShipTo.street2 : '',
    city: typeof rawShipTo?.city === 'string' ? rawShipTo.city : fallback.city ?? '',
    state: typeof rawShipTo?.state === 'string' ? rawShipTo.state : fallback.state ?? '',
    postalCode: typeof rawShipTo?.postalCode === 'string' ? rawShipTo.postalCode : fallback.postalCode ?? '',
    country: typeof rawShipTo?.country === 'string' ? rawShipTo.country : 'US',
    phone: typeof rawShipTo?.phone === 'string' ? rawShipTo.phone : '',
  }
}

function getOrderRequestedService(order: OrderSummaryDto | null) {
  const requested = getRawOrder(order).requestedShippingService
  if (typeof requested === 'string' && requested) return requested
  return order?.serviceCode ?? null
}

function getOrderConfirmation(order: OrderSummaryDto | null) {
  const confirmation = getRawOrder(order).confirmation
  return typeof confirmation === 'string' && confirmation ? confirmation : null
}

function getOrderCustomerUsername(order: OrderSummaryDto | null) {
  const username = getRawOrder(order).customerUsername
  return typeof username === 'string' && username ? username : null
}

function getOrderStoreId(order: OrderSummaryDto | null) {
  const advanced = getAdvancedOptions(order)
  const advancedStoreId = asNumber(advanced.storeId)
  return advancedStoreId ?? order?.storeId ?? null
}

function getOrderWarehouseId(order: OrderSummaryDto | null) {
  return asNumber(getAdvancedOptions(order).warehouseId)
}

function getOrderBillingProviderId(order: OrderSummaryDto | null) {
  return asNumber(getAdvancedOptions(order).billToMyOtherAccount)
}

function isResidential(order: OrderSummaryDto | null) {
  if (!order) return false
  if (typeof order.residential === 'boolean') return order.residential
  return Boolean(order.sourceResidential)
}

function isExternallyFulfilledOrder(order: OrderSummaryDto | null) {
  const rawFlag = getRawOrder(order).externallyFulfilled
  return Boolean(rawFlag) || Boolean(order?.externalShipped)
}

function getSelectedRateProviderId(order: OrderSummaryDto | null) {
  const selectedRate = order?.selectedRate
  if (!selectedRate) return null
  return selectedRate.providerAccountId ?? selectedRate.shippingProviderId ?? null
}

function getSelectedRateCost(order: OrderSummaryDto | null) {
  const selectedRate = order?.selectedRate
  if (!selectedRate) return null
  return selectedRate.cost ?? selectedRate.shipmentCost ?? null
}

function getItems(order: OrderSummaryDto | null) {
  return Array.isArray(order?.items)
    ? order.items
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item) && !item.adjustment)
    : []
}

function getUniqueSkus(order: OrderSummaryDto | null) {
  const skus = new Set<string>()
  getItems(order).forEach((item) => {
    if (typeof item.sku === 'string' && item.sku) {
      skus.add(item.sku)
    }
  })
  return Array.from(skus)
}

function getTotalItemQty(order: OrderSummaryDto | null) {
  return getItems(order).reduce((total, item) => total + (asNumber(item.quantity) ?? 1), 0)
}

function findPackageByCodeOrId(packages: PackageOption[], codeOrId: string | null | undefined) {
  if (!codeOrId) return null
  return packages.find((pkg) => String(pkg.packageId) === String(codeOrId) || String(pkg.packageCode ?? '') === String(codeOrId)) ?? null
}

function fmtCarrierName(rate: Pick<RateDto, 'carrierCode' | 'carrierNickname'> | null | undefined) {
  if (!rate) return '—'
  if (rate.carrierNickname && !rate.carrierNickname.startsWith('se-')) {
    return rate.carrierNickname
  }
  return CARRIER_NAMES[rate.carrierCode] ?? rate.carrierCode?.toUpperCase() ?? '—'
}

function fmtServiceName(serviceCode: string | null | undefined, serviceName?: string | null) {
  if (serviceCode && SERVICE_NAMES[serviceCode]) return SERVICE_NAMES[serviceCode]
  if (serviceName) return serviceName
  return serviceCode ? serviceCode.replace(/_/g, ' ') : '—'
}

function formatRateTotal(rate: Pick<RateDto, 'shipmentCost' | 'otherCost'> | OrderSelectedRateDto) {
  const shipmentCost = typeof rate.shipmentCost === 'number' ? rate.shipmentCost : 0
  const otherCost = typeof rate.otherCost === 'number' ? rate.otherCost : 0
  return shipmentCost + otherCost
}

function buildAddressText(shipTo: ReturnType<typeof getOrderShipTo>) {
  return [
    shipTo.street1,
    shipTo.street2,
    `${shipTo.city || ''}, ${shipTo.state || ''} ${shipTo.postalCode || ''}`.trim(),
    shipTo.country || 'US',
  ]
    .filter(Boolean)
    .join('\n') || '—'
}

function shippedRateMarkup(order: OrderSummaryDto, accounts: CarrierAccountDto[]) {
  if (isExternallyFulfilledOrder(order)) {
    return (
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text3)',
          background: 'var(--surface3)',
          border: '1px solid var(--border2)',
          borderRadius: '4px',
          padding: '3px 8px',
        }}
      >
        📦 Ext. label — purchased externally
      </span>
    )
  }

  if (order.label?.cost != null) {
    const accountLabel = order.label.shippingProviderId
      ? accounts.find((account) => account.shippingProviderId === order.label?.shippingProviderId)?._label
      : null

    return (
      <>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green-dark)' }}>
          ${Number(order.label.cost).toFixed(2)}
        </span>
        <span style={{ fontSize: '10.5px', color: 'var(--text3)', marginLeft: '6px' }}>
          {accountLabel ?? fmtCarrierName({ carrierCode: order.label.carrierCode ?? '', carrierNickname: null })} · {fmtServiceName(order.label.serviceCode)}
        </span>
      </>
    )
  }

  if (order.selectedRate) {
    return (
      <>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green-dark)' }}>
          ${formatRateTotal(order.selectedRate).toFixed(2)}
        </span>
        <span style={{ fontSize: '10.5px', color: 'var(--text3)', marginLeft: '6px' }}>
          {order.selectedRate.providerAccountNickname ?? fmtCarrierName({ carrierCode: order.selectedRate.carrierCode ?? '', carrierNickname: null })} · {fmtServiceName(order.selectedRate.serviceCode, order.selectedRate.serviceName)}
        </span>
      </>
    )
  }

  if (order.shippingAmount) {
    return (
      <>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green-dark)' }}>
          ${Number(order.shippingAmount).toFixed(2)}
        </span>
        <span style={{ fontSize: '10.5px', color: 'var(--text3)', marginLeft: '6px' }}>
          {fmtCarrierName({ carrierCode: order.carrierCode ?? '', carrierNickname: null })} · {fmtServiceName(order.serviceCode)}
        </span>
      </>
    )
  }

  return (
    <span
      style={{
        fontSize: '11px',
        color: '#dc2626',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '4px',
        padding: '3px 8px',
      }}
    >
      ⚠️ No shipment data
    </span>
  )
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText
    try {
      const payload = await response.json()
      if (payload && typeof payload.error === 'string') {
        message = payload.error
      }
    } catch {
      // Ignore JSON parse failures for error bodies.
    }
    throw new Error(message || `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

// RateBrowserModal is now imported from RateBrowser/RateBrowserModal.tsx

export default function OrderPanel({ orderId, orderSnapshot, orderIds, onOpenOrder, onClose, onRefresh }: OrderPanelProps) {
  const { order, loading, error, refetch: refetchOrder } = useOrderDetail(orderId)
  const { accounts } = useShippingAccounts()
  const { locations } = useLocations()
  const { showToast } = useToast()

  const [packages, setPackages] = useState<PackageOption[]>([])
  const [storeAccounts, setStoreAccounts] = useState<CarrierAccountDto[] | null>(null)
  const [productDefaults, setProductDefaults] = useState<ProductDefaultsDto | null>(null)

  const [shippingCollapsed, setShippingCollapsed] = useState(false)
  const [itemsCollapsed, setItemsCollapsed] = useState(false)
  const [recipientCollapsed, setRecipientCollapsed] = useState(false)

  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedShipAccountId, setSelectedShipAccountId] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [packageDimsLabel, setPackageDimsLabel] = useState('')
  const [confirmation, setConfirmation] = useState('delivery')
  const [insuranceType, setInsuranceType] = useState('none')
  const [insuranceValue, setInsuranceValue] = useState('0.00')
  const [weightLb, setWeightLb] = useState('0')
  const [weightOz, setWeightOz] = useState('0')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')

  const [panelRates, setPanelRates] = useState<RateDto[]>([])
  const [selectedRate, setSelectedRate] = useState<RateDto | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [rateMessage, setRateMessage] = useState('—')
  const [deliveryMessage, setDeliveryMessage] = useState('Delivery: —')
  const [rateBrowserOpen, setRateBrowserOpen] = useState(false)

  const [actionMenu, setActionMenu] = useState<'batch' | 'print' | 'external' | null>(null)
  const [workingAction, setWorkingAction] = useState<string | null>(null)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const rateTimerRef = useRef<number | null>(null)
  const menuRootRef = useRef<HTMLDivElement | null>(null)
  const skipNextAutoFetchRef = useRef(false)

  const panelOrder = orderSnapshot ?? order
  const displayAccounts = storeAccounts ?? accounts
  const isShipped = panelOrder?.orderStatus !== 'awaiting_shipment'
  const items = useMemo(() => getItems(panelOrder), [panelOrder])
  const uniqueSkus = useMemo(() => getUniqueSkus(panelOrder), [panelOrder])
  const totalQty = useMemo(() => getTotalItemQty(panelOrder), [panelOrder])
  const shipTo = useMemo(() => getOrderShipTo(panelOrder), [panelOrder])
  const addressText = useMemo(() => buildAddressText(shipTo), [shipTo])
  const orderIndex = orderId ? orderIds.findIndex((candidateId) => candidateId === orderId) : -1
  const prevId = orderIndex > 0 ? orderIds[orderIndex - 1] : null
  const nextId = orderIndex >= 0 && orderIndex < orderIds.length - 1 ? orderIds[orderIndex + 1] : null

  const serviceOptions = useMemo(() => {
    const account = displayAccounts.find((carrier) => String(carrier.shippingProviderId) === selectedShipAccountId)
    const staticOptions = account ? [...(CARRIER_SERVICES[account.code] ?? [])] : []
    const dynamicOptions = panelRates
      .filter((rate) => !selectedShipAccountId || String(rate.shippingProviderId ?? '') === selectedShipAccountId)
      .map((rate) => ({
        code: rate.serviceCode,
        label: fmtServiceName(rate.serviceCode, rate.serviceName),
      }))

    const merged = new Map<string, { code: string; label: string }>()
    ;[...staticOptions, ...dynamicOptions].forEach((option) => {
      if (!merged.has(option.code)) {
        merged.set(option.code, option)
      }
    })

    return Array.from(merged.values())
  }, [displayAccounts, panelRates, selectedShipAccountId])

  const hasSavedWeight = Boolean(productDefaults && productDefaults.weightOz > 0)
  const hasSavedDims = Boolean(productDefaults && productDefaults.length > 0 && productDefaults.width > 0 && productDefaults.height > 0)
  const savedPackage = useMemo(() => {
    if (!productDefaults) return null
    return findPackageByCodeOrId(packages, productDefaults.defaultPackageCode ?? productDefaults.packageCode ?? null)
  }, [packages, productDefaults])

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (menuRootRef.current && !menuRootRef.current.contains(event.target as Node)) {
        setActionMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickAway)
    return () => document.removeEventListener('mousedown', handleClickAway)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/packages')
        const payload = await readJson<PackageOption[] | { packages?: PackageOption[] }>(response)
        if (!cancelled) {
          setPackages(Array.isArray(payload) ? payload : payload.packages ?? [])
        }
      } catch {
        if (!cancelled) {
          setPackages([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const storeId = getOrderStoreId(panelOrder)

    if (!storeId) {
      setStoreAccounts(null)
      return
    }

    void (async () => {
      try {
        const response = await fetch(`/api/carriers-for-store?storeId=${storeId}`)
        const payload = await readJson<{ carriers?: CarrierAccountDto[] }>(response)
        if (!cancelled) {
          setStoreAccounts(Array.isArray(payload.carriers) ? payload.carriers : null)
        }
      } catch {
        if (!cancelled) {
          setStoreAccounts(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [orderId, panelOrder?.storeId, panelOrder?.raw, orderSnapshot])

  useEffect(() => {
    if (!panelOrder) return

    const rawDims = getOrderDimensions(panelOrder)
    const totalWeightOz = panelOrder.weight?.value ?? 0
    const initialLb = Math.floor(totalWeightOz / 16)
    const initialOz = totalWeightOz % 16
    const bestRate = panelOrder.bestRate
    const shipAccountId = bestRate?.shippingProviderId ?? getOrderBillingProviderId(panelOrder) ?? getSelectedRateProviderId(panelOrder) ?? null
    const requestedService = bestRate?.serviceCode ?? getOrderRequestedService(panelOrder) ?? panelOrder.selectedRate?.serviceCode ?? ''
    const confirmationValue = getOrderConfirmation(panelOrder)

    setSelectedLocationId(String(getOrderWarehouseId(panelOrder) ?? locations.find((location) => location.isDefault)?.locationId ?? ''))
    setSelectedShipAccountId(shipAccountId ? String(shipAccountId) : '')
    setSelectedService(requestedService)
    setConfirmation(confirmationValue && confirmationValue !== 'none' ? confirmationValue : 'delivery')
    setInsuranceType('none')
    setInsuranceValue(Number(panelOrder.orderTotal ?? 0).toFixed(2))
    setWeightLb(String(initialLb))
    setWeightOz(String(Number(initialOz.toFixed(0))))
    setLength(rawDims.length ? String(rawDims.length) : '')
    setWidth(rawDims.width ? String(rawDims.width) : '')
    setHeight(rawDims.height ? String(rawDims.height) : '')
    setRateMessage(bestRate ? `${fmtCarrierName(bestRate)} · ${fmtServiceName(bestRate.serviceCode, bestRate.serviceName)} · $${formatRateTotal(bestRate).toFixed(2)}` : '—')
    setDeliveryMessage(panelOrder.label?.shipDate ? `Shipped: ${new Date(panelOrder.label.shipDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` : bestRate?.estimatedDelivery ? `Delivery: ${new Date(bestRate.estimatedDelivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : bestRate?.deliveryDays ? `Delivery: ${bestRate.deliveryDays} business day${bestRate.deliveryDays === 1 ? '' : 's'}` : 'Delivery: —')
    setPanelRates(bestRate ? [bestRate] : [])
    setSelectedRate(bestRate ?? null)
    setSelectedPackageId('')
    setPackageDimsLabel('')
    setActionMenu(null)
    setProductDefaults(null)
    skipNextAutoFetchRef.current = true
  }, [panelOrder, locations])

  useEffect(() => {
    let cancelled = false
    const sku = uniqueSkus.length === 1 ? uniqueSkus[0] : null
    if (!sku) {
      setProductDefaults(null)
      return
    }

    void (async () => {
      try {
        const response = await fetch(`/api/products/by-sku/${encodeURIComponent(sku)}`)
        const payload = await readJson<ProductDefaultsDto>(response)
        if (cancelled) return
        setProductDefaults(payload)

        const currentTotalOz = (Number(weightLb) * 16) + Number(weightOz)
        if (!currentTotalOz && payload.weightOz > 0) {
          const orderTotalWeight = Number((payload.weightOz * Math.max(totalQty, 1)).toFixed(2))
          setWeightLb(String(Math.floor(orderTotalWeight / 16)))
          setWeightOz(String(Number((orderTotalWeight % 16).toFixed(0))))
        }
        if (!Number(length) && !Number(width) && !Number(height) && payload.length > 0 && payload.width > 0 && payload.height > 0) {
          setLength(String(payload.length))
          setWidth(String(payload.width))
          setHeight(String(payload.height))
        }
      } catch {
        if (!cancelled) {
          setProductDefaults(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [height, length, orderId, totalQty, uniqueSkus, weightLb, weightOz, width])

  useEffect(() => {
    if (savedPackage && !selectedPackageId) {
      setSelectedPackageId(String(savedPackage.packageId))
      setPackageDimsLabel(`${savedPackage.length} × ${savedPackage.width} × ${savedPackage.height} in`)
    }
  }, [savedPackage, selectedPackageId])

  useEffect(() => {
    if (!panelOrder || savedPackage || selectedPackageId || !Number(length) || !Number(width) || !Number(height) || !packages.length) {
      return
    }

    const matchedPackage = packages.find((pkg) => Number(pkg.length) === Number(length) && Number(pkg.width) === Number(width) && Number(pkg.height) === Number(height))
    if (!matchedPackage) {
      return
    }

    setSelectedPackageId(String(matchedPackage.packageId))
    setPackageDimsLabel(`${matchedPackage.length} × ${matchedPackage.width} × ${matchedPackage.height} in`)
    void persistSelectedPackage(String(matchedPackage.packageId))
  }, [height, length, packages, panelOrder, savedPackage, selectedPackageId, width])

  useEffect(() => {
    if (!selectedService && serviceOptions.length > 0) {
      setSelectedService(serviceOptions[0].code)
    }
  }, [selectedService, serviceOptions])

  const totalOz = (Number(weightLb) * 16) + Number(weightOz)
  const hasDims = Number(length) > 0 && Number(width) > 0 && Number(height) > 0

  const refreshAll = async () => {
    await refetchOrder()
    await onRefresh?.()
  }

  const fetchPanelRates = async (options?: { keepManualSelection?: boolean; forceLive?: boolean }) => {
    if (!panelOrder || isShipped) return

    const zip = (shipTo.postalCode ?? '').replace(/\D/g, '').slice(0, 5)
    if (!zip) {
      setRateMessage('No ZIP')
      setDeliveryMessage('Delivery: —')
      return
    }
    if (!totalOz) {
      setRateMessage('— add weight')
      setDeliveryMessage('Delivery: —')
      return
    }
    if (!hasDims) {
      setRateMessage('— add dims')
      setDeliveryMessage('Delivery: —')
      return
    }

    setRateLoading(true)
    setRateMessage('Loading rates…')

    const storeId = getOrderStoreId(panelOrder)
    const storedBestRate = panelOrder.bestRate

    if (storedBestRate && !options?.forceLive) {
      setPanelRates([storedBestRate])
      setSelectedRate(storedBestRate)
      if (storedBestRate.shippingProviderId && !selectedShipAccountId) {
        setSelectedShipAccountId(String(storedBestRate.shippingProviderId))
      }
      if (storedBestRate.serviceCode && !selectedService) {
        setSelectedService(storedBestRate.serviceCode)
      }
      setRateMessage(`${fmtCarrierName(storedBestRate)} · ${fmtServiceName(storedBestRate.serviceCode, storedBestRate.serviceName)} · $${formatRateTotal(storedBestRate).toFixed(2)}`)
      if (storedBestRate.estimatedDelivery) {
        setDeliveryMessage(`Delivery: ${new Date(storedBestRate.estimatedDelivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
      } else if (storedBestRate.deliveryDays) {
        setDeliveryMessage(`Delivery: ${storedBestRate.deliveryDays} business day${storedBestRate.deliveryDays === 1 ? '' : 's'}`)
      }
      setRateLoading(false)
      return
    }

    let rates: RateDto[] = []

    try {
      const cacheUrl = new URL('/api/rates/cached', window.location.origin)
      cacheUrl.searchParams.set('wt', String(Math.round(totalOz)))
      cacheUrl.searchParams.set('zip', zip)
      cacheUrl.searchParams.set('l', String(Number(length)))
      cacheUrl.searchParams.set('w', String(Number(width)))
      cacheUrl.searchParams.set('h', String(Number(height)))
      cacheUrl.searchParams.set('residential', isResidential(panelOrder) ? 'true' : 'false')
      if (storeId) {
        cacheUrl.searchParams.set('storeId', String(storeId))
      }

      const cacheResponse = await fetch(cacheUrl.toString())
      if (cacheResponse.ok) {
        const cachePayload = await cacheResponse.json() as { rates?: RateDto[] }
        if (Array.isArray(cachePayload.rates) && cachePayload.rates.length > 0) {
          rates = cachePayload.rates
        }
      }
    } catch {
      // Cache misses fall through to live rates.
    }

    if (!rates.length) {
      const liveResponse = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPostalCode: '90248',
          toPostalCode: zip,
          toCountry: 'US',
          weight: { value: totalOz, units: 'ounces' },
          dimensions: { units: 'inches', length: Number(length), width: Number(width), height: Number(height) },
          residential: isResidential(panelOrder),
          orderId: panelOrder.orderId,
          storeId,
        }),
      })
      rates = await readJson<RateDto[]>(liveResponse)
    }

    setPanelRates(rates)

    if (!rates.length) {
      setSelectedRate(null)
      setRateMessage('No rates found')
      setDeliveryMessage('Delivery: —')
      setRateLoading(false)
      return
    }

    let nextRate =
      (selectedService
        ? rates.find((rate) => rate.serviceCode === selectedService && (!selectedShipAccountId || String(rate.shippingProviderId ?? '') === selectedShipAccountId))
        : null) ??
      (selectedShipAccountId
        ? [...rates]
            .filter((rate) => String(rate.shippingProviderId ?? '') === selectedShipAccountId)
            .sort((left, right) => formatRateTotal(left) - formatRateTotal(right))[0]
        : null) ??
      [...rates].sort((left, right) => formatRateTotal(left) - formatRateTotal(right))[0] ??
      null

    if (!nextRate) {
      setSelectedRate(null)
      setRateMessage('Rate unavailable for selected service')
      setDeliveryMessage('Delivery: —')
      setRateLoading(false)
      return
    }

    if (!options?.keepManualSelection) {
      if (nextRate.shippingProviderId && String(nextRate.shippingProviderId) !== selectedShipAccountId) {
          setSelectedShipAccountId(String(nextRate.shippingProviderId))
        }
      if (nextRate.serviceCode && nextRate.serviceCode !== selectedService) {
        setSelectedService(nextRate.serviceCode)
      }
    }

    setSelectedRate(nextRate)
    setRateMessage(`${fmtCarrierName(nextRate)} · ${fmtServiceName(nextRate.serviceCode, nextRate.serviceName)} · $${formatRateTotal(nextRate).toFixed(2)}`)

    if (nextRate.estimatedDelivery) {
      setDeliveryMessage(`Delivery: ${new Date(nextRate.estimatedDelivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
    } else if (nextRate.deliveryDays) {
      setDeliveryMessage(`Delivery: ${nextRate.deliveryDays} business day${nextRate.deliveryDays === 1 ? '' : 's'}`)
    } else {
      setDeliveryMessage('Delivery: —')
    }

    setRateLoading(false)
  }

  useEffect(() => {
    if (rateTimerRef.current) {
      window.clearTimeout(rateTimerRef.current)
    }

    if (!panelOrder || isShipped) return

    if (skipNextAutoFetchRef.current) {
      skipNextAutoFetchRef.current = false
      return
    }

    rateTimerRef.current = window.setTimeout(() => {
      void fetchPanelRates({ keepManualSelection: Boolean(selectedService), forceLive: true })
    }, 400)

    return () => {
      if (rateTimerRef.current) {
        window.clearTimeout(rateTimerRef.current)
      }
    }
  }, [orderId, selectedService, selectedShipAccountId, weightLb, weightOz, length, width, height, panelOrder?.residential, panelOrder?.sourceResidential, isShipped])

  const applyPreset = (name: keyof typeof PRESETS) => {
    const preset = PRESETS[name]
    setWeightLb(String(preset.lb))
    setWeightOz(String(preset.oz))
    setLength(String(preset.len))
    setWidth(String(preset.wid))
    setHeight(String(preset.hgt))
    setSelectedPackageId('__custom__')
    setPackageDimsLabel('')
  }

  const persistSelectedPackage = async (packageId: string) => {
    if (!orderId) return

    try {
      await fetch(`/api/orders/${orderId}/selected-package-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
    } catch {
      // Best-effort only.
    }
  }

  const applyPackagePreset = async (packageId: string) => {
    setSelectedPackageId(packageId)
    if (!packageId || packageId === '__custom__') {
      setPackageDimsLabel('')
      if (packageId) {
        await persistSelectedPackage(packageId)
      }
      return
    }

    const selectedPackage = packages.find((pkg) => String(pkg.packageId) === packageId)
    if (!selectedPackage) return

    setLength(String(selectedPackage.length || ''))
    setWidth(String(selectedPackage.width || ''))
    setHeight(String(selectedPackage.height || ''))
    setPackageDimsLabel(`${selectedPackage.length} × ${selectedPackage.width} × ${selectedPackage.height} in`)
    await persistSelectedPackage(packageId)
  }

  const resolveLabelPayload = () => {
    if (!panelOrder) throw new Error('No order selected')

    const packageValue = selectedPackageId
    if (!packageValue) throw new Error('Select a package before creating a label')
    if (!selectedShipAccountId) throw new Error('Select a carrier account')
    if (!selectedService) throw new Error('Select a shipping service')
    if (!totalOz) throw new Error('Enter shipment weight')

    const selectedAccount = displayAccounts.find((account) => String(account.shippingProviderId) === selectedShipAccountId)
    if (!selectedAccount) throw new Error('Could not resolve carrier account')

    const selectedLocation = locations.find((location) => String(location.locationId) === selectedLocationId)
    const selectedPackage = packageValue && packageValue !== '__custom__'
      ? packages.find((pkg) => String(pkg.packageId) === packageValue)
      : null

    const shipFrom = selectedLocation ? {
      name: selectedLocation.name,
      company: selectedLocation.company || '',
      street1: selectedLocation.street1 || '',
      street2: selectedLocation.street2 || '',
      city: selectedLocation.city || '',
      state: selectedLocation.state || '',
      postalCode: selectedLocation.postalCode || '',
      country: selectedLocation.country || 'US',
      phone: selectedLocation.phone || '',
    } : undefined

    return {
      orderId: panelOrder.orderId,
      orderNumber: panelOrder.orderNumber ?? undefined,
      carrierCode: selectedAccount.code,
      serviceCode: selectedService,
      packageCode: selectedPackage?.source === 'ss_carrier'
        ? (selectedPackage.packageCode || 'package')
        : 'package',
      customPackageId: selectedPackage?.source !== 'ss_carrier' ? selectedPackage?.packageId ?? null : null,
      shippingProviderId: Number(selectedShipAccountId),
      weightOz: totalOz,
      length: Number(length) || 0,
      width: Number(width) || 0,
      height: Number(height) || 0,
      confirmation: confirmation === 'none' ? 'delivery' : confirmation,
      shipTo,
      ...(shipFrom ? { shipFrom } : {}),
    }
  }

  const handleCreateLabel = async (mode: 'print' | 'queue' | 'test') => {
    if (!panelOrder) return

    const previousLabelWindow = mode === 'print' ? window.open('about:blank', '_blank') : null
    if (mode === 'print' && (!previousLabelWindow || previousLabelWindow.closed || typeof previousLabelWindow.closed === 'undefined')) {
      showToast('Popup blocker prevented opening the label tab', 'error')
      return
    }

    try {
      setWorkingAction(mode)
      const payload = {
        ...resolveLabelPayload(),
        testLabel: mode === 'test',
      }

      const createResponse = await fetch('/api/labels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const labelData = await readJson<{
        shipmentId: number
        trackingNumber: string | null
        labelUrl: string | null
      }>(createResponse)

      if (mode === 'queue') {
        const primaryItem = items[0]
        const queuePayload = {
          order_id: String(panelOrder.orderId),
          order_number: panelOrder.orderNumber ?? String(panelOrder.orderId),
          client_id: Number(panelOrder.clientId ?? 1),
          label_url: labelData.labelUrl ?? '',
          sku_group_id: uniqueSkus.length === 1 ? `SKU:${uniqueSkus[0]}` : `ORDER:${panelOrder.orderId}`,
          primary_sku: typeof primaryItem?.sku === 'string' ? primaryItem.sku : null,
          item_description: typeof primaryItem?.name === 'string' ? primaryItem.name : null,
          order_qty: totalQty || 1,
          multi_sku_data: uniqueSkus.length > 1
            ? items.map((item) => ({
                sku: typeof item.sku === 'string' ? item.sku : '',
                description: typeof item.name === 'string' ? item.name : '',
                qty: asNumber(item.quantity) ?? 1,
              }))
            : null,
        }

        const queueResponse = await fetch('/api/queue/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queuePayload),
        })
        await readJson(queueResponse)
      }

      if (mode === 'print' && previousLabelWindow) {
        if (labelData.labelUrl) {
          previousLabelWindow.location.href = labelData.labelUrl
        } else {
          previousLabelWindow.close()
        }
      }

      const trackingLabel = labelData.trackingNumber ? `: ${labelData.trackingNumber}` : ''
      if (mode === 'test') {
        showToast(`Test label created${trackingLabel}`, 'success')
      } else if (mode === 'queue') {
        showToast(`Label created and queued${trackingLabel}`, 'success')
      } else {
        showToast(`Label created${trackingLabel}`, 'success')
      }

      if (mode === 'test') {
        await refreshAll()
      } else {
        await onRefresh?.()
        onClose()
      }
    } catch (error) {
      if (previousLabelWindow) {
        previousLabelWindow.close()
      }
      showToast(error instanceof Error ? error.message : 'Failed to create label', 'error')
    } finally {
      setWorkingAction(null)
      setActionMenu(null)
    }
  }

  const handleToggleResidential = async () => {
    if (!panelOrder) return

    const nextResidential = panelOrder.residential == null ? true : panelOrder.residential ? false : null
    const label = nextResidential == null ? 'auto' : nextResidential ? 'residential' : 'commercial'

    try {
      setWorkingAction('residential')
      await fetch(`/api/orders/${panelOrder.orderId}/residential`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residential: nextResidential }),
      }).then(readJson)
      showToast(`Address type set to ${label}`, 'success')
      await refreshAll()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update residential status', 'error')
    } finally {
      setWorkingAction(null)
    }
  }

  const handleMarkShippedExternal = async (source: string) => {
    if (!panelOrder) return

    try {
      setWorkingAction('external')
      await fetch(`/api/orders/${panelOrder.orderId}/shipped-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: 1, source }),
      }).then(readJson)
      showToast(`Marked shipped via ${source}`, 'success')
      await onRefresh?.()
      onClose()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to mark shipped externally', 'error')
    } finally {
      setActionMenu(null)
      setWorkingAction(null)
    }
  }

  const handleSaveDefaults = async () => {
    if (!panelOrder || uniqueSkus.length !== 1) {
      showToast('Saving SKU defaults requires a single-SKU order', 'error')
      return
    }

    const perUnitOz = totalQty > 0 ? Number((totalOz / totalQty).toFixed(2)) : totalOz
    const payload: Record<string, unknown> = {
      sku: uniqueSkus[0],
      weightOz: perUnitOz,
      length: Number(length) || 0,
      width: Number(width) || 0,
      height: Number(height) || 0,
    }

    if (selectedPackageId && selectedPackageId !== '__custom__') {
      payload.packageCode = selectedPackageId
    }

    try {
      setSavingDefaults(true)
      await fetch('/api/products/save-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(readJson)
      showToast(`Saved defaults for ${uniqueSkus[0]}`, 'success')
      setProductDefaults({
        sku: uniqueSkus[0],
        weightOz: perUnitOz,
        length: Number(length) || 0,
        width: Number(width) || 0,
        height: Number(height) || 0,
        defaultPackageCode: selectedPackageId && selectedPackageId !== '__custom__' ? selectedPackageId : null,
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save SKU defaults', 'error')
    } finally {
      setSavingDefaults(false)
    }
  }

  const handleVoidLabel = async () => {
    if (!panelOrder?.label?.shipmentId) {
      showToast('No label found to void', 'error')
      return
    }
    if (!window.confirm(`Void label for order ${panelOrder.orderNumber}?`)) {
      return
    }

    try {
      setWorkingAction('void')
      await fetch(`/api/labels/${panelOrder.label.shipmentId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(readJson)
      showToast('Label voided and refund requested', 'success')
      await onRefresh?.()
      onClose()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to void label', 'error')
    } finally {
      setWorkingAction(null)
      setActionMenu(null)
    }
  }

  const handleReturnLabel = async () => {
    if (!panelOrder?.label?.shipmentId) {
      showToast('No shipment found for this order', 'error')
      return
    }

    try {
      setWorkingAction('return')
      const payload = await fetch(`/api/labels/${panelOrder.label.shipmentId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Customer Return' }),
      }).then(readJson<{ returnTrackingNumber: string }>)
      showToast(`Return label generated: ${payload.returnTrackingNumber}`, 'success')
      await refreshAll()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create return label', 'error')
    } finally {
      setWorkingAction(null)
      setActionMenu(null)
    }
  }

  const handleReprintLabel = async () => {
    if (!panelOrder) return

    const labelWindow = window.open('about:blank', '_blank')
    if (!labelWindow || labelWindow.closed || typeof labelWindow.closed === 'undefined') {
      showToast('Popup blocker prevented opening the label tab', 'error')
      return
    }

    try {
      setWorkingAction('reprint')
      const payload = await fetch(`/api/labels/${panelOrder.orderId}/retrieve`).then(readJson<{ labelUrl: string; trackingNumber: string | null }>)
      labelWindow.location.href = payload.labelUrl
      showToast(`Label opened${payload.trackingNumber ? `: ${payload.trackingNumber}` : ''}`, 'success')
    } catch (error) {
      labelWindow.close()
      showToast(error instanceof Error ? error.message : 'Failed to retrieve label', 'error')
    } finally {
      setWorkingAction(null)
      setActionMenu(null)
    }
  }

  if (!orderId || (!panelOrder && loading === false && !error)) {
    return (
      <div className="order-panel">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', flexDirection: 'column', gap: '12px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '14px', opacity: 0.5 }}>📋</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '8px' }}>No order selected</div>
            <div style={{ fontSize: '12px', lineHeight: 1.5, marginBottom: '20px' }}>Click any row to view details</div>
            <div style={{ textAlign: 'left', fontSize: '11px', lineHeight: 2, color: 'var(--text4)', borderTop: '1px solid var(--border)', paddingTop: '14px', width: '100%', maxWidth: '180px' }}>
              <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', border: '1px solid var(--border2)' }}>↑↓</kbd> Navigate rows</div>
              <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', border: '1px solid var(--border2)' }}>Enter</kbd> Select / deselect</div>
              <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', border: '1px solid var(--border2)' }}>Esc</kbd> Deselect &amp; close</div>
              <div><kbd style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', border: '1px solid var(--border2)' }}>⌘C</kbd> Copy order #</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="order-panel open">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '8px' }}>
          <div className="spinner"></div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Loading order…</div>
        </div>
      </div>
    )
  }

  if (!panelOrder || error) {
    return (
      <div className="order-panel open">
        <div className="panel-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ fontSize: '13px', color: 'var(--text2)', textAlign: 'center' }}>⚠ {error?.message ?? 'Failed to load order'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`order-panel${orderId ? ' open' : ''}`}>
      <div className="panel-inner">
        <div className="panel-topbar" ref={menuRootRef}>
          <button
            onClick={() => prevId && onOpenOrder(prevId)}
            style={{ background: 'none', border: 'none', cursor: prevId ? 'pointer' : 'default', color: prevId ? 'var(--text2)' : 'var(--text4)', fontSize: '14px', padding: '2px 4px', borderRadius: '4px' }}
            title="Previous order"
            disabled={!prevId}
          >
            ‹
          </button>
          <button
            onClick={() => nextId && onOpenOrder(nextId)}
            style={{ background: 'none', border: 'none', cursor: nextId ? 'pointer' : 'default', color: nextId ? 'var(--text2)' : 'var(--text4)', fontSize: '14px', padding: '2px 4px', borderRadius: '4px' }}
            title="Next order"
            disabled={!nextId}
          >
            ›
          </button>

          <div className="panel-ordnum">
            <span
              className="od-order-link"
              title="Open in ShipStation"
              onClick={() => window.open(`https://ship.shipstation.com/orders/${panelOrder.orderId}`, '_blank', 'noopener')}
            >
              {panelOrder.orderNumber}
            </span>{' '}
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text3)' }}>
              {orderIndex >= 0 ? `${orderIndex + 1}/${orderIds.length}` : ''}
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            <button className="panel-topbar-btn" onClick={() => setActionMenu((current) => current === 'batch' ? null : 'batch')}>Batch ▾</button>
            {actionMenu === 'batch' ? (
              <div style={menuStyle}>
                <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderRadius: 0, justifyContent: 'flex-start' }} onClick={async () => {
                  await navigator.clipboard.writeText(panelOrder.orderNumber ?? String(panelOrder.orderId))
                  setActionMenu(null)
                  showToast('Order number copied', 'success')
                }}>
                  📋 Copy order #
                </button>
                <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => {
                  window.open(`https://ship.shipstation.com/orders/${panelOrder.orderId}`, '_blank', 'noopener')
                  setActionMenu(null)
                }}>
                  ↗ Open in ShipStation
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button className="panel-topbar-btn" onClick={() => setActionMenu((current) => current === 'print' ? null : 'print')}>Print ▾</button>
            {actionMenu === 'print' ? (
              <div style={menuStyle}>
                {!isShipped ? (
                  <>
                    <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => void handleCreateLabel('print')}>
                      🖨️ Create + Print
                    </button>
                    <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => void handleCreateLabel('queue')}>
                      📥 Send to Queue
                    </button>
                    <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => void handleCreateLabel('test')}>
                      🧪 Create Test Label
                    </button>
                  </>
                ) : (
                  <>
                    <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => void handleReprintLabel()}>
                      🖨️ Reprint Label
                    </button>
                    <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, justifyContent: 'flex-start' }} onClick={() => void handleReturnLabel()}>
                      ↩️ Return Label
                    </button>
                    <button className="panel-topbar-btn" style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border)', borderRadius: 0, justifyContent: 'flex-start', color: '#b45309' }} onClick={() => void handleVoidLabel()}>
                      ✕ Void Label
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <a className="panel-topbar-btn" href={`https://ship.shipstation.com/orders/${panelOrder.orderId}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: '10px', color: 'var(--text3)' }} title="Open in ShipStation">
            ↗ SS
          </a>

          {!isShipped ? (
            <div style={{ position: 'relative' }}>
              <button className="panel-topbar-btn" style={{ color: '#b45309', borderColor: '#fbbf24' }} onClick={() => setActionMenu((current) => current === 'external' ? null : 'external')}>
                ✈ Mark as Shipped
              </button>
              {actionMenu === 'external' ? (
                <div style={menuStyle}>
                  {EXTERNAL_SOURCES.map((source, index) => (
                    <button
                      key={source}
                      className="panel-topbar-btn"
                      style={{
                        width: '100%',
                        border: 'none',
                        borderTop: index ? '1px solid var(--border)' : 'none',
                        borderRadius: 0,
                        justifyContent: 'flex-start',
                      }}
                      onClick={() => void handleMarkShippedExternal(source)}
                    >
                      {source}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          <div className={`panel-section${shippingCollapsed ? ' collapsed' : ''}`} id="sec-shipping">
            <div className="panel-section-header" onClick={() => setShippingCollapsed((collapsed) => !collapsed)}>
              <span className="panel-section-arrow">▶</span>
              <span className="panel-section-title">Shipping</span>
              <div className="panel-section-icons">
                <span className="panel-section-icon" title="Settings">⚙</span>
                <span className="panel-section-icon" title="Grid">⊞</span>
              </div>
            </div>

            <div className="ship-req">
              Requested: <span className="ship-req-link">{(getOrderRequestedService(panelOrder) || 'Standard').replace(/_/g, ' ')}</span>
              {!panelOrder.carrierCode ? <span style={{ marginLeft: '4px' }}>(unmapped)</span> : null}
            </div>

            <div className="panel-section-body">
              <div className="ship-field-row">
                <span className="ship-field-label">Ship From</span>
                <div className="ship-field-value">
                  <select className="ship-select" id="p-location" style={{ flex: 1 }} value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} disabled={isShipped}>
                    {locations.map((location) => (
                      <option key={location.locationId} value={location.locationId}>{location.name}</option>
                    ))}
                  </select>
                  <button className="ship-icon-btn" title="Manage locations" onClick={() => showToast('Locations view migration is outside this slice', 'info')}>📍</button>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Ship Acct</span>
                <div className="ship-field-value">
                  <select className="ship-select" id="p-shipacct" style={{ flex: 1 }} value={selectedShipAccountId} onChange={(event) => setSelectedShipAccountId(event.target.value)} disabled={isShipped}>
                    <option value="">— Select Account —</option>
                    {displayAccounts.map((account) => (
                      <option key={account.shippingProviderId} value={account.shippingProviderId}>{account._label || account.nickname || account.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Service</span>
                <div className="ship-field-value">
                  <select className="ship-select" id="p-service" style={{ flex: 1 }} value={selectedService} onChange={(event) => setSelectedService(event.target.value)} disabled={isShipped}>
                    <option value="">Select Service</option>
                    {serviceOptions.map((option) => (
                      <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Weight <span id="p-wt-badge" title="Weight saved for this SKU" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green,#16a34a)', marginLeft: '3px', display: hasSavedWeight ? 'inline' : 'none' }}>✓</span></span>
                <div className="ship-field-value">
                  <input type="number" className="ship-input ship-input-sm" id="p-wtlb" min="0" step="1" value={weightLb} onChange={(event) => setWeightLb(event.target.value)} disabled={isShipped} />
                  <span className="ship-input-unit">lb</span>
                  <input type="number" className="ship-input ship-input-sm" id="p-wtoz" min="0" max="15" step="1" value={weightOz} onChange={(event) => setWeightOz(event.target.value)} disabled={isShipped} />
                  <span className="ship-input-unit">oz</span>
                </div>
              </div>

              <div className="ship-field-row">
                <span className="ship-field-label">Size <span id="p-dims-badge" title="Dims saved for this SKU" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green,#16a34a)', marginLeft: '3px', display: hasSavedDims ? 'inline' : 'none' }}>✓</span></span>
                <div className="ship-field-value" style={{ gap: '3px', flexWrap: 'wrap' }}>
                  <input type="number" className="ship-input ship-input-sm" id="p-len" min="0" step="0.1" placeholder="0" value={length} onChange={(event) => setLength(event.target.value)} disabled={isShipped} />
                  <span className="ship-input-unit">L</span>
                  <input type="number" className="ship-input ship-input-sm" id="p-wid" min="0" step="0.1" placeholder="0" value={width} onChange={(event) => setWidth(event.target.value)} disabled={isShipped} />
                  <span className="ship-input-unit">W</span>
                  <input type="number" className="ship-input ship-input-sm" id="p-hgt" min="0" step="0.1" placeholder="0" value={height} onChange={(event) => setHeight(event.target.value)} disabled={isShipped} />
                  <span className="ship-input-unit">H (in)</span>
                </div>
              </div>

              <div className="ship-field-row" style={{ borderBottom: 'none', paddingBottom: '2px' }}>
                <span className="ship-field-label">Package <span id="sku-saved-badge" title="Package saved for this SKU" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green,#16a34a)', marginLeft: '3px', display: savedPackage ? 'inline' : 'none' }}>✓</span></span>
                <div className="ship-field-value">
                  <select className="ship-select" id="p-package" style={{ flex: 1 }} value={selectedPackageId} onChange={(event) => void applyPackagePreset(event.target.value)} disabled={isShipped}>
                    <option value="">— Select Package —</option>
                    {packages
                      .filter((pkg) => pkg.source !== 'ss_carrier')
                      .map((pkg) => (
                        <option key={pkg.packageId} value={pkg.packageId}>{pkg.name}</option>
                      ))}
                    {packages.some((pkg) => pkg.source === 'ss_carrier') ? (
                      <optgroup label="Carrier Packages">
                        {packages
                          .filter((pkg) => pkg.source === 'ss_carrier')
                          .map((pkg) => (
                            <option key={pkg.packageId} value={pkg.packageId}>{pkg.name.replace(/^\[(USPS|UPS|FedEx)\]\s*/, '')}</option>
                          ))}
                      </optgroup>
                    ) : null}
                    <option value="__custom__">Custom dims…</option>
                  </select>
                  <button className="ship-icon-btn" title="Manage packages" onClick={() => showToast('Packages view migration is outside this slice', 'info')}>📐</button>
                </div>
              </div>

              <div id="p-package-dims" style={{ padding: '0 0 6px 98px', fontSize: '10px', fontWeight: 600, color: 'var(--green,#16a34a)', borderBottom: '1px solid var(--border)', display: packageDimsLabel ? 'block' : 'none' }}>
                {packageDimsLabel}
              </div>

              {!isShipped ? (
                <div style={{ padding: '4px 0', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setRateBrowserOpen(true)} style={{ fontSize: '11.5px', gap: '4px' }}>🔍 Browse Rates</button>
                  <button className="btn btn-outline btn-sm" onClick={() => void fetchPanelRates({ keepManualSelection: Boolean(selectedService) })} style={{ fontSize: '11.5px', gap: '4px' }}>🔄 Refresh Rates</button>
                  {Object.keys(PRESETS).map((presetName) => (
                    <button key={presetName} className="btn btn-ghost btn-sm" style={{ fontSize: '10.5px' }} onClick={() => applyPreset(presetName as keyof typeof PRESETS)}>
                      {presetName}
                    </button>
                  ))}
                </div>
              ) : null}

              {!isShipped ? (
                <>
                  <div className="ship-field-row">
                    <span className="ship-field-label">Confirmation</span>
                    <div className="ship-field-value">
                      <select className="ship-select" id="p-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}>
                        <option value="none">None</option>
                        <option value="delivery">Delivery</option>
                        <option value="signature">Signature</option>
                        <option value="adult_signature">Adult Signature</option>
                        <option value="direct_signature">Direct Signature</option>
                      </select>
                    </div>
                  </div>

                  <div className="ship-field-row">
                    <span className="ship-field-label">Insurance</span>
                    <div className="ship-field-value" style={{ gap: '5px', flexWrap: 'wrap' }}>
                      <select className="ship-select" id="p-insure" style={{ flex: 1 }} value={insuranceType} onChange={(event) => setInsuranceType(event.target.value)}>
                        <option value="none">None</option>
                        <option value="carrier">Carrier (up to $100)</option>
                        <option value="shipsurance">Shipsurance</option>
                      </select>
                      <input type="number" className="ship-input ship-input-sm" id="p-insure-val" min="0" step="0.01" value={insuranceValue} onChange={(event) => setInsuranceValue(event.target.value)} placeholder="$0.00" style={{ width: '68px', display: insuranceType === 'none' ? 'none' : 'inline-flex' }} title="Insured value" />
                    </div>
                  </div>
                </>
              ) : null}

              <div className="ship-rate-row">
                <span style={{ fontSize: '11.5px', color: 'var(--text2)', fontWeight: 500, width: '90px', flexShrink: 0 }}>Rate</span>
                {isShipped ? (
                  shippedRateMarkup(panelOrder, displayAccounts)
                ) : (
                  <>
                    <span className="ship-rate-val" id="panel-rate-val">
                      {rateLoading ? <span style={{ color: 'var(--text3)', fontSize: '11px' }}>Loading rates…</span> : rateMessage}
                    </span>
                    <span style={{ flex: 1 }}></span>
                    <span className="ship-scout" title="Scout review">
                      🔄 <span id="panel-scout-label">{rateLoading ? 'Loading…' : 'Scout Review'}</span>
                    </span>
                  </>
                )}
              </div>

              {!isShipped ? (
                <button className={`save-sku-btn${savingDefaults ? ' saving' : ''}`} id="saveSkuBtn" onClick={() => void handleSaveDefaults()} title="Save weight, dims & package as defaults for this SKU">
                  💾 Save weights and dims as SKU defaults
                </button>
              ) : null}
            </div>
          </div>

          {!isShipped ? (
            <div className="create-label-wrap" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="create-label-btn" id="createLabelBtn" style={{ flex: 1 }} onClick={() => void handleCreateLabel('print')} disabled={Boolean(workingAction)}>
                {workingAction === 'print' ? '⏳ Creating…' : '🖨️ Create + Print Label'} <span className="create-label-caret">▾</span>
              </button>
              <button className="create-label-btn" id="sendToQueueBtn" style={{ flex: 1, background: '#16a34a' }} onClick={() => void handleCreateLabel('queue')} disabled={Boolean(workingAction)}>
                {workingAction === 'queue' ? '⏳ Creating…' : '📥 Send to Queue'}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '10.5px', color: 'var(--text3)', padding: '4px 7px' }} onClick={() => void handleCreateLabel('test')} disabled={Boolean(workingAction)}>
                {workingAction === 'test' ? '⏳' : 'Test'}
              </button>
            </div>
          ) : null}

          {isShipped && panelOrder.label?.trackingNumber ? (
            <div className="delivery-row" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📦 Tracking:</span>
              <span
                style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}
                onClick={async () => {
                  await navigator.clipboard.writeText(panelOrder.label?.trackingNumber ?? '')
                  showToast('Tracking copied', 'success')
                }}
                title="Click to copy"
              >
                {panelOrder.label.trackingNumber}
              </span>
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto', fontSize: '10.5px' }} onClick={() => void handleReprintLabel()}>
                🖨️ Reprint
              </button>
            </div>
          ) : null}

          <div className="delivery-row" id="panel-delivery-row">{deliveryMessage}</div>

          <div className={`panel-section${itemsCollapsed ? ' collapsed' : ''}`} id="sec-items">
            <div className="panel-section-header" onClick={() => setItemsCollapsed((collapsed) => !collapsed)}>
              <span className="panel-section-arrow">▶</span>
              <span className="panel-section-title">Items</span>
              <div className="panel-section-icons">
                <span className="panel-section-icon">★</span>
                <span className="panel-section-icon">⊞</span>
              </div>
            </div>
            <div className="panel-section-body">
              {items.map((item, index) => {
                const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl : null
                const quantity = asNumber(item.quantity) ?? 1
                const unitPrice = asNumber(item.unitPrice) ?? 0
                return (
                  <div className="item-row" key={`${panelOrder.orderId}-${index}`}>
                    <div className="item-img">
                      {imageUrl ? <img src={imageUrl} style={{ width: '42px', height: '42px', borderRadius: '5px', objectFit: 'cover' }} alt="" /> : '📦'}
                    </div>
                    <div className="item-info">
                      <div className="item-name">{typeof item.name === 'string' ? item.name : 'Unknown Item'}</div>
                      <div className="item-sku">SKU: {typeof item.sku === 'string' ? item.sku : '—'}</div>
                      <div className="item-price-row">${unitPrice.toFixed(2)}&nbsp;&times;&nbsp;{quantity}&nbsp;=&nbsp;<strong>${(unitPrice * quantity).toFixed(2)}</strong></div>
                    </div>
                    <div className="item-qty">{quantity}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`panel-section${recipientCollapsed ? ' collapsed' : ''}`} id="sec-recipient">
            <div className="panel-section-header" onClick={() => setRecipientCollapsed((collapsed) => !collapsed)}>
              <span className="panel-section-arrow">▶</span>
              <span className="panel-section-title">Recipient</span>
              <div className="panel-section-icons">
                <span className="panel-section-icon">⊞</span>
              </div>
            </div>
            <div className="panel-section-body">
              <div className="recip-header">
                <span className="recip-title">Ship To</span>
                <span className="recip-edit" onClick={async () => {
                  await navigator.clipboard.writeText(addressText)
                  showToast('Address copied', 'success')
                }} title="Copy address">📋</span>
                <span className="recip-edit" onClick={() => showToast('Recipient editing is outside this slice', 'info')}>Edit</span>
              </div>
              <div className="recip-name">{shipTo.name || '—'}</div>
              <div className="recip-addr">{addressText}</div>
              {shipTo.phone ? <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '3px' }}>{shipTo.phone}</div> : null}
              <div id="panel-addr-type" style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '5px', marginBottom: '2px' }}>
                {isResidential(panelOrder) ? '🏠 Residential' : '🏢 Commercial'} {panelOrder.residential != null ? '(manual)' : '(auto)'} —{' '}
                <a href="#" onClick={(event) => {
                  event.preventDefault()
                  void handleToggleResidential()
                }} style={{ color: 'var(--ss-blue)' }}>
                  {workingAction === 'residential' ? 'saving…' : 'change'}
                </a>
              </div>
              <div className="recip-validated">
                🏠 Address Validated
                <span className="recip-revert" onClick={() => showToast('Address re-validation is outside this slice', 'info')}>Revert</span>
              </div>
              <div className="recip-tax">
                Tax Information: <span style={{ color: 'var(--text3)' }}>0 Tax IDs added</span>
                <span className="recip-tax-add" onClick={() => showToast('Tax ID editing is outside this slice', 'info')}>Add</span>
              </div>
              <div className="recip-sold" style={{ marginTop: '7px', paddingTop: '7px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', marginBottom: '4px' }}>Sold To</div>
                <div className="recip-sold-name">{getOrderCustomerUsername(panelOrder) || shipTo.name || '—'}</div>
                {panelOrder.customerEmail ? <div style={{ fontSize: '11.5px', color: 'var(--text2)' }}>{panelOrder.customerEmail}</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FullRateBrowserModal
        isOpen={rateBrowserOpen}
        order={panelOrder ? {
          orderId: panelOrder.orderId,
          orderNumber: panelOrder.orderNumber ?? String(panelOrder.orderId),
          shipTo: {
            postalCode: shipTo.postalCode,
            residential: isResidential(panelOrder),
            name: shipTo.name,
          },
          weight: panelOrder.weight ? { value: panelOrder.weight.value, units: panelOrder.weight.units } : undefined,
          dimensions: getOrderDimensions(panelOrder),
          storeId: getOrderStoreId(panelOrder) ?? undefined,
          items: Array.isArray(panelOrder.items) ? panelOrder.items.map((i: any) => ({
            sku: typeof i.sku === 'string' ? i.sku : '',
            quantity: typeof i.quantity === 'number' ? i.quantity : 1,
            adjustment: Boolean(i.adjustment),
          })) : [],
        } : null}
        onClose={() => setRateBrowserOpen(false)}
        onSelectRate={(sel: RateSelection) => {
          setSelectedShipAccountId(String(sel.shippingProviderId))
          setSelectedService(sel.serviceCode)
          if (sel.weightLb !== undefined) setWeightLb(String(sel.weightLb))
          if (sel.weightOz !== undefined) setWeightOz(String(sel.weightOz))
          if (sel.length) setLength(String(sel.length))
          if (sel.width) setWidth(String(sel.width))
          if (sel.height) setHeight(String(sel.height))
          const syntheticRate: RateDto = {
            serviceCode: sel.serviceCode,
            serviceName: sel.serviceName,
            packageType: null,
            shipmentCost: sel.shipmentCost,
            otherCost: sel.otherCost,
            rateDetails: [],
            carrierCode: sel.carrierCode,
            shippingProviderId: sel.shippingProviderId,
            carrierNickname: sel.carrierNickname ?? null,
            guaranteed: false,
            zone: null,
            sourceClientId: null,
            deliveryDays: null,
            estimatedDelivery: null,
          }
          setSelectedRate(syntheticRate)
          const total = sel.shipmentCost + sel.otherCost
          setRateMessage(`${sel.carrierNickname || sel.carrierCode} · ${sel.serviceName} · $${total.toFixed(2)}`)
        }}
      />
    </div>
  )
}
