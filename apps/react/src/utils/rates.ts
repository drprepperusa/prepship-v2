/**
 * Rate utility functions
 * Cache key generation, rate grouping, price display
 */

import type { OrderDTO, RateGroup, OrderDimensions, Rate } from '../types/orders';
import { isResidential, getOrderStoreId, getOrderWeight, getOrderZip, getOrderDimensions } from './orders';

/**
 * CRITICAL: Generate rate cache key matching V2 format EXACTLY
 * Format: ${wt}|${zip}|${dimStr}|${resFlag}|${storeId}
 * Example: 16|90210|12x8x6|C|1
 */
export function generateRateCacheKey(
  weight: number,
  zip: string,
  dims: OrderDimensions | null,
  residential: boolean,
  storeId: number
): string {
  const wt = Math.round(weight);
  const cleanZip = (zip || '').replace(/\D/g, '').slice(0, 5);
  if (cleanZip.length < 5) return ''; // Invalid zip
  const dimStr = dims ? `${dims.length}x${dims.width}x${dims.height}` : '';
  const resFlag = residential ? 'R' : 'C';
  return `${wt}|${cleanZip}|${dimStr}|${resFlag}|${storeId}`;
}

/**
 * Group orders by rate cache key
 * Returns only orders that have weight and dimensions
 */
export function groupOrdersByRateKey(orders: OrderDTO[]): RateGroup[] {
  const map = new Map<string, RateGroup>();

  for (const order of orders) {
    const wt = getOrderWeight(order);
    const dims = getOrderDimensions(order);

    // Skip incomplete orders
    if (wt <= 0) continue;
    if (!dims) continue;

    const zip = getOrderZip(order);
    const residential = isResidential(order);
    const storeId = getOrderStoreId(order);

    const key = generateRateCacheKey(wt, zip, dims, residential, storeId);
    if (!key) continue; // Invalid key

    if (!map.has(key)) {
      map.set(key, {
        key,
        wt: Math.round(wt),
        zip,
        dims,
        residential,
        storeId,
        ids: []
      });
    }

    map.get(key)!.ids.push(order.orderId);
  }

  return [...map.values()];
}

/**
 * Apply markup (percent or flat) to a rate
 */
export function applyMarkup(
  basePrice: number,
  markupPercent: number = 0,
  markupFlat: number = 0
): number {
  // Use whichever is greater (percent vs flat)
  return Math.max(
    markupPercent > 0 ? basePrice * (markupPercent / 100) : 0,
    markupFlat > 0 ? markupFlat : 0
  );
}

/**
 * Calculate final price with markup
 */
export function priceDisplay(
  basePrice: number,
  markupPercent: number = 0,
  markupFlat: number = 0
): {
  display: string;
  basePrice: number;
  markupAmount: number;
  total: number;
} {
  const markupAmt = applyMarkup(basePrice, markupPercent, markupFlat);
  const total = basePrice + markupAmt;

  return {
    display: `$${basePrice.toFixed(2)} → $${total.toFixed(2)}`,
    basePrice,
    markupAmount: markupAmt,
    total
  };
}

/**
 * Pick best rate from a list
 * Considers billing provider ID and store filters
 */
export function pickBestRate(
  rates: Rate[],
  billingProviderId?: number,
  storeId?: number
): Rate | null {
  if (!rates || rates.length === 0) return null;

  // Filter by billing provider if specified
  let candidates = rates;
  if (billingProviderId) {
    const matching = rates.filter(r => r.shippingProviderId === billingProviderId);
    if (matching.length > 0) candidates = matching;
  }

  // Find cheapest
  return candidates.reduce((best, rate) => {
    return (rate.amount < (best?.amount ?? Infinity)) ? rate : best;
  });
}

/**
 * Check if a rate is blocked
 * (Used for display styling)
 */
export function isBlockedRate(rate: Rate, blockedServices: Set<string> = new Set()): boolean {
  return blockedServices.has(rate.serviceCode);
}

/**
 * Format ETA from rate
 */
export function formatEta(rate: Rate): string {
  if (!rate.estimatedDeliveryDays) return '-';
  if (rate.estimatedDeliveryDays === 1) return '1 day';
  return `${rate.estimatedDeliveryDays} days`;
}
