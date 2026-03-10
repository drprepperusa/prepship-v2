/**
 * Frontend runtime validators for the highest-risk shared DTOs.
 * These mirror the TypeScript contracts package closely enough to reject
 * obvious shape drift before bad data reaches UI code.
 */

/** @typedef {import("../../../../packages/contracts/src/labels/contracts.ts").CreateLabelResponseDto} CreateLabelResponseDto */
/** @typedef {import("../../../../packages/contracts/src/labels/contracts.ts").RetrieveLabelResponseDto} RetrieveLabelResponseDto */
/** @typedef {import("../../../../packages/contracts/src/labels/contracts.ts").VoidLabelResponseDto} VoidLabelResponseDto */
/** @typedef {import("../../../../packages/contracts/src/labels/contracts.ts").ReturnLabelResponseDto} ReturnLabelResponseDto */
/** @typedef {import("../../../../packages/contracts/src/products/contracts.ts").ProductDefaultsDto} ProductDefaultsDto */
/** @typedef {import("../../../../packages/contracts/src/products/contracts.ts").ProductBulkItemDto} ProductBulkItemDto */
/** @typedef {import("../../../../packages/contracts/src/products/contracts.ts").SaveProductDefaultsResult} SaveProductDefaultsResult */
/** @typedef {import("../../../../packages/contracts/src/packages/contracts.ts").PackageDto} PackageDto */
/** @typedef {import("../../../../packages/contracts/src/locations/contracts.ts").LocationDto} LocationDto */
/** @typedef {import("../../../../packages/contracts/src/orders/contracts.ts").ListOrdersResponse} ListOrdersResponse */
/** @typedef {import("../../../../packages/contracts/src/orders/contracts.ts").OrderFullDto} OrderFullDto */
/** @typedef {import("../../../../packages/contracts/src/orders/contracts.ts").OrdersDailyStatsDto} OrdersDailyStatsDto */
/** @typedef {import("../../../../packages/contracts/src/analysis/contracts.ts").AnalysisSkusResponse} AnalysisSkusResponse */
/** @typedef {import("../../../../packages/contracts/src/analysis/contracts.ts").AnalysisDailySalesResponse} AnalysisDailySalesResponse */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").BillingConfigDto} BillingConfigDto */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").BillingSummaryDto} BillingSummaryDto */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").BillingDetailDto} BillingDetailDto */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").BillingPackagePriceDto} BillingPackagePriceDto */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").GenerateBillingResult} GenerateBillingResult */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").FetchBillingReferenceRatesResult} FetchBillingReferenceRatesResult */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").BillingReferenceRateFetchStatusDto} BillingReferenceRateFetchStatusDto */
/** @typedef {import("../../../../packages/contracts/src/billing/contracts.ts").BackfillBillingReferenceRatesResult} BackfillBillingReferenceRatesResult */
/** @typedef {import("../../../../packages/contracts/src/clients/contracts.ts").ClientDto} ClientDto */
/** @typedef {import("../../../../packages/contracts/src/inventory/contracts.ts").InventoryItemDto} InventoryItemDto */
/** @typedef {import("../../../../packages/contracts/src/inventory/contracts.ts").InventoryLedgerEntryDto} InventoryLedgerEntryDto */
/** @typedef {import("../../../../packages/contracts/src/inventory/contracts.ts").InventoryAlertDto} InventoryAlertDto */
/** @typedef {import("../../../../packages/contracts/src/inventory/contracts.ts").ParentSkuDto} ParentSkuDto */
/** @typedef {import("../../../../packages/contracts/src/inventory/contracts.ts").ReceiveInventoryResultDto} ReceiveInventoryResultDto */
/** @typedef {import("../../../../packages/contracts/src/init/contracts.ts").InitStoreDto} InitStoreDto */
/** @typedef {import("../../../../packages/contracts/src/init/contracts.ts").CarrierAccountDto} CarrierAccountDto */
/** @typedef {import("../../../../packages/contracts/src/init/contracts.ts").InitCountsDto} InitCountsDto */
/** @typedef {import("../../../../packages/contracts/src/init/contracts.ts").InitDataDto} InitDataDto */
/** @typedef {import("../../../../packages/contracts/src/rates/contracts.ts").RateDto} RateDto */
/** @typedef {import("../../../../packages/contracts/src/rates/contracts.ts").CachedRatesResponseDto} CachedRatesResponseDto */
/** @typedef {import("../../../../packages/contracts/src/rates/contracts.ts").BulkCachedRatesResponseDto} BulkCachedRatesResponseDto */
/** @typedef {import("../../../../packages/contracts/src/rates/contracts.ts").CarrierLookupResponseDto} CarrierLookupResponseDto */

export class ApiContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiContractError";
  }
}

function fail(path, expected, actual) {
  const actualType = actual === null ? "null" : Array.isArray(actual) ? "array" : typeof actual;
  throw new ApiContractError(`${path} expected ${expected}, got ${actualType}`);
}

function expectObject(value, path) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "object", value);
  }
  return value;
}

function expectArray(value, path) {
  if (!Array.isArray(value)) {
    fail(path, "array", value);
  }
  return value;
}

function expectString(value, path) {
  if (typeof value !== "string") {
    fail(path, "string", value);
  }
  return value;
}

function expectNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "finite number", value);
  }
  return value;
}

function expectBoolean(value, path) {
  if (typeof value !== "boolean") {
    fail(path, "boolean", value);
  }
  return value;
}

function expectNullableString(value, path) {
  if (value !== null && typeof value !== "string") {
    fail(path, "string|null", value);
  }
  return value;
}

function expectNullableNumber(value, path) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    fail(path, "number|null", value);
  }
  return value;
}

function expectOptionalNullableString(value, path) {
  if (value === undefined) return value;
  return expectNullableString(value, path);
}

function expectOptionalNullableNumber(value, path) {
  if (value === undefined) return value;
  return expectNullableNumber(value, path);
}

function expectOptionalBoolean(value, path) {
  if (value === undefined) return value;
  return expectBoolean(value, path);
}

function expectNullableObject(value, path) {
  if (value === null) return value;
  return expectObject(value, path);
}

function expectOptionalNullableObject(value, path) {
  if (value === undefined) return value;
  return expectNullableObject(value, path);
}

function expectUnknownArray(value, path) {
  return expectArray(value, path);
}

function expectOptionalString(value, path) {
  if (value === undefined) return value;
  return expectString(value, path);
}

function expectOptionalNumber(value, path) {
  if (value === undefined) return value;
  return expectNumber(value, path);
}


function parsePackageData(value, path) {
  if (value == null) return null;
  const pkg = expectObject(value, path);
  return {
    packageId: expectNumber(pkg.packageId, `${path}.packageId`),
    name: expectString(pkg.name, `${path}.name`),
    length: expectNullableNumber(pkg.length, `${path}.length`),
    width: expectNullableNumber(pkg.width, `${path}.width`),
    height: expectNullableNumber(pkg.height, `${path}.height`),
    source: expectNullableString(pkg.source, `${path}.source`),
  };
}

/**
 * @param {unknown} value
 * @returns {CreateLabelResponseDto}
 */
export function parseCreateLabelResponse(value) {
  const dto = expectObject(value, "CreateLabelResponseDto");
  return {
    shipmentId: expectNumber(dto.shipmentId, "CreateLabelResponseDto.shipmentId"),
    trackingNumber: expectNullableString(dto.trackingNumber, "CreateLabelResponseDto.trackingNumber"),
    labelUrl: expectNullableString(dto.labelUrl, "CreateLabelResponseDto.labelUrl"),
    cost: expectNumber(dto.cost, "CreateLabelResponseDto.cost"),
    voided: expectBoolean(dto.voided, "CreateLabelResponseDto.voided"),
    orderStatus: expectString(dto.orderStatus, "CreateLabelResponseDto.orderStatus"),
    apiVersion: expectString(dto.apiVersion, "CreateLabelResponseDto.apiVersion"),
  };
}

/**
 * @param {unknown} value
 * @returns {RetrieveLabelResponseDto}
 */
