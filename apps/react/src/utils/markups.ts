/**
 * Markup calculation and application utilities
 * Core business logic for carrier markups
 */

import type { Rate } from '../types/orders';
import type { Markup, MarkupType, MarkupsMap } from '../types/markups';

// Re-export MarkupType so callers can use it
export type { MarkupType };

/**
 * Get markup for a carrier by shippingProviderId or carrierCode
 * Falls back from PID to carrier code
 */
export function getCarrierMarkup(
  carrierCode: string | undefined,
  shippingProviderId: number | undefined,
  markupsMap: MarkupsMap
): Markup {
  // Priority 1: Look up by shippingProviderId
  if (shippingProviderId && markupsMap[shippingProviderId]) {
    return markupsMap[shippingProviderId];
  }

  // Priority 2: Look up by carrier code
  if (carrierCode && markupsMap[carrierCode]) {
    return markupsMap[carrierCode];
  }

  // Default: no markup
  return { type: 'flat', value: 0 };
}

/**
 * Apply markup to a rate using shippingProviderId lookup
 * Returns final price INCLUDING markup
 */
export function applyCarrierMarkup(
  rate: Rate,
  markupsMap: MarkupsMap
): number {
  const baseCost = (rate.shipmentCost ?? rate.amount ?? 0) + (rate.otherCost ?? 0);
  const markup = getCarrierMarkup(rate.carrierCode, rate.shippingProviderId, markupsMap);

  if (!markup || !markup.value) return baseCost;

  return markup.type === 'pct'
    ? baseCost * (1 + markup.value / 100)
    : baseCost + markup.value;
}

/**
 * Pick best (cheapest) rate AFTER markup applied
 * Filters out blocked rates (based on storeId)
 */
export function pickBestRate(
  rates: Rate[] | null,
  markupsMap: MarkupsMap,
  storeId?: number
): Rate | null {
  if (!rates || rates.length === 0) return null;

  // Filter to available rates (not blocked)
  const available = rates.filter(r => {
    const baseCost = (r.shipmentCost ?? r.amount ?? 0) + (r.otherCost ?? 0);
    return baseCost > 0 && !isBlockedRate(r, storeId);
  });

  if (available.length === 0) return null;

  // Find cheapest after markup applied
  return available.reduce((best, current) => {
    const bestPrice = applyCarrierMarkup(best, markupsMap);
    const currentPrice = applyCarrierMarkup(current, markupsMap);
    return currentPrice < bestPrice ? current : best;
  });
}

/**
 * Check if rate is blocked for a store (rate blocking rules per store)
 * Implementation depends on how blocking is stored — may be in Store config
 */
export function isBlockedRate(_rate: Rate, _storeId?: number): boolean {
  // TODO: Implement store-specific rate blocking
  // For now, no rates are blocked
  return false;
}

/**
 * Check if a rate is from ORION account
 * ORION identification: shippingProviderId = 596001 OR nickname contains 'ORI'
 */
export function isOrionRate(rate: Rate): boolean {
  if (!rate) return false;
  if (rate.shippingProviderId === 596001) return true;
  const nickname = (rate.carrierNickname ?? '').toUpperCase();
  return nickname.includes('ORI');
}

/**
 * Calculate price display with markup breakdown
 * Returns: { display: string, basePrice, markupAmount, total }
 */
export function priceDisplay(
  rate: Rate,
  markupsMap: MarkupsMap
): {
  display: string;
  basePrice: number;
  markupAmount: number;
  total: number;
} {
  const basePrice = (rate.shipmentCost ?? rate.amount ?? 0) + (rate.otherCost ?? 0);
  const markup = getCarrierMarkup(rate.carrierCode, rate.shippingProviderId, markupsMap);

  let markupAmount = 0;
  if (markup && markup.value) {
    markupAmount = markup.type === 'pct'
      ? basePrice * (markup.value / 100)
      : markup.value;
  }

  const total = basePrice + markupAmount;

  return {
    display: `$${basePrice.toFixed(2)} → $${total.toFixed(2)}`,
    basePrice,
    markupAmount,
    total
  };
}

/**
 * Format HTML for ORION rate display
 * ORION rates ALWAYS show both marked price (top) and base cost (bottom)
 * This ensures transparency on custom account pricing
 */
export function formatOrionRateDisplay(
  rate: Rate,
  markupsMap: MarkupsMap,
  opts?: {
    mainSize?: string;
    subSize?: string;
    mainColor?: string;
  }
): string {
  if (!isOrionRate(rate)) return '';

  const baseCost = (rate.shipmentCost ?? rate.amount ?? 0) + (rate.otherCost ?? 0);
  const markedCost = applyCarrierMarkup(rate, markupsMap);

  const mainSize = opts?.mainSize || '13px';
  const subSize = opts?.subSize || '10px';
  const mainColor = opts?.mainColor || 'var(--green)';

  if (baseCost < 0.005 && markedCost < 0.005) {
    return `<span style="color:var(--text3);font-size:${mainSize}">N/A</span>`;
  }

  return `<div style="line-height:1.3">
    <strong style="color:${mainColor};font-size:${mainSize}">$${markedCost.toFixed(2)}</strong>
    <div style="font-size:${subSize};color:var(--text3)">$${baseCost.toFixed(2)} cost</div>
  </div>`;
}
