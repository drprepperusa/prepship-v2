function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function getOrderRaw(order) {
  return asObject(order?.raw) || asObject(order) || {};
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