export function parseRetrieveLabelResponse(value) {
  const dto = expectObject(value, "RetrieveLabelResponseDto");
  return {
    orderId: expectNumber(dto.orderId, "RetrieveLabelResponseDto.orderId"),
    orderNumber: expectNullableString(dto.orderNumber, "RetrieveLabelResponseDto.orderNumber"),
    shipmentId: expectNumber(dto.shipmentId, "RetrieveLabelResponseDto.shipmentId"),
    trackingNumber: expectNullableString(dto.trackingNumber, "RetrieveLabelResponseDto.trackingNumber"),
    labelUrl: expectString(dto.labelUrl, "RetrieveLabelResponseDto.labelUrl"),
    createdAt: expectNullableString(dto.createdAt, "RetrieveLabelResponseDto.createdAt"),
    carrier: expectString(dto.carrier, "RetrieveLabelResponseDto.carrier"),
    service: expectString(dto.service, "RetrieveLabelResponseDto.service"),
    cost: expectNumber(dto.cost, "RetrieveLabelResponseDto.cost"),
  };
}

/**
 * @param {unknown} value
 * @returns {VoidLabelResponseDto}
 */
export function parseVoidLabelResponse(value) {
  const dto = expectObject(value, "VoidLabelResponseDto");
  return {
    success: expectBoolean(dto.success, "VoidLabelResponseDto.success"),
    shipmentId: expectNumber(dto.shipmentId, "VoidLabelResponseDto.shipmentId"),
    orderNumber: expectNullableString(dto.orderNumber, "VoidLabelResponseDto.orderNumber"),
    voided: expectBoolean(dto.voided, "VoidLabelResponseDto.voided"),
    voidedAt: expectString(dto.voidedAt, "VoidLabelResponseDto.voidedAt"),
    trackingNumber: expectNullableString(dto.trackingNumber, "VoidLabelResponseDto.trackingNumber"),
    refundAmount: expectNullableNumber(dto.refundAmount, "VoidLabelResponseDto.refundAmount"),
    refundInitiated: expectBoolean(dto.refundInitiated, "VoidLabelResponseDto.refundInitiated"),
    refundEstimate: expectString(dto.refundEstimate, "VoidLabelResponseDto.refundEstimate"),
    note: expectString(dto.note, "VoidLabelResponseDto.note"),
  };
}

/**
 * @param {unknown} value
 * @returns {ReturnLabelResponseDto}
 */
export function parseReturnLabelResponse(value) {
  const dto = expectObject(value, "ReturnLabelResponseDto");
  return {
    success: expectBoolean(dto.success, "ReturnLabelResponseDto.success"),
    shipmentId: expectNumber(dto.shipmentId, "ReturnLabelResponseDto.shipmentId"),
    orderNumber: expectNullableString(dto.orderNumber, "ReturnLabelResponseDto.orderNumber"),
    returnTrackingNumber: expectString(dto.returnTrackingNumber, "ReturnLabelResponseDto.returnTrackingNumber"),
    returnShipmentId: expectNullableNumber(dto.returnShipmentId, "ReturnLabelResponseDto.returnShipmentId"),
    cost: expectNumber(dto.cost, "ReturnLabelResponseDto.cost"),
    reason: expectString(dto.reason, "ReturnLabelResponseDto.reason"),
    createdAt: expectString(dto.createdAt, "ReturnLabelResponseDto.createdAt"),
  };
}

/**
 * @param {unknown} value
 * @returns {ProductDefaultsDto}
 */
export function parseProductDefaults(value) {
  const dto = expectObject(value, "ProductDefaultsDto");
  return {
    sku: expectString(dto.sku, "ProductDefaultsDto.sku"),
    weightOz: expectNumber(dto.weightOz, "ProductDefaultsDto.weightOz"),
    length: expectNumber(dto.length, "ProductDefaultsDto.length"),
    width: expectNumber(dto.width, "ProductDefaultsDto.width"),
    height: expectNumber(dto.height, "ProductDefaultsDto.height"),
    defaultPackageCode: expectOptionalNullableString(dto.defaultPackageCode, "ProductDefaultsDto.defaultPackageCode"),
    _localOnly: expectOptionalBoolean(dto._localOnly, "ProductDefaultsDto._localOnly"),
  };
}

/**
 * @param {unknown} value
 * @returns {Record<string, ProductBulkItemDto>}
 */
export function parseProductBulkMap(value) {
  const dto = expectObject(value, "ProductBulkMap");
  /** @type {Record<string, ProductBulkItemDto>} */
  const result = {};
  for (const [sku, item] of Object.entries(dto)) {
    const parsed = expectObject(item, `ProductBulkMap.${sku}`);
    result[sku] = {
      sku: expectString(parsed.sku, `ProductBulkMap.${sku}.sku`),
      weightOz: expectNumber(parsed.weightOz, `ProductBulkMap.${sku}.weightOz`),
      length: expectNumber(parsed.length, `ProductBulkMap.${sku}.length`),
      width: expectNumber(parsed.width, `ProductBulkMap.${sku}.width`),
      height: expectNumber(parsed.height, `ProductBulkMap.${sku}.height`),
      defaultPackageCode: expectOptionalNullableString(parsed.defaultPackageCode, `ProductBulkMap.${sku}.defaultPackageCode`),
    };
  }
  return result;
}

/**
 * @param {unknown} value
 * @returns {SaveProductDefaultsResult}
 */
export function parseSaveProductDefaultsResult(value) {
  const dto = expectObject(value, "SaveProductDefaultsResult");
  return {
    ok: expectBoolean(dto.ok, "SaveProductDefaultsResult.ok"),
    localOnly: expectOptionalBoolean(dto.localOnly, "SaveProductDefaultsResult.localOnly"),
    productId: expectOptionalNullableNumber(dto.productId, "SaveProductDefaultsResult.productId"),
    sku: expectOptionalNullableString(dto.sku, "SaveProductDefaultsResult.sku"),
    saved: dto.saved ?? undefined,
    resolvedPackageId: expectOptionalNullableNumber(dto.resolvedPackageId, "SaveProductDefaultsResult.resolvedPackageId"),
    newPackageCreated: expectOptionalBoolean(dto.newPackageCreated, "SaveProductDefaultsResult.newPackageCreated"),
    packageData: dto.packageData === undefined ? undefined : parsePackageData(dto.packageData, "SaveProductDefaultsResult.packageData"),
  };
}

/**
 * @param {unknown} value
 * @returns {PackageDto}
 */
export function parsePackageDto(value) {
  const dto = expectObject(value, "PackageDto");
  return {
    packageId: expectNumber(dto.packageId, "PackageDto.packageId"),
    name: expectString(dto.name, "PackageDto.name"),
    type: expectString(dto.type, "PackageDto.type"),
    length: expectNumber(dto.length, "PackageDto.length"),
    width: expectNumber(dto.width, "PackageDto.width"),
    height: expectNumber(dto.height, "PackageDto.height"),
    tareWeightOz: expectNumber(dto.tareWeightOz, "PackageDto.tareWeightOz"),
    source: expectNullableString(dto.source, "PackageDto.source"),
    carrierCode: expectNullableString(dto.carrierCode, "PackageDto.carrierCode"),
    stockQty: expectOptionalNullableNumber(dto.stockQty, "PackageDto.stockQty"),
    reorderLevel: expectOptionalNullableNumber(dto.reorderLevel, "PackageDto.reorderLevel"),
    unitCost: expectOptionalNullableNumber(dto.unitCost, "PackageDto.unitCost"),
  };
}

/**
 * @param {unknown} value
 * @returns {PackageDto[]}
 */
export function parsePackageDtoList(value) {
  return expectArray(value, "PackageDtoList").map((entry, index) => parsePackageDtoWithPath(entry, `PackageDtoList[${index}]`));
}

/**
 * @param {unknown} value
 * @returns {PackageDto | null}
 */
export function parseNullablePackageDto(value) {
  if (value == null) return null;
  return parsePackageDtoWithPath(value, "NullablePackageDto");
}

function parseLocationDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    locationId: expectNumber(dto.locationId, `${path}.locationId`),
    name: expectString(dto.name, `${path}.name`),
    company: expectString(dto.company, `${path}.company`),
    street1: expectString(dto.street1, `${path}.street1`),
    street2: expectString(dto.street2, `${path}.street2`),
    city: expectString(dto.city, `${path}.city`),
    state: expectString(dto.state, `${path}.state`),
    postalCode: expectString(dto.postalCode, `${path}.postalCode`),
    country: expectString(dto.country, `${path}.country`),
    phone: expectString(dto.phone, `${path}.phone`),
    isDefault: expectBoolean(dto.isDefault, `${path}.isDefault`),
    active: expectBoolean(dto.active, `${path}.active`),
  };
}

export function parseLocationDtoList(value) {
  return expectArray(value, "LocationDto[]").map((entry, index) => parseLocationDtoWithPath(entry, `LocationDto[${index}]`));
}

