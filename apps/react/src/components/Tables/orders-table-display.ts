export interface TableMarkupRule {
  carrierCode?: string | null
  providerId?: number | null
  markup: number
  markupType: 'percent' | 'flat'
}

interface RateLike {
  shippingProviderId?: number | null
  carrierCode?: string | null
  cost?: number | null
  shipmentCost?: number | null
  otherCost?: number | null
}

export function getRateBaseTotal(rate?: RateLike | null): number | null {
  if (!rate) return null
  if (typeof rate.shipmentCost === 'number') {
    return rate.shipmentCost + (rate.otherCost || 0)
  }
  if (typeof rate.cost === 'number') {
    return rate.cost
  }
  return null
}

export function applyCarrierMarkup(
  rawCost: number,
  carrierCode: string | null | undefined,
  markups: TableMarkupRule[] = [],
  providerId?: number | null,
): number {
  const rule = markups.find((entry) =>
    (providerId != null && entry.providerId === providerId)
    || (carrierCode != null && carrierCode !== '' && entry.carrierCode === carrierCode),
  )
  if (!rule) return rawCost
  if (rule.markupType === 'percent') {
    return rawCost * (1 + rule.markup / 100)
  }
  return rawCost + rule.markup
}

export function getAwaitingMarginDisplay(rate: RateLike | null | undefined, markups: TableMarkupRule[] = []): { diff: number; pct: number } | null {
  const rawCost = getRateBaseTotal(rate)
  if (rawCost == null || rawCost <= 0 || !rate?.carrierCode) return null
  const markedCost = applyCarrierMarkup(rawCost, rate.carrierCode, markups, rate.shippingProviderId)
  const diff = markedCost - rawCost
  if (diff <= 0) return null
  return {
    diff,
    pct: Math.round((diff / rawCost) * 100),
  }
}

export function formatLabelCreated(createdAt: string | number | null | undefined): string | null {
  if (createdAt == null || createdAt === '') return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null

  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]
  const hour = date.getHours() % 12 || 12
  const minute = String(date.getMinutes()).padStart(2, '0')
  const ampm = date.getHours() >= 12 ? 'pm' : 'am'

  return `${month} ${date.getDate()}, ${hour}:${minute}${ampm}`
}
