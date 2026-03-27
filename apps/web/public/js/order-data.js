function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getOrderRaw(order) {
  return asObject(order?.raw) || asObject(order) || {};
}

export function getOrderBestRate(order) {
  return asObject(order?.bestRate);
}

export function getOrderSelectedRate(order) {
  return asObject(order?.selectedRate);
}

export function getOrderAdvancedOptions(order) {
  return asObject(getOrderRaw(order).advancedOptions) || {};
}

export function getOrderInsuranceOptions(order) {
  return asObject(getOrderRaw(order).insuranceOptions) || {};
}

export function getOrderDimensions(order) {
  return asObject(getOrderRaw(order).dimensions) || {};
}

export function getOrderRequestedService(order) {
  const requested = getOrderRaw(order).requestedShippingService;
  return typeof requested === 'string' && requested ? requested : (order?.serviceCode || null);
}

export function getOrderNormalizedServiceCode(order) {
  const serviceCode = order?.serviceCode;
  if (typeof serviceCode === 'string' && serviceCode) return serviceCode;

  const rawServiceCode = getOrderRaw(order).serviceCode;
  return typeof rawServiceCode === 'string' && rawServiceCode ? rawServiceCode : null;
}

export function getSelectedRateProviderId(order) {
  const selectedRate = getOrderSelectedRate(order);
  if (!selectedRate) return null;

  // Priority 1: shippingProviderId (used for markup lookup in state.rbMarkups)
  const shippingProviderId = selectedRate.shippingProviderId;
  if (typeof shippingProviderId === 'number') return shippingProviderId;

  // Fallback: providerAccountId (numeric carrier account, but not ideal for markups)
  const providerAccountId = selectedRate.providerAccountId;
  return typeof providerAccountId === 'number' ? providerAccountId : null;
}

export function getSelectedRateCost(order) {
  const selectedRate = getOrderSelectedRate(order);
  if (!selectedRate) return null;

  return asFiniteNumber(selectedRate.cost)
    ?? asFiniteNumber(selectedRate.shipmentCost);
}

export function getSelectedRateTotal(order) {
  const selectedRate = getOrderSelectedRate(order);
  if (!selectedRate) return null;

  const shipmentCost = asFiniteNumber(selectedRate.shipmentCost);
  const otherCost = asFiniteNumber(selectedRate.otherCost) ?? 0;
  if (shipmentCost != null) return shipmentCost + otherCost;
  return asFiniteNumber(selectedRate.cost);
}

export function getOrderPackageCode(order) {
  const packageCode = getOrderRaw(order).packageCode;
  return typeof packageCode === 'string' && packageCode ? packageCode : null;
}

export function getOrderConfirmation(order) {
  const confirmation = getOrderRaw(order).confirmation;
  return typeof confirmation === 'string' && confirmation ? confirmation : null;
}

export function getOrderCustomerUsername(order) {
  const username = getOrderRaw(order).customerUsername;
  return typeof username === 'string' && username ? username : null;
}

export function getOrderStoreId(order) {
  return getOrderAdvancedOptions(order).storeId ?? null;
}

export function getOrderWarehouseId(order) {
  return getOrderAdvancedOptions(order).warehouseId ?? null;
}

export function getOrderBillingProviderId(order) {
  return getOrderAdvancedOptions(order).billToMyOtherAccount ?? null;
}

export function getOrderShipTo(order) {
  const rawShipTo = asObject(getOrderRaw(order).shipTo);
  return rawShipTo || order?.shipTo || {};
}

export function isExternallyFulfilledOrder(order) {
  return Boolean(getOrderRaw(order).externallyFulfilled);
}