export function parseLocationMutationResult(value) {
  const dto = expectObject(value, "LocationMutationResult");
  if (dto.shipFrom !== undefined && dto.shipFrom !== null) {
    const shipFrom = expectObject(dto.shipFrom, "LocationMutationResult.shipFrom");
    expectString(shipFrom.name, "LocationMutationResult.shipFrom.name");
    expectString(shipFrom.company, "LocationMutationResult.shipFrom.company");
    expectString(shipFrom.street1, "LocationMutationResult.shipFrom.street1");
    expectString(shipFrom.street2, "LocationMutationResult.shipFrom.street2");
    expectString(shipFrom.city, "LocationMutationResult.shipFrom.city");
    expectString(shipFrom.state, "LocationMutationResult.shipFrom.state");
    expectString(shipFrom.postalCode, "LocationMutationResult.shipFrom.postalCode");
    expectString(shipFrom.country, "LocationMutationResult.shipFrom.country");
    expectString(shipFrom.phone, "LocationMutationResult.shipFrom.phone");
  }
  return {
    ok: expectBoolean(dto.ok, "LocationMutationResult.ok"),
    locationId: expectOptionalNumber(dto.locationId, "LocationMutationResult.locationId"),
    shipFrom: dto.shipFrom ?? undefined,
  };
}

export function parsePackageMutationResult(value) {
  const dto = expectObject(value, "PackageMutationResult");
  return {
    ok: expectBoolean(dto.ok, "PackageMutationResult.ok"),
    packageId: expectOptionalNumber(dto.packageId, "PackageMutationResult.packageId"),
    package: dto.package === undefined || dto.package === null ? dto.package ?? undefined : parsePackageDtoWithPath(dto.package, "PackageMutationResult.package"),
  };
}

export function parsePackageLedgerResponse(value) {
  return expectArray(value, "PackageLedgerResponse").map((entry, index) => {
    const row = expectObject(entry, `PackageLedgerResponse[${index}]`);
    return {
      id: expectOptionalNumber(row.id, `PackageLedgerResponse[${index}].id`),
      packageId: expectOptionalNumber(row.packageId, `PackageLedgerResponse[${index}].packageId`),
      delta: expectNumber(row.delta, `PackageLedgerResponse[${index}].delta`),
      reason: expectOptionalNullableString(row.reason, `PackageLedgerResponse[${index}].reason`),
      unitCost: expectOptionalNullableNumber(row.unitCost, `PackageLedgerResponse[${index}].unitCost`),
      createdAt: expectNumber(row.createdAt, `PackageLedgerResponse[${index}].createdAt`),
      orderId: expectOptionalNullableNumber(row.orderId, `PackageLedgerResponse[${index}].orderId`),
    };
  });
}

export function parseRbMarkups(value) {
  const dto = expectObject(value, "RbMarkups");
  for (const [key, entry] of Object.entries(dto)) {
    if (typeof entry === "number") continue;
    const row = expectObject(entry, `RbMarkups.${key}`);
    expectString(row.type, `RbMarkups.${key}.type`);
    expectNumber(row.value, `RbMarkups.${key}.value`);
  }
  return dto;
}

export function parseColPrefs(value) {
  const dto = expectObject(value, "ColPrefs");
  if (dto.hidden !== undefined) {
    expectArray(dto.hidden, "ColPrefs.hidden").forEach((entry, index) => expectString(entry, `ColPrefs.hidden[${index}]`));
  }
  if (dto.order !== undefined) {
    expectArray(dto.order, "ColPrefs.order").forEach((entry, index) => expectString(entry, `ColPrefs.order[${index}]`));
  }
  if (dto.widths !== undefined && dto.widths !== null) {
    const widths = expectObject(dto.widths, "ColPrefs.widths");
    for (const [key, entry] of Object.entries(widths)) {
      expectNumber(entry, `ColPrefs.widths.${key}`);
    }
  }
  return dto;
}

export function parseQueuedResult(value) {
  const dto = expectObject(value, "QueuedResult");
  return {
    queued: expectBoolean(dto.queued, "QueuedResult.queued"),
    mode: expectOptionalString(dto.mode, "QueuedResult.mode"),
  };
}

export function parseSyncStatusResponse(value) {
  const dto = expectObject(value, "SyncStatusResponse");
  return {
    status: expectString(dto.status, "SyncStatusResponse.status"),
    lastSync: expectNullableNumber(dto.lastSync, "SyncStatusResponse.lastSync"),
    count: expectNumber(dto.count, "SyncStatusResponse.count"),
    error: expectNullableString(dto.error, "SyncStatusResponse.error"),
    page: expectNumber(dto.page, "SyncStatusResponse.page"),
    mode: expectString(dto.mode, "SyncStatusResponse.mode"),
    ratesCached: expectNumber(dto.ratesCached, "SyncStatusResponse.ratesCached"),
    ratePrefetchRunning: expectBoolean(dto.ratePrefetchRunning, "SyncStatusResponse.ratePrefetchRunning"),
  };
}

function parseAnalysisSkuWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    sku: expectString(dto.sku, `${path}.sku`),
    name: expectString(dto.name, `${path}.name`),
    clientName: expectString(dto.clientName, `${path}.clientName`),
    invSkuId: expectNullableNumber(dto.invSkuId, `${path}.invSkuId`),
    orders: expectNumber(dto.orders, `${path}.orders`),
    qty: expectNumber(dto.qty, `${path}.qty`),
    pendingOrders: expectNumber(dto.pendingOrders, `${path}.pendingOrders`),
    externalOrders: expectNumber(dto.externalOrders, `${path}.externalOrders`),
    standardOrders: expectNumber(dto.standardOrders, `${path}.standardOrders`),
    standardShipCount: expectNumber(dto.standardShipCount, `${path}.standardShipCount`),
    standardAvgShipping: expectNumber(dto.standardAvgShipping, `${path}.standardAvgShipping`),
    standardTotalShipping: expectNumber(dto.standardTotalShipping, `${path}.standardTotalShipping`),
    expeditedOrders: expectNumber(dto.expeditedOrders, `${path}.expeditedOrders`),
    expeditedShipCount: expectNumber(dto.expeditedShipCount, `${path}.expeditedShipCount`),
    expeditedAvgShipping: expectNumber(dto.expeditedAvgShipping, `${path}.expeditedAvgShipping`),
    expeditedTotalShipping: expectNumber(dto.expeditedTotalShipping, `${path}.expeditedTotalShipping`),
    shipCountWithCost: expectNumber(dto.shipCountWithCost, `${path}.shipCountWithCost`),
    blendedAvgShipping: expectNumber(dto.blendedAvgShipping, `${path}.blendedAvgShipping`),
    totalShipping: expectNumber(dto.totalShipping, `${path}.totalShipping`),
  };
}

export function parseAnalysisSkusResponse(value) {
  const dto = expectObject(value, "AnalysisSkusResponse");
  return {
    skus: expectArray(dto.skus, "AnalysisSkusResponse.skus").map((entry, index) => parseAnalysisSkuWithPath(entry, `AnalysisSkusResponse.skus[${index}]`)),
    orderCount: expectNumber(dto.orderCount, "AnalysisSkusResponse.orderCount"),
  };
}

export function parseAnalysisDailySalesResponse(value) {
  const dto = expectObject(value, "AnalysisDailySalesResponse");
  const topSkus = expectArray(dto.topSkus, "AnalysisDailySalesResponse.topSkus").map((entry, index) => {
    const row = expectObject(entry, `AnalysisDailySalesResponse.topSkus[${index}]`);
    return {
      sku: expectString(row.sku, `AnalysisDailySalesResponse.topSkus[${index}].sku`),
      name: expectString(row.name, `AnalysisDailySalesResponse.topSkus[${index}].name`),
      total: expectNumber(row.total, `AnalysisDailySalesResponse.topSkus[${index}].total`),
    };
  });
  const dates = expectArray(dto.dates, "AnalysisDailySalesResponse.dates").map((entry, index) => expectString(entry, `AnalysisDailySalesResponse.dates[${index}]`));
  const series = expectObject(dto.series, "AnalysisDailySalesResponse.series");
  for (const [key, entry] of Object.entries(series)) {
    expectArray(entry, `AnalysisDailySalesResponse.series.${key}`).forEach((point, index) => expectNumber(point, `AnalysisDailySalesResponse.series.${key}[${index}]`));
  }
  return { topSkus, dates, series };
}

export function parseSetDefaultPackagePriceResult(value) {
  const dto = expectObject(value, "SetDefaultPackagePriceResult");
  return {
    ok: expectBoolean(dto.ok, "SetDefaultPackagePriceResult.ok"),
    updated: expectNumber(dto.updated, "SetDefaultPackagePriceResult.updated"),
    skipped: expectNumber(dto.skipped, "SetDefaultPackagePriceResult.skipped"),
  };
}

function parsePackageDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    packageId: expectNumber(dto.packageId, `${path}.packageId`),
    name: expectString(dto.name, `${path}.name`),
    type: expectString(dto.type, `${path}.type`),
    length: expectNumber(dto.length, `${path}.length`),
    width: expectNumber(dto.width, `${path}.width`),
    height: expectNumber(dto.height, `${path}.height`),
    tareWeightOz: expectNumber(dto.tareWeightOz, `${path}.tareWeightOz`),
    source: expectNullableString(dto.source, `${path}.source`),
    carrierCode: expectNullableString(dto.carrierCode, `${path}.carrierCode`),
    stockQty: expectOptionalNullableNumber(dto.stockQty, `${path}.stockQty`),
    reorderLevel: expectOptionalNullableNumber(dto.reorderLevel, `${path}.reorderLevel`),
    unitCost: expectOptionalNullableNumber(dto.unitCost, `${path}.unitCost`),
  };
}

function parseBillingConfigWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    clientId: expectNumber(dto.clientId, `${path}.clientId`),
    clientName: expectString(dto.clientName, `${path}.clientName`),
    pickPackFee: expectNumber(dto.pickPackFee, `${path}.pickPackFee`),
    additionalUnitFee: expectNumber(dto.additionalUnitFee, `${path}.additionalUnitFee`),
    packageCostMarkup: expectNumber(dto.packageCostMarkup, `${path}.packageCostMarkup`),
    shippingMarkupPct: expectNumber(dto.shippingMarkupPct, `${path}.shippingMarkupPct`),
    shippingMarkupFlat: expectNumber(dto.shippingMarkupFlat, `${path}.shippingMarkupFlat`),
    billing_mode: expectString(dto.billing_mode, `${path}.billing_mode`),
    storageFeePerCuFt: expectNumber(dto.storageFeePerCuFt, `${path}.storageFeePerCuFt`),
    storageFeeMode: expectString(dto.storageFeeMode, `${path}.storageFeeMode`),
    palletPricingPerMonth: expectNumber(dto.palletPricingPerMonth, `${path}.palletPricingPerMonth`),
    palletCuFt: expectNumber(dto.palletCuFt, `${path}.palletCuFt`),
  };
}

/**
 * @param {unknown} value
 * @returns {BillingConfigDto[]}
 */
export function parseBillingConfigList(value) {
  return expectArray(value, "BillingConfigDto[]").map((entry, index) => parseBillingConfigWithPath(entry, `BillingConfigDto[${index}]`));
}

function parseBillingSummaryWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    clientId: expectNumber(dto.clientId, `${path}.clientId`),
    clientName: expectString(dto.clientName, `${path}.clientName`),
    pickPackTotal: expectNumber(dto.pickPackTotal, `${path}.pickPackTotal`),
    additionalTotal: expectNumber(dto.additionalTotal, `${path}.additionalTotal`),
    packageTotal: expectNumber(dto.packageTotal, `${path}.packageTotal`),
    shippingTotal: expectNumber(dto.shippingTotal, `${path}.shippingTotal`),
    storageTotal: expectNumber(dto.storageTotal, `${path}.storageTotal`),
    orderCount: expectNumber(dto.orderCount, `${path}.orderCount`),
    grandTotal: expectNumber(dto.grandTotal, `${path}.grandTotal`),
  };
}

/**
 * @param {unknown} value
 * @returns {BillingSummaryDto[]}
 */
export function parseBillingSummaryList(value) {
  return expectArray(value, "BillingSummaryDto[]").map((entry, index) => parseBillingSummaryWithPath(entry, `BillingSummaryDto[${index}]`));
}

function parseBillingDetailWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    orderId: expectNumber(dto.orderId, `${path}.orderId`),
    orderNumber: expectString(dto.orderNumber, `${path}.orderNumber`),
    shipDate: expectString(dto.shipDate, `${path}.shipDate`),
    totalQty: expectNumber(dto.totalQty, `${path}.totalQty`),
    pickpackTotal: expectNumber(dto.pickpackTotal, `${path}.pickpackTotal`),
    additionalTotal: expectNumber(dto.additionalTotal, `${path}.additionalTotal`),
    packageTotal: expectNumber(dto.packageTotal, `${path}.packageTotal`),
    shippingTotal: expectNumber(dto.shippingTotal, `${path}.shippingTotal`),
    actualLabelCost: expectNullableNumber(dto.actualLabelCost, `${path}.actualLabelCost`),
    label_weight_oz: expectNullableNumber(dto.label_weight_oz, `${path}.label_weight_oz`),
    label_dims_l: expectNullableNumber(dto.label_dims_l, `${path}.label_dims_l`),
    label_dims_w: expectNullableNumber(dto.label_dims_w, `${path}.label_dims_w`),
    label_dims_h: expectNullableNumber(dto.label_dims_h, `${path}.label_dims_h`),
    ref_usps_rate: expectNullableNumber(dto.ref_usps_rate, `${path}.ref_usps_rate`),
    ref_ups_rate: expectNullableNumber(dto.ref_ups_rate, `${path}.ref_ups_rate`),
    packageName: expectNullableString(dto.packageName, `${path}.packageName`),
    itemNames: expectNullableString(dto.itemNames, `${path}.itemNames`),
    itemSkus: expectNullableString(dto.itemSkus, `${path}.itemSkus`),
  };
}

/**
 * @param {unknown} value
 * @returns {BillingDetailDto[]}
 */
export function parseBillingDetailList(value) {
  return expectArray(value, "BillingDetailDto[]").map((entry, index) => parseBillingDetailWithPath(entry, `BillingDetailDto[${index}]`));
}

function parseBillingPackagePriceWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    packageId: expectNumber(dto.packageId, `${path}.packageId`),
    price: expectNumber(dto.price, `${path}.price`),
    is_custom: expectNumber(dto.is_custom, `${path}.is_custom`),
    name: expectString(dto.name, `${path}.name`),
    length: expectNullableNumber(dto.length, `${path}.length`),
    width: expectNullableNumber(dto.width, `${path}.width`),
    height: expectNullableNumber(dto.height, `${path}.height`),
  };
}

/**
 * @param {unknown} value
 * @returns {BillingPackagePriceDto[]}
 */
export function parseBillingPackagePriceList(value) {
  return expectArray(value, "BillingPackagePriceDto[]").map((entry, index) => parseBillingPackagePriceWithPath(entry, `BillingPackagePriceDto[${index}]`));
}

/**
 * @param {unknown} value
 * @returns {{ ok: true }}
 */
export function parseOkResult(value) {
  const dto = expectObject(value, "OkResult");
  return {
    ok: expectBoolean(dto.ok, "OkResult.ok"),
  };
}

/**
 * @param {unknown} value
 * @returns {GenerateBillingResult}
 */
export function parseGenerateBillingResult(value) {
  const dto = expectObject(value, "GenerateBillingResult");
  return {
    ok: expectBoolean(dto.ok, "GenerateBillingResult.ok"),
    generated: expectNumber(dto.generated, "GenerateBillingResult.generated"),
    total: expectNumber(dto.total, "GenerateBillingResult.total"),
  };
}

function parseBillingReferenceRateFetchStatusWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    running: expectBoolean(dto.running, `${path}.running`),
    total: expectNumber(dto.total, `${path}.total`),
    done: expectNumber(dto.done, `${path}.done`),
    errors: expectNumber(dto.errors, `${path}.errors`),
    startedAt: expectNullableNumber(dto.startedAt, `${path}.startedAt`),
  };
}

/**
 * @param {unknown} value
 * @returns {FetchBillingReferenceRatesResult}
 */
export function parseFetchBillingReferenceRatesResult(value) {
  const dto = expectObject(value, "FetchBillingReferenceRatesResult");
  return {
    ok: expectBoolean(dto.ok, "FetchBillingReferenceRatesResult.ok"),
    message: expectString(dto.message, "FetchBillingReferenceRatesResult.message"),
    total: expectOptionalNumber(dto.total, "FetchBillingReferenceRatesResult.total"),
    queued: expectOptionalNumber(dto.queued, "FetchBillingReferenceRatesResult.queued"),
    orders: expectOptionalNumber(dto.orders, "FetchBillingReferenceRatesResult.orders"),
    status: dto.status === undefined ? undefined : parseBillingReferenceRateFetchStatusWithPath(dto.status, "FetchBillingReferenceRatesResult.status"),
  };
}

/**
 * @param {unknown} value
 * @returns {BillingReferenceRateFetchStatusDto}
 */
export function parseBillingReferenceRateFetchStatus(value) {
  return parseBillingReferenceRateFetchStatusWithPath(value, "BillingReferenceRateFetchStatusDto");
}

/**
 * @param {unknown} value
 * @returns {BackfillBillingReferenceRatesResult}
 */
export function parseBackfillBillingReferenceRatesResult(value) {
  const dto = expectObject(value, "BackfillBillingReferenceRatesResult");
  return {
    ok: expectBoolean(dto.ok, "BackfillBillingReferenceRatesResult.ok"),
    filled: expectNumber(dto.filled, "BackfillBillingReferenceRatesResult.filled"),
    missing: expectNumber(dto.missing, "BackfillBillingReferenceRatesResult.missing"),
    total: expectOptionalNumber(dto.total, "BackfillBillingReferenceRatesResult.total"),
    message: expectOptionalString(dto.message, "BackfillBillingReferenceRatesResult.message"),
  };
}

function parseClientDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    clientId: expectNumber(dto.clientId, `${path}.clientId`),
    name: expectString(dto.name, `${path}.name`),
    storeIds: expectArray(dto.storeIds, `${path}.storeIds`).map((entry, index) => expectNumber(entry, `${path}.storeIds[${index}]`)),
    contactName: expectString(dto.contactName, `${path}.contactName`),
    email: expectString(dto.email, `${path}.email`),
    phone: expectString(dto.phone, `${path}.phone`),
    active: expectBoolean(dto.active, `${path}.active`),
    hasOwnAccount: expectBoolean(dto.hasOwnAccount, `${path}.hasOwnAccount`),
    rateSourceClientId: expectNullableNumber(dto.rateSourceClientId, `${path}.rateSourceClientId`),
    rateSourceName: expectString(dto.rateSourceName, `${path}.rateSourceName`),
  };
}

/**
 * @param {unknown} value
 * @returns {ClientDto[]}
 */
export function parseClientDtoList(value) {
  return expectArray(value, "ClientDto[]").map((entry, index) => parseClientDtoWithPath(entry, `ClientDto[${index}]`));
}

function parseInventoryItemWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    id: expectNumber(dto.id, `${path}.id`),
    clientId: expectNumber(dto.clientId, `${path}.clientId`),
    sku: expectString(dto.sku, `${path}.sku`),
    name: expectString(dto.name, `${path}.name`),
    minStock: expectNumber(dto.minStock, `${path}.minStock`),
    active: expectBoolean(dto.active, `${path}.active`),
    weightOz: expectNumber(dto.weightOz, `${path}.weightOz`),
    parentSkuId: expectNullableNumber(dto.parentSkuId, `${path}.parentSkuId`),
    baseUnitQty: expectNumber(dto.baseUnitQty, `${path}.baseUnitQty`),
    packageLength: expectNumber(dto.packageLength, `${path}.packageLength`),
    packageWidth: expectNumber(dto.packageWidth, `${path}.packageWidth`),
    packageHeight: expectNumber(dto.packageHeight, `${path}.packageHeight`),
    productLength: expectNumber(dto.productLength, `${path}.productLength`),
    productWidth: expectNumber(dto.productWidth, `${path}.productWidth`),
    productHeight: expectNumber(dto.productHeight, `${path}.productHeight`),
    packageId: expectNullableNumber(dto.packageId, `${path}.packageId`),
    units_per_pack: expectNumber(dto.units_per_pack, `${path}.units_per_pack`),
    cuFtOverride: expectNullableNumber(dto.cuFtOverride, `${path}.cuFtOverride`),
    clientName: expectString(dto.clientName, `${path}.clientName`),
    packageName: expectNullableString(dto.packageName, `${path}.packageName`),
    packageDimLength: expectNullableNumber(dto.packageDimLength, `${path}.packageDimLength`),
    packageDimWidth: expectNullableNumber(dto.packageDimWidth, `${path}.packageDimWidth`),
    packageDimHeight: expectNullableNumber(dto.packageDimHeight, `${path}.packageDimHeight`),
    parentName: expectNullableString(dto.parentName, `${path}.parentName`),
    currentStock: expectNumber(dto.currentStock, `${path}.currentStock`),
    lastMovement: expectNullableNumber(dto.lastMovement, `${path}.lastMovement`),
    imageUrl: expectNullableString(dto.imageUrl, `${path}.imageUrl`),
    baseUnits: expectNumber(dto.baseUnits, `${path}.baseUnits`),
    status: expectString(dto.status, `${path}.status`),
  };
}

/**
 * @param {unknown} value
 * @returns {InventoryItemDto[]}
 */
export function parseInventoryItemList(value) {
  return expectArray(value, "InventoryItemDto[]").map((entry, index) => parseInventoryItemWithPath(entry, `InventoryItemDto[${index}]`));
}

function parseInventoryLedgerEntryWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    id: expectNumber(dto.id, `${path}.id`),
    invSkuId: expectNumber(dto.invSkuId, `${path}.invSkuId`),
    type: expectString(dto.type, `${path}.type`),
    qty: expectNumber(dto.qty, `${path}.qty`),
    orderId: expectNullableNumber(dto.orderId, `${path}.orderId`),
    note: expectNullableString(dto.note, `${path}.note`),
    createdBy: expectNullableString(dto.createdBy, `${path}.createdBy`),
    createdAt: expectNumber(dto.createdAt, `${path}.createdAt`),
    sku: expectString(dto.sku, `${path}.sku`),
    skuName: expectString(dto.skuName, `${path}.skuName`),
    clientId: expectNumber(dto.clientId, `${path}.clientId`),
    clientName: expectString(dto.clientName, `${path}.clientName`),
  };
}

/**
 * @param {unknown} value
 * @returns {InventoryLedgerEntryDto[]}
 */
export function parseInventoryLedgerEntryList(value) {
  return expectArray(value, "InventoryLedgerEntryDto[]").map((entry, index) => parseInventoryLedgerEntryWithPath(entry, `InventoryLedgerEntryDto[${index}]`));
}

function parseInventoryAlertWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    type: expectString(dto.type, `${path}.type`),
    id: expectNumber(dto.id, `${path}.id`),
    sku: expectOptionalNullableString(dto.sku, `${path}.sku`),
    name: expectString(dto.name, `${path}.name`),
    stock: expectNumber(dto.stock, `${path}.stock`),
    minStock: expectNumber(dto.minStock, `${path}.minStock`),
    parentSkuId: expectNullableNumber(dto.parentSkuId, `${path}.parentSkuId`),
    status: expectString(dto.status, `${path}.status`),
  };
}

/**
 * @param {unknown} value
 * @returns {InventoryAlertDto[]}
 */
export function parseInventoryAlertList(value) {
  return expectArray(value, "InventoryAlertDto[]").map((entry, index) => parseInventoryAlertWithPath(entry, `InventoryAlertDto[${index}]`));
}

function parseParentSkuDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    parentSkuId: expectNumber(dto.parentSkuId, `${path}.parentSkuId`),
    clientId: expectNumber(dto.clientId, `${path}.clientId`),
    name: expectString(dto.name, `${path}.name`),
    sku: expectOptionalNullableString(dto.sku, `${path}.sku`),
    baseUnitQty: expectOptionalNumber(dto.baseUnitQty, `${path}.baseUnitQty`),
    childCount: expectOptionalNumber(dto.childCount, `${path}.childCount`),
    totalBaseUnits: expectOptionalNumber(dto.totalBaseUnits, `${path}.totalBaseUnits`),
    createdAt: expectOptionalNullableNumber(dto.createdAt, `${path}.createdAt`),
    updatedAt: expectOptionalNullableNumber(dto.updatedAt, `${path}.updatedAt`),
  };
}

/**
 * @param {unknown} value
 * @returns {ParentSkuDto[]}
 */
export function parseParentSkuDtoList(value) {
  return expectArray(value, "ParentSkuDto[]").map((entry, index) => parseParentSkuDtoWithPath(entry, `ParentSkuDto[${index}]`));
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, skusRegistered: number, shippedProcessed: number }}
 */
export function parseInventoryPopulateResult(value) {
  const dto = expectObject(value, "InventoryPopulateResult");
  return {
    ok: expectBoolean(dto.ok, "InventoryPopulateResult.ok"),
    skusRegistered: expectNumber(dto.skusRegistered, "InventoryPopulateResult.skusRegistered"),
    shippedProcessed: expectNumber(dto.shippedProcessed, "InventoryPopulateResult.shippedProcessed"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, updated: number, skipped: number, noMatch: number, total: number }}
 */
export function parseInventoryImportDimsResult(value) {
  const dto = expectObject(value, "InventoryImportDimsResult");
  return {
    ok: expectBoolean(dto.ok, "InventoryImportDimsResult.ok"),
    updated: expectNumber(dto.updated, "InventoryImportDimsResult.updated"),
    skipped: expectNumber(dto.skipped, "InventoryImportDimsResult.skipped"),
    noMatch: expectNumber(dto.noMatch, "InventoryImportDimsResult.noMatch"),
    total: expectNumber(dto.total, "InventoryImportDimsResult.total"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, updated: number }}
 */
export function parseInventoryBulkUpdateDimsResult(value) {
  const dto = expectObject(value, "InventoryBulkUpdateDimsResult");
  return {
    ok: expectBoolean(dto.ok, "InventoryBulkUpdateDimsResult.ok"),
    updated: expectNumber(dto.updated, "InventoryBulkUpdateDimsResult.updated"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, newStock: number }}
 */
export function parseAdjustInventoryResult(value) {
  const dto = expectObject(value, "AdjustInventoryResult");
  return {
    ok: expectBoolean(dto.ok, "AdjustInventoryResult.ok"),
    newStock: expectNumber(dto.newStock, "AdjustInventoryResult.newStock"),
  };
}

function parseReceiveInventoryItemResultWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    sku: expectString(dto.sku, `${path}.sku`),
    qty: expectNumber(dto.qty, `${path}.qty`),
    baseUnitQty: expectNumber(dto.baseUnitQty, `${path}.baseUnitQty`),
    baseUnits: expectNumber(dto.baseUnits, `${path}.baseUnits`),
    invSkuId: expectNumber(dto.invSkuId, `${path}.invSkuId`),
    newStock: expectNumber(dto.newStock, `${path}.newStock`),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, received: ReceiveInventoryResultDto[] }}
 */
export function parseReceiveInventoryResponse(value) {
  const dto = expectObject(value, "ReceiveInventoryResponse");
  return {
    ok: expectBoolean(dto.ok, "ReceiveInventoryResponse.ok"),
    received: expectArray(dto.received, "ReceiveInventoryResponse.received").map((entry, index) => parseReceiveInventoryItemResultWithPath(entry, `ReceiveInventoryResponse.received[${index}]`)),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, parentSkuId: number, sku?: string, baseUnitQty: number }}
 */
export function parseCreateParentSkuResult(value) {
  const dto = expectObject(value, "CreateParentSkuResult");
  return {
    ok: expectBoolean(dto.ok, "CreateParentSkuResult.ok"),
    parentSkuId: expectNumber(dto.parentSkuId, "CreateParentSkuResult.parentSkuId"),
    sku: expectOptionalString(dto.sku, "CreateParentSkuResult.sku"),
    baseUnitQty: expectNumber(dto.baseUnitQty, "CreateParentSkuResult.baseUnitQty"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, clients: ClientDto[] }}
 */
export function parseSyncClientsResult(value) {
  const dto = expectObject(value, "SyncClientsResult");
  return {
    ok: expectBoolean(dto.ok, "SyncClientsResult.ok"),
    clients: expectArray(dto.clients, "SyncClientsResult.clients").map((entry, index) => parseClientDtoWithPath(entry, `SyncClientsResult.clients[${index}]`)),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, clientId: number }}
 */
export function parseCreateClientResult(value) {
  const dto = expectObject(value, "CreateClientResult");
  return {
    ok: expectBoolean(dto.ok, "CreateClientResult.ok"),
    clientId: expectNumber(dto.clientId, "CreateClientResult.clientId"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ sku: string, name: string, clientId: number, totalUnits: number, dailySales: Array<{ day: string, units: number }>, orders: Array<Record<string, unknown>> }}
 */
export function parseInventorySkuOrdersResponse(value) {
  const dto = expectObject(value, "InventorySkuOrdersResponse");
  return {
    sku: expectString(dto.sku, "InventorySkuOrdersResponse.sku"),
    name: expectString(dto.name, "InventorySkuOrdersResponse.name"),
    clientId: expectNumber(dto.clientId, "InventorySkuOrdersResponse.clientId"),
    totalUnits: expectNumber(dto.totalUnits, "InventorySkuOrdersResponse.totalUnits"),
    dailySales: expectArray(dto.dailySales, "InventorySkuOrdersResponse.dailySales").map((entry, index) => {
      const row = expectObject(entry, `InventorySkuOrdersResponse.dailySales[${index}]`);
      return {
        day: expectString(row.day, `InventorySkuOrdersResponse.dailySales[${index}].day`),
        units: expectNumber(row.units, `InventorySkuOrdersResponse.dailySales[${index}].units`),
      };
    }),
    orders: expectArray(dto.orders, "InventorySkuOrdersResponse.orders").map((entry, index) => {
      const row = expectObject(entry, `InventorySkuOrdersResponse.orders[${index}]`);
      expectNumber(row.orderId, `InventorySkuOrdersResponse.orders[${index}].orderId`);
      expectNullableString(row.orderNumber, `InventorySkuOrdersResponse.orders[${index}].orderNumber`);
      expectNullableString(row.orderStatus, `InventorySkuOrdersResponse.orders[${index}].orderStatus`);
      expectNullableString(row.orderDate, `InventorySkuOrdersResponse.orders[${index}].orderDate`);
      expectNullableString(row.shipToName, `InventorySkuOrdersResponse.orders[${index}].shipToName`);
      expectOptionalNullableString(row.carrierCode, `InventorySkuOrdersResponse.orders[${index}].carrierCode`);
      expectOptionalNullableString(row.serviceCode, `InventorySkuOrdersResponse.orders[${index}].serviceCode`);
      expectOptionalNullableNumber(row.unitPrice, `InventorySkuOrdersResponse.orders[${index}].unitPrice`);
      expectOptionalNullableString(row.itemName, `InventorySkuOrdersResponse.orders[${index}].itemName`);
      expectNumber(row.qty, `InventorySkuOrdersResponse.orders[${index}].qty`);
      return row;
    }),
  };
}

function parseInitStoreDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    storeId: expectNumber(dto.storeId, `${path}.storeId`),
    storeName: expectString(dto.storeName, `${path}.storeName`),
    marketplaceId: expectNullableNumber(dto.marketplaceId, `${path}.marketplaceId`),
    marketplaceName: expectNullableString(dto.marketplaceName, `${path}.marketplaceName`),
    accountName: expectNullableString(dto.accountName, `${path}.accountName`),
    email: expectNullableString(dto.email, `${path}.email`),
    integrationUrl: expectNullableString(dto.integrationUrl, `${path}.integrationUrl`),
    active: expectBoolean(dto.active, `${path}.active`),
    companyName: expectString(dto.companyName, `${path}.companyName`),
    phone: expectString(dto.phone, `${path}.phone`),
    publicEmail: expectString(dto.publicEmail, `${path}.publicEmail`),
    website: expectString(dto.website, `${path}.website`),
    refreshDate: expectNullableString(dto.refreshDate, `${path}.refreshDate`),
    lastRefreshAttempt: expectNullableString(dto.lastRefreshAttempt, `${path}.lastRefreshAttempt`),
    createDate: expectNullableString(dto.createDate, `${path}.createDate`),
    modifyDate: expectNullableString(dto.modifyDate, `${path}.modifyDate`),
    autoRefresh: expectBoolean(dto.autoRefresh, `${path}.autoRefresh`),
    statusMappings: dto.statusMappings,
    isLocal: expectOptionalBoolean(dto.isLocal, `${path}.isLocal`),
  };
}

/**
 * @param {unknown} value
 * @returns {InitStoreDto[]}
 */
export function parseInitStoreDtoList(value) {
  return expectArray(value, "InitStoreDto[]").map((entry, index) => parseInitStoreDtoWithPath(entry, `InitStoreDto[${index}]`));
}

function parseCarrierAccountDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    carrierId: expectString(dto.carrierId, `${path}.carrierId`),
    carrierCode: expectString(dto.carrierCode, `${path}.carrierCode`),
    shippingProviderId: expectNumber(dto.shippingProviderId, `${path}.shippingProviderId`),
    nickname: expectString(dto.nickname, `${path}.nickname`),
    clientId: expectNullableNumber(dto.clientId, `${path}.clientId`),
    code: expectString(dto.code, `${path}.code`),
    _label: expectString(dto._label, `${path}._label`),
  };
}

/**
 * @param {unknown} value
 * @returns {CarrierAccountDto[]}
 */
export function parseCarrierAccountDtoList(value) {
  return expectArray(value, "CarrierAccountDto[]").map((entry, index) => parseCarrierAccountDtoWithPath(entry, `CarrierAccountDto[${index}]`));
}

function parseOrdersByStatusDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    orderStatus: expectString(dto.orderStatus, `${path}.orderStatus`),
    cnt: expectNumber(dto.cnt, `${path}.cnt`),
  };
}

function parseOrdersByStatusStoreDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    orderStatus: expectString(dto.orderStatus, `${path}.orderStatus`),
    cnt: expectNumber(dto.cnt, `${path}.cnt`),
    storeId: expectNullableNumber(dto.storeId, `${path}.storeId`),
  };
}

/**
 * @param {unknown} value
 * @returns {InitCountsDto}
 */
export function parseInitCountsDto(value) {
  const dto = expectObject(value, "InitCountsDto");
  return {
    byStatus: expectArray(dto.byStatus, "InitCountsDto.byStatus").map((entry, index) => parseOrdersByStatusDtoWithPath(entry, `InitCountsDto.byStatus[${index}]`)),
    byStatusStore: expectArray(dto.byStatusStore, "InitCountsDto.byStatusStore").map((entry, index) => parseOrdersByStatusStoreDtoWithPath(entry, `InitCountsDto.byStatusStore[${index}]`)),
  };
}

/**
 * @param {unknown} value
 * @returns {OrdersDailyStatsDto}
 */
export function parseOrdersDailyStatsDto(value) {
  const dto = expectObject(value, "OrdersDailyStatsDto");
  const window = expectObject(dto.window, "OrdersDailyStatsDto.window");
  return {
    window: {
      from: expectString(window.from, "OrdersDailyStatsDto.window.from"),
      to: expectString(window.to, "OrdersDailyStatsDto.window.to"),
      fromLabel: expectString(window.fromLabel, "OrdersDailyStatsDto.window.fromLabel"),
      toLabel: expectString(window.toLabel, "OrdersDailyStatsDto.window.toLabel"),
    },
    totalOrders: expectNumber(dto.totalOrders, "OrdersDailyStatsDto.totalOrders"),
    needToShip: expectNumber(dto.needToShip, "OrdersDailyStatsDto.needToShip"),
    upcomingOrders: expectNumber(dto.upcomingOrders, "OrdersDailyStatsDto.upcomingOrders"),
  };
}

/**
 * @param {unknown} value
 * @returns {InitDataDto}
 */
export function parseInitDataDto(value) {
  const dto = expectObject(value, "InitDataDto");
  return {
    stores: parseInitStoreDtoList(dto.stores),
    carriers: parseCarrierAccountDtoList(dto.carriers),
    counts: parseInitCountsDto(dto.counts),
    markups: expectObject(dto.markups, "InitDataDto.markups"),
    clients: parseClientDtoList(dto.clients),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, message: string, ordersQueued: number }}
 */
export function parseClearAndRefetchResult(value) {
  const dto = expectObject(value, "ClearAndRefetchResult");
  return {
    ok: expectBoolean(dto.ok, "ClearAndRefetchResult.ok"),
    message: expectString(dto.message, "ClearAndRefetchResult.message"),
    ordersQueued: expectNumber(dto.ordersQueued, "ClearAndRefetchResult.ordersQueued"),
  };
}

function parseRateDtoWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    serviceCode: expectString(dto.serviceCode, `${path}.serviceCode`),
    serviceName: expectString(dto.serviceName, `${path}.serviceName`),
    packageType: expectNullableString(dto.packageType, `${path}.packageType`),
    shipmentCost: expectNumber(dto.shipmentCost, `${path}.shipmentCost`),
    otherCost: expectNumber(dto.otherCost, `${path}.otherCost`),
    rateDetails: expectArray(dto.rateDetails, `${path}.rateDetails`),
    carrierCode: expectString(dto.carrierCode, `${path}.carrierCode`),
    shippingProviderId: expectNullableNumber(dto.shippingProviderId, `${path}.shippingProviderId`),
    carrierNickname: expectNullableString(dto.carrierNickname, `${path}.carrierNickname`),
    guaranteed: expectBoolean(dto.guaranteed, `${path}.guaranteed`),
    zone: expectNullableString(dto.zone, `${path}.zone`),
    sourceClientId: expectNullableNumber(dto.sourceClientId, `${path}.sourceClientId`),
    deliveryDays: expectNullableNumber(dto.deliveryDays, `${path}.deliveryDays`),
    estimatedDelivery: expectNullableString(dto.estimatedDelivery, `${path}.estimatedDelivery`),
  };
}

/**
 * @param {unknown} value
 * @returns {RateDto[]}
 */
export function parseRateDtoList(value) {
  return expectArray(value, "RateDto[]").map((entry, index) => parseRateDtoWithPath(entry, `RateDto[${index}]`));
}

/**
 * @param {unknown} value
 * @returns {CachedRatesResponseDto}
 */
export function parseCachedRatesResponse(value) {
  const dto = expectObject(value, "CachedRatesResponseDto");
  return {
    cached: expectBoolean(dto.cached, "CachedRatesResponseDto.cached"),
    rates: expectArray(dto.rates, "CachedRatesResponseDto.rates").map((entry, index) => parseRateDtoWithPath(entry, `CachedRatesResponseDto.rates[${index}]`)),
    best: dto.best === null ? null : parseRateDtoWithPath(dto.best, "CachedRatesResponseDto.best"),
    fetchedAt: expectOptionalNumber(dto.fetchedAt, "CachedRatesResponseDto.fetchedAt"),
  };
}

function parseBulkCachedRatesItemResultWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    cached: expectBoolean(dto.cached, `${path}.cached`),
    rates: dto.rates === undefined ? undefined : expectArray(dto.rates, `${path}.rates`).map((entry, index) => parseRateDtoWithPath(entry, `${path}.rates[${index}]`)),
    best: dto.best === undefined ? undefined : dto.best === null ? null : parseRateDtoWithPath(dto.best, `${path}.best`),
    fetchedAt: expectOptionalNumber(dto.fetchedAt, `${path}.fetchedAt`),
  };
}

/**
 * @param {unknown} value
 * @returns {BulkCachedRatesResponseDto}
 */
export function parseBulkCachedRatesResponse(value) {
  const dto = expectObject(value, "BulkCachedRatesResponseDto");
  const results = expectObject(dto.results, "BulkCachedRatesResponseDto.results");
  /** @type {Record<string, import("../../../../packages/contracts/src/rates/contracts.ts").BulkCachedRatesItemResult>} */
  const parsedResults = {};
  for (const [key, item] of Object.entries(results)) {
    parsedResults[key] = parseBulkCachedRatesItemResultWithPath(item, `BulkCachedRatesResponseDto.results.${key}`);
  }
  return {
    results: parsedResults,
    missing: expectArray(dto.missing, "BulkCachedRatesResponseDto.missing").map((entry, index) => expectString(entry, `BulkCachedRatesResponseDto.missing[${index}]`)),
  };
}

/**
 * @param {unknown} value
 * @returns {CarrierLookupResponseDto}
 */
export function parseCarrierLookupResponse(value) {
  const dto = expectObject(value, "CarrierLookupResponseDto");
  return {
    carriers: expectArray(dto.carriers, "CarrierLookupResponseDto.carriers").map((entry, index) => parseCarrierAccountDtoWithPath(entry, `CarrierLookupResponseDto.carriers[${index}]`)),
  };
}

/**
 * @param {unknown} value
 * @returns {{ rates: RateDto[] }}
 */
export function parseBrowseRatesResponse(value) {
  const dto = expectObject(value, "BrowseRatesResponse");
  return {
    rates: expectArray(dto.rates, "BrowseRatesResponse.rates").map((entry, index) => parseRateDtoWithPath(entry, `BrowseRatesResponse.rates[${index}]`)),
  };
}

/**
 * @param {unknown} value
 * @returns {RateDto[]}
 */
export function parseLiveRatesResponse(value) {
  return expectArray(value, "LiveRatesResponse").map((entry, index) => parseRateDtoWithPath(entry, `LiveRatesResponse[${index}]`));
}

function parseOrderShipmentWithPath(value, path) {
  const dto = expectObject(value, path);
  expectOptionalNumber(dto.shipmentId, `${path}.shipmentId`);
  expectOptionalNullableString(dto.trackingNumber, `${path}.trackingNumber`);
  expectOptionalNullableString(dto.carrierCode, `${path}.carrierCode`);
  expectOptionalNullableString(dto.serviceCode, `${path}.serviceCode`);
  expectOptionalNullableNumber(dto.shipmentCost, `${path}.shipmentCost`);
  expectOptionalNullableNumber(dto.otherCost, `${path}.otherCost`);
  expectOptionalNullableString(dto.shipDate, `${path}.shipDate`);
  expectOptionalNullableString(dto.source, `${path}.source`);
  expectOptionalNullableNumber(dto.voided, `${path}.voided`);
  return dto;
}

/**
 * @param {unknown} value
 * @returns {OrderFullDto}
 */
export function parseOrderFullResponse(value) {
  const dto = expectObject(value, "OrderFullResponse");
  return {
    raw: expectObject(dto.raw, "OrderFullResponse.raw"),
    shipments: expectArray(dto.shipments, "OrderFullResponse.shipments").map((entry, index) => parseOrderShipmentWithPath(entry, `OrderFullResponse.shipments[${index}]`)),
    local: expectNullableObject(dto.local, "OrderFullResponse.local"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: boolean, package: PackageDto | null, isNew: boolean }}
 */
export function parseAutoCreatePackageResponse(value) {
  const dto = expectObject(value, "AutoCreatePackageResponse");
  return {
    ok: expectBoolean(dto.ok, "AutoCreatePackageResponse.ok"),
    package: dto.package === null ? null : parsePackageDtoWithPath(dto.package, "AutoCreatePackageResponse.package"),
    isNew: expectBoolean(dto.isNew, "AutoCreatePackageResponse.isNew"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: boolean, orderId: number, orderStatus: string }}
 */
export function parseOrderStatusMutationResponse(value) {
  const dto = expectObject(value, "OrderStatusMutationResponse");
  return {
    ok: expectBoolean(dto.ok, "OrderStatusMutationResponse.ok"),
    orderId: expectNumber(dto.orderId, "OrderStatusMutationResponse.orderId"),
    orderStatus: expectString(dto.orderStatus, "OrderStatusMutationResponse.orderStatus"),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ids: number[] }}
 */
export function parseOrderIdsResponse(value) {
  const dto = expectObject(value, "OrderIdsResponse");
  return {
    ids: expectArray(dto.ids, "OrderIdsResponse.ids").map((entry, index) => expectNumber(entry, `OrderIdsResponse.ids[${index}]`)),
  };
}

function parseOrderPicklistItemWithPath(value, path) {
  const dto = expectObject(value, path);
  return {
    storeId: expectNullableNumber(dto.storeId, `${path}.storeId`),
    clientName: expectString(dto.clientName, `${path}.clientName`),
    sku: expectString(dto.sku, `${path}.sku`),
    name: expectNullableString(dto.name, `${path}.name`),
    imageUrl: expectNullableString(dto.imageUrl, `${path}.imageUrl`),
    totalQty: expectNumber(dto.totalQty, `${path}.totalQty`),
    orderCount: expectNumber(dto.orderCount, `${path}.orderCount`),
  };
}

/**
 * @param {unknown} value
 * @returns {{ skus: Array<{ storeId: number | null, clientName: string, sku: string, name: string | null, imageUrl: string | null, totalQty: number, orderCount: number }>, orderStatus?: string }}
 */
export function parseOrderPicklistResponse(value) {
  const dto = expectObject(value, "OrderPicklistResponse");
  return {
    skus: expectArray(dto.skus, "OrderPicklistResponse.skus").map((entry, index) => parseOrderPicklistItemWithPath(entry, `OrderPicklistResponse.skus[${index}]`)),
    orderStatus: expectOptionalString(dto.orderStatus, "OrderPicklistResponse.orderStatus"),
  };
}

/**
 * Validate the stable order list contract while preserving any extra parity fields
 * still relied on by the copied V1 UI.
 *
 * @param {unknown} value
 * @returns {ListOrdersResponse}
 */
export function parseListOrdersResponse(value) {
  const dto = expectObject(value, "ListOrdersResponse");
  const orders = expectArray(dto.orders, "ListOrdersResponse.orders").map((orderValue, index) => {
    const path = `ListOrdersResponse.orders[${index}]`;
    const order = expectObject(orderValue, path);
    const shipTo = order.shipTo === undefined ? null : expectNullableObject(order.shipTo, `${path}.shipTo`);
    const label = expectObject(order.label, `${path}.label`);
    const weight = order.weight === undefined ? null : expectNullableObject(order.weight, `${path}.weight`);

    if (shipTo) {
      expectNullableString(shipTo.name, `${path}.shipTo.name`);
      expectNullableString(shipTo.city, `${path}.shipTo.city`);
      expectNullableString(shipTo.state, `${path}.shipTo.state`);
      expectNullableString(shipTo.postalCode, `${path}.shipTo.postalCode`);
    }

    if (weight) {
      expectNumber(weight.value, `${path}.weight.value`);
      expectString(weight.units, `${path}.weight.units`);
    }

    expectNullableNumber(order.clientId, `${path}.clientId`);
    expectOptionalNullableString(order.clientName, `${path}.clientName`);
    expectNullableString(order.orderNumber, `${path}.orderNumber`);
    expectString(order.orderStatus, `${path}.orderStatus`);
    expectNullableString(order.orderDate, `${path}.orderDate`);
    expectNullableNumber(order.storeId, `${path}.storeId`);
    expectNullableString(order.customerEmail, `${path}.customerEmail`);
    expectOptionalNullableString(order.carrierCode, `${path}.carrierCode`);
    expectOptionalNullableString(order.serviceCode, `${path}.serviceCode`);
    expectOptionalNullableNumber(order.orderTotal, `${path}.orderTotal`);
    expectOptionalNullableNumber(order.shippingAmount, `${path}.shippingAmount`);
    expectNullableBoolean(order.residential, `${path}.residential`);
    expectNullableBoolean(order.sourceResidential, `${path}.sourceResidential`);
    expectBoolean(order.externalShipped, `${path}.externalShipped`);
    expectUnknownArray(order.items, `${path}.items`);

    expectNullableNumber(label.shipmentId, `${path}.label.shipmentId`);
    expectNullableString(label.trackingNumber, `${path}.label.trackingNumber`);
    expectNullableString(label.carrierCode, `${path}.label.carrierCode`);
    expectNullableString(label.serviceCode, `${path}.label.serviceCode`);
    expectNullableNumber(label.shippingProviderId, `${path}.label.shippingProviderId`);
    expectNullableNumber(label.cost, `${path}.label.cost`);
    expectNullableNumber(label.rawCost, `${path}.label.rawCost`);
    expectNullableString(label.shipDate, `${path}.label.shipDate`);

    return {
      orderId: expectNumber(order.orderId, `${path}.orderId`),
      clientId: order.clientId ?? null,
      clientName: order.clientName ?? null,
      orderNumber: order.orderNumber ?? null,
      orderStatus: order.orderStatus,
      orderDate: order.orderDate ?? null,
      storeId: order.storeId ?? null,
      customerEmail: order.customerEmail ?? null,
      shipTo: shipTo
        ? {
            name: shipTo.name ?? null,
            city: shipTo.city ?? null,
            state: shipTo.state ?? null,
            postalCode: shipTo.postalCode ?? null,
          }
        : null,
      carrierCode: order.carrierCode ?? null,
      serviceCode: order.serviceCode ?? null,
      weight: weight
        ? {
            value: weight.value,
            units: weight.units,
          }
        : null,
      orderTotal: order.orderTotal ?? null,
      shippingAmount: order.shippingAmount ?? null,
      residential: order.residential ?? null,
      sourceResidential: order.sourceResidential ?? null,
      externalShipped: order.externalShipped,
      bestRate: order.bestRate ?? null,
      selectedRate: order.selectedRate ?? null,
      label: {
        shipmentId: label.shipmentId ?? null,
        trackingNumber: label.trackingNumber ?? null,
        carrierCode: label.carrierCode ?? null,
        serviceCode: label.serviceCode ?? null,
        shippingProviderId: label.shippingProviderId ?? null,
        cost: label.cost ?? null,
        rawCost: label.rawCost ?? null,
        shipDate: label.shipDate ?? null,
      },
      items: order.items,
      raw: order.raw,
    };
  });

  return {
    orders,
    page: expectNumber(dto.page, "ListOrdersResponse.page"),
    pages: expectNumber(dto.pages, "ListOrdersResponse.pages"),
    total: expectNumber(dto.total, "ListOrdersResponse.total"),
  };
}

function expectNullableBoolean(value, path) {
  if (value !== null && typeof value !== "boolean") {
    fail(path, "boolean|null", value);
  }
  return value;
}
