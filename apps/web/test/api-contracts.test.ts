import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchValidatedJson } from "../public/js/api-client.js";
import {
  ApiContractError,
  parseBillingConfigList,
  parseBillingDetailList,
  parseBillingReferenceRateFetchStatus,
  parseBillingSummaryList,
  parseClearAndRefetchResult,
  parseBrowseRatesResponse,
  parseBulkCachedRatesResponse,
  parseCachedRatesResponse,
  parseCarrierLookupResponse,
  parseClientDtoList,
  parseColPrefs,
  parseCreateLabelResponse,
  parseInitDataDto,
  parseInventoryItemList,
  parseInventorySkuOrdersResponse,
  parseListOrdersResponse,
  parseLocationDtoList,
  parseLocationMutationResult,
  parseOrderIdsResponse,
  parseOrderFullResponse,
  parseOrderPicklistResponse,
  parseOrdersDailyStatsDto,
  parsePackageLedgerResponse,
  parsePackageMutationResult,
  parseQueuedResult,
  parseRbMarkups,
  parseReceiveInventoryResponse,
  parseSetDefaultPackagePriceResult,
  parseSyncStatusResponse,
  parseAnalysisSkusResponse,
  parseAnalysisDailySalesResponse,
  parseProductBulkMap,
  parseSaveProductDefaultsResult,
  parseAutoCreatePackageResponse,
  parseNullablePackageDto,
} from "../public/js/api-contracts.js";

test("parseCreateLabelResponse accepts the V2 label DTO shape", () => {
  const dto = parseCreateLabelResponse({
    shipmentId: 9001,
    trackingNumber: "1Z999",
    labelUrl: "https://labels.example/9001.pdf",
    cost: 8.75,
    voided: false,
    orderStatus: "shipped",
    apiVersion: "v2",
  });

  assert.equal(dto.shipmentId, 9001);
  assert.equal(dto.labelUrl, "https://labels.example/9001.pdf");
  assert.equal(dto.apiVersion, "v2");
});

test("parseProductBulkMap rejects malformed product payloads", () => {
  assert.throws(
    () => parseProductBulkMap({
      "SKU-1": {
        sku: "SKU-1",
        weightOz: "12",
        length: 10,
        width: 8,
        height: 4,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /ProductBulkMap\.SKU-1\.weightOz/);
      return true;
    },
  );
});

test("parseSaveProductDefaultsResult accepts package resolution metadata", () => {
  const dto = parseSaveProductDefaultsResult({
    ok: true,
    resolvedPackageId: 42,
    newPackageCreated: true,
    packageData: {
      packageId: 42,
      name: "12x9x4 Box",
      length: 12,
      width: 9,
      height: 4,
      source: "custom",
    },
  });

  assert.equal(dto.ok, true);
  assert.equal(dto.resolvedPackageId, 42);
  assert.equal(dto.packageData?.name, "12x9x4 Box");
});

test("parseOrderFullResponse accepts the wrapped V2 full-order payload", () => {
  const dto = parseOrderFullResponse({
    raw: {
      orderId: 101,
      orderNumber: "A-101",
      orderStatus: "shipped",
      shipTo: { name: "Alice" },
    },
    shipments: [{
      shipmentId: 9001,
      trackingNumber: "1Z999",
      carrierCode: "ups",
      serviceCode: "ups_ground",
      shipmentCost: 8.25,
      otherCost: 0.5,
      shipDate: "2026-03-10T12:00:00Z",
      source: "prepship",
      voided: 0,
    }],
    local: {
      selected_pid: 596001,
      external_shipped: 0,
    },
  });

  assert.equal((dto.raw as Record<string, unknown>).orderNumber, "A-101");
  assert.equal((dto.shipments[0] as Record<string, unknown>).trackingNumber, "1Z999");
  assert.equal((dto.local as Record<string, unknown> | null)?.selected_pid, 596001);
});

test("parseOrderIdsResponse and parseOrderPicklistResponse accept order helper payloads", () => {
  const ids = parseOrderIdsResponse({ ids: [101, 102, 103] });
  const picklist = parseOrderPicklistResponse({
    skus: [{
      storeId: 4001,
      clientName: "Main Client",
      sku: "SKU-1",
      name: "Widget",
      imageUrl: null,
      totalQty: 2,
      orderCount: 1,
    }],
    orderStatus: "awaiting_shipment",
  });

  assert.deepEqual(ids.ids, [101, 102, 103]);
  assert.equal(picklist.skus[0]?.sku, "SKU-1");
  assert.equal(picklist.orderStatus, "awaiting_shipment");
});

test("location, package, settings, sync, and analysis parsers accept current V2 frontend payloads", () => {
  const locations = parseLocationDtoList([{
    locationId: 1,
    name: "Main Warehouse",
    company: "",
    street1: "123 Main",
    street2: "",
    city: "Torrance",
    state: "CA",
    postalCode: "90501",
    country: "US",
    phone: "",
    isDefault: true,
    active: true,
  }]);
  const locationSave = parseLocationMutationResult({ ok: true, locationId: 1 });
  const packageSave = parsePackageMutationResult({
    ok: true,
    package: {
      packageId: 42,
      name: "12x9x4 Box",
      type: "box",
      length: 12,
      width: 9,
      height: 4,
      tareWeightOz: 2,
      source: "custom",
      carrierCode: null,
      stockQty: 5,
    },
  });
  const packageLedger = parsePackageLedgerResponse([{
    id: 1,
    packageId: 42,
    delta: 10,
    reason: "restock",
    unitCost: 1.5,
    createdAt: 1710090000000,
    orderId: null,
  }]);
  const rbMarkups = parseRbMarkups({
    "596001": { type: "flat", value: 2.5 },
    ups: 1.5,
  });
  const colPrefs = parseColPrefs({
    hidden: ["tracking"],
    order: ["date", "orderNum"],
    widths: { date: 100, orderNum: 140 },
  });
  const syncStatus = parseSyncStatusResponse({
    status: "done",
    lastSync: 1710000000000,
    count: 2,
    error: null,
    page: 0,
    mode: "full",
    ratesCached: 0,
    ratePrefetchRunning: false,
  });
  const queued = parseQueuedResult({ queued: true, mode: "full" });
  const setDefault = parseSetDefaultPackagePriceResult({ ok: true, updated: 3, skipped: 1 });
  const analysisSkus = parseAnalysisSkusResponse({
    skus: [{
      sku: "SKU-1",
      name: "Widget",
      clientName: "Main Client",
      invSkuId: 11,
      orders: 2,
      qty: 3,
      pendingOrders: 0,
      externalOrders: 0,
      standardOrders: 1,
      standardShipCount: 1,
      standardAvgShipping: 10,
      standardTotalShipping: 10,
      expeditedOrders: 1,
      expeditedShipCount: 1,
      expeditedAvgShipping: 15,
      expeditedTotalShipping: 15,
      shipCountWithCost: 2,
      blendedAvgShipping: 12.5,
      totalShipping: 25,
    }],
    orderCount: 3,
  });
  const analysisDaily = parseAnalysisDailySalesResponse({
    topSkus: [{ sku: "SKU-1", name: "Widget", total: 3 }],
    dates: ["2026-03-01", "2026-03-02"],
    series: { "SKU-1": [2, 1] },
  });

  assert.equal(locations[0]?.locationId, 1);
  assert.equal(locationSave.locationId, 1);
  assert.equal(packageSave.package?.packageId, 42);
  assert.equal(packageLedger[0]?.delta, 10);
  assert.equal((rbMarkups["596001"] as Record<string, unknown>).value, 2.5);
  assert.deepEqual(colPrefs.hidden, ["tracking"]);
  assert.equal(syncStatus.mode, "full");
  assert.equal(queued.queued, true);
  assert.equal(setDefault.updated, 3);
  assert.equal(analysisSkus.skus[0]?.blendedAvgShipping, 12.5);
  assert.deepEqual(analysisDaily.series["SKU-1"], [2, 1]);
});

test("parseListOrdersResponse accepts the current top-level page/pages/total shape and keeps non-contract order data under raw", () => {
  const dto = parseListOrdersResponse({
    orders: [{
      orderId: 101,
      clientId: 1,
      clientName: "Main Client",
      orderNumber: "A-101",
      orderStatus: "awaiting_shipment",
      orderDate: "2026-03-10T10:00:00Z",
      storeId: 4001,
      customerEmail: "alice@example.com",
      shipTo: {
        name: "Alice",
        city: "Beverly Hills",
        state: "CA",
        postalCode: "90210",
      },
      carrierCode: null,
      serviceCode: null,
      weight: { value: 12, units: "ounces" },
      orderTotal: 18.5,
      shippingAmount: 0,
      residential: true,
      sourceResidential: true,
      externalShipped: false,
      bestRate: null,
      selectedRate: null,
      label: {
        shipmentId: null,
        trackingNumber: null,
        carrierCode: null,
        serviceCode: null,
        shippingProviderId: null,
        cost: null,
        rawCost: null,
        shipDate: null,
      },
      items: [{ sku: "SKU-1", quantity: 1 }],
      raw: {
        requestedShippingService: "ups_ground",
        advancedOptions: { billToMyOtherAccount: 596001 },
        dimensions: { length: 10, width: 8, height: 4 },
      },
    }],
    page: 1,
    pages: 3,
    total: 25,
  });

  assert.equal(dto.total, 25);
  assert.equal(dto.orders[0]?.shipTo?.postalCode, "90210");
  assert.equal((dto.orders[0] as Record<string, unknown>).requestedShippingService, undefined);
  assert.deepEqual((dto.orders[0]?.raw as Record<string, unknown>).advancedOptions, { billToMyOtherAccount: 596001 });
});

test("parseListOrdersResponse validates nested bestRate and selectedRate payloads", () => {
  const dto = parseListOrdersResponse({
    orders: [{
      orderId: 101,
      clientId: 1,
      clientName: "Main Client",
      orderNumber: "A-101",
      orderStatus: "shipped",
      orderDate: "2026-03-10T10:00:00Z",
      storeId: 4001,
      customerEmail: "alice@example.com",
      shipTo: null,
      carrierCode: "ups",
      serviceCode: "ups_ground",
      weight: { value: 12, units: "ounces" },
      orderTotal: 18.5,
      shippingAmount: 0,
      residential: true,
      sourceResidential: true,
      externalShipped: false,
      bestRate: {
        serviceCode: "ups_ground",
        serviceName: "UPS Ground",
        packageType: null,
        shipmentCost: 8.25,
        otherCost: 0.5,
        rateDetails: [],
        carrierCode: "ups",
        shippingProviderId: 596001,
        carrierNickname: "ORION",
        guaranteed: false,
        zone: "5",
        sourceClientId: 1,
        deliveryDays: 3,
        estimatedDelivery: "2026-03-13",
      },
      selectedRate: {
        providerAccountId: 596001,
        providerAccountNickname: "ORION",
        shippingProviderId: 596001,
        carrierCode: "ups",
        serviceCode: "ups_ground",
        serviceName: "UPS Ground",
        cost: 8.25,
        shipmentCost: 8.25,
        otherCost: 0.5,
      },
      label: {
        shipmentId: 1,
        trackingNumber: "1Z999",
        carrierCode: "ups",
        serviceCode: "ups_ground",
        shippingProviderId: 596001,
        cost: 8.75,
        rawCost: 8.25,
        shipDate: "2026-03-10",
      },
      items: [],
      raw: {},
    }],
    page: 1,
    pages: 1,
    total: 1,
  });

  assert.equal(dto.orders[0]?.bestRate?.shipmentCost, 8.25);
  assert.equal(dto.orders[0]?.selectedRate?.providerAccountId, 596001);
  assert.equal(dto.orders[0]?.selectedRate?.otherCost, 0.5);
});

test("parseListOrdersResponse rejects malformed nested selectedRate payloads", () => {
  assert.throws(
    () => parseListOrdersResponse({
      orders: [{
        orderId: 101,
        clientId: 1,
        clientName: "Main Client",
        orderNumber: "A-101",
        orderStatus: "shipped",
        orderDate: "2026-03-10T10:00:00Z",
        storeId: 4001,
        customerEmail: "alice@example.com",
        shipTo: null,
        carrierCode: "ups",
        serviceCode: "ups_ground",
        weight: null,
        orderTotal: 18.5,
        shippingAmount: 0,
        residential: true,
        sourceResidential: true,
        externalShipped: false,
        bestRate: null,
        selectedRate: {
          providerAccountId: "596001",
          providerAccountNickname: "ORION",
          shippingProviderId: 596001,
          carrierCode: "ups",
          serviceCode: "ups_ground",
          serviceName: "UPS Ground",
          cost: 8.25,
          shipmentCost: 8.25,
          otherCost: 0,
        },
        label: {
          shipmentId: null,
          trackingNumber: null,
          carrierCode: null,
          serviceCode: null,
          shippingProviderId: null,
          cost: null,
          rawCost: null,
          shipDate: null,
        },
        items: [],
        raw: {},
      }],
      page: 1,
      pages: 1,
      total: 1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /ListOrdersResponse\.orders\[0\]\.selectedRate\.providerAccountId/);
      return true;
    },
  );
});

test("parseListOrdersResponse rejects the old meta-shaped payload", () => {
  assert.throws(
    () => parseListOrdersResponse({
      orders: [],
      meta: { total: 3, page: 1, pages: 1 },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /ListOrdersResponse\.page/);
      return true;
    },
  );
});

test("parseBillingConfigList accepts the current billing config DTO array", () => {
  const dto = parseBillingConfigList([{
    clientId: 7,
    clientName: "Warehouse Co",
    pickPackFee: 3,
    additionalUnitFee: 0.75,
    packageCostMarkup: 0,
    shippingMarkupPct: 5,
    shippingMarkupFlat: 1.25,
    billing_mode: "reference_rate",
    storageFeePerCuFt: 0.125,
    storageFeeMode: "cubicft",
    palletPricingPerMonth: 12,
    palletCuFt: 80,
  }]);

  assert.equal(dto[0]?.clientId, 7);
  assert.equal(dto[0]?.billing_mode, "reference_rate");
});

test("parseBillingSummaryList rejects malformed totals", () => {
  assert.throws(
    () => parseBillingSummaryList([{
      clientId: 7,
      clientName: "Warehouse Co",
      pickPackTotal: 11.5,
      additionalTotal: 2,
      packageTotal: 1.25,
      shippingTotal: "9.50",
      storageTotal: 0,
      orderCount: 4,
      grandTotal: 14.75,
    }]),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /BillingSummaryDto\[0\]\.shippingTotal/);
      return true;
    },
  );
});

test("parseBillingDetailList accepts the current detail DTO shape", () => {
  const dto = parseBillingDetailList([{
    orderId: 101,
    orderNumber: "A-101",
    shipDate: "2026-03-10",
    totalQty: 3,
    pickpackTotal: 3,
    additionalTotal: 1.5,
    packageTotal: 0.5,
    shippingTotal: 8.25,
    actualLabelCost: 7.95,
    label_weight_oz: 12,
    label_dims_l: 10,
    label_dims_w: 8,
    label_dims_h: 4,
    ref_usps_rate: null,
    ref_ups_rate: 9.2,
    packageName: "10x8x4 Box",
    itemNames: "Widget",
    itemSkus: "SKU-1",
  }]);

  assert.equal(dto[0]?.orderId, 101);
  assert.equal(dto[0]?.ref_ups_rate, 9.2);
});

test("parseBillingReferenceRateFetchStatus rejects non-numeric counters", () => {
  assert.throws(
    () => parseBillingReferenceRateFetchStatus({
      running: true,
      total: 8,
      done: "4",
      errors: 1,
      startedAt: 1710090000000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /BillingReferenceRateFetchStatusDto\.done/);
      return true;
    },
  );
});

test("parseClientDtoList accepts the current clients DTO shape", () => {
  const dto = parseClientDtoList([{
    clientId: 9,
    name: "Client Nine",
    storeIds: [101, 102],
    contactName: "Ops",
    email: "ops@example.com",
    phone: "555-1111",
    active: true,
    hasOwnAccount: false,
    rateSourceClientId: null,
    rateSourceName: "DR PREPPER",
  }]);

  assert.equal(dto[0]?.clientId, 9);
  assert.deepEqual(dto[0]?.storeIds, [101, 102]);
});

test("parseInventoryItemList accepts inventory rows used by the copied V1 UI", () => {
  const dto = parseInventoryItemList([{
    id: 12,
    clientId: 3,
    sku: "SKU-12",
    name: "Sample Item",
    minStock: 5,
    active: true,
    weightOz: 8.5,
    parentSkuId: null,
    baseUnitQty: 1,
    packageLength: 10,
    packageWidth: 8,
    packageHeight: 4,
    productLength: 9,
    productWidth: 7,
    productHeight: 3,
    packageId: 22,
    units_per_pack: 6,
    cuFtOverride: null,
    clientName: "Client Three",
    packageName: "10x8x4 Box",
    packageDimLength: 10,
    packageDimWidth: 8,
    packageDimHeight: 4,
    parentName: null,
    currentStock: 14,
    lastMovement: 1710090000000,
    imageUrl: null,
    baseUnits: 84,
    status: "ok",
  }]);

  assert.equal(dto[0]?.sku, "SKU-12");
  assert.equal(dto[0]?.units_per_pack, 6);
});

test("parseReceiveInventoryResponse rejects malformed receive results", () => {
  assert.throws(
    () => parseReceiveInventoryResponse({
      ok: true,
      received: [{
        sku: "SKU-12",
        qty: 2,
        baseUnitQty: "6",
        baseUnits: 12,
        invSkuId: 12,
        newStock: 20,
      }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /ReceiveInventoryResponse\.received\[0\]\.baseUnitQty/);
      return true;
    },
  );
});

test("parseInventorySkuOrdersResponse accepts sku drawer payloads", () => {
  const dto = parseInventorySkuOrdersResponse({
    sku: "SKU-12",
    name: "Sample Item",
    clientId: 3,
    totalUnits: 11,
    dailySales: [
      { day: "2026-03-09", units: 4 },
      { day: "2026-03-10", units: 7 },
    ],
    orders: [{
      orderId: 101,
      orderNumber: "A-101",
      orderStatus: "awaiting_shipment",
      orderDate: "2026-03-10T10:00:00Z",
      shipToName: "Alice",
      carrierCode: null,
      serviceCode: null,
      qty: 2,
      unitPrice: 9.99,
      itemName: "Sample Item",
    }],
  });

  assert.equal(dto.totalUnits, 11);
  assert.equal(dto.orders[0]?.qty, 2);
});

test("parseInitDataDto accepts the current app bootstrap payload", () => {
  const dto = parseInitDataDto({
    stores: [{
      storeId: 4001,
      storeName: "Main Store",
      marketplaceId: null,
      marketplaceName: null,
      accountName: null,
      email: null,
      integrationUrl: null,
      active: true,
      companyName: "",
      phone: "",
      publicEmail: "",
      website: "",
      refreshDate: null,
      lastRefreshAttempt: null,
      createDate: null,
      modifyDate: null,
      autoRefresh: false,
      statusMappings: {},
    }],
    carriers: [{
      carrierId: "ups_walleted",
      carrierCode: "ups",
      shippingProviderId: 433543,
      nickname: "UPS Main",
      clientId: null,
      code: "ups_walleted",
      _label: "UPS by SS — UPS Main",
    }],
    counts: {
      byStatus: [{ orderStatus: "awaiting_shipment", cnt: 12 }],
      byStatusStore: [{ orderStatus: "awaiting_shipment", cnt: 8, storeId: 4001 }],
    },
    markups: { default: { ups: 1.5 } },
    clients: [{
      clientId: 9,
      name: "Client Nine",
      storeIds: [4001],
      contactName: "Ops",
      email: "ops@example.com",
      phone: "555-1111",
      active: true,
      hasOwnAccount: false,
      rateSourceClientId: null,
      rateSourceName: "DR PREPPER",
    }],
  });

  assert.equal(dto.stores[0]?.storeName, "Main Store");
  assert.equal(dto.carriers[0]?._label, "UPS by SS — UPS Main");
  assert.equal(dto.counts.byStatus[0]?.cnt, 12);
});

test("parseClearAndRefetchResult rejects malformed queue counts", () => {
  assert.throws(
    () => parseClearAndRefetchResult({
      ok: true,
      message: "Cache cleared successfully",
      ordersQueued: "12",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /ClearAndRefetchResult\.ordersQueued/);
      return true;
    },
  );
});

test("parseCarrierLookupResponse accepts store-specific carrier lookups", () => {
  const dto = parseCarrierLookupResponse({
    carriers: [{
      carrierId: "ups_walleted",
      carrierCode: "ups",
      shippingProviderId: 433543,
      nickname: "UPS Main",
      clientId: null,
      code: "ups_walleted",
      _label: "UPS by SS — UPS Main",
    }],
  });

  assert.equal(dto.carriers[0]?.shippingProviderId, 433543);
});

test("parseBulkCachedRatesResponse accepts cached-bulk results used by orders and batch", () => {
  const dto = parseBulkCachedRatesResponse({
    results: {
      "order-101": {
        cached: true,
        rates: [{
          serviceCode: "ups_ground",
          serviceName: "UPS Ground",
          packageType: null,
          shipmentCost: 8.25,
          otherCost: 0.5,
          rateDetails: [],
          carrierCode: "ups",
          shippingProviderId: 433543,
          carrierNickname: "UPS Main",
          guaranteed: false,
          zone: "5",
          sourceClientId: null,
          deliveryDays: 3,
          estimatedDelivery: null,
        }],
        fetchedAt: 1710090000000,
      },
      "order-102": {
        cached: false,
        best: null,
      },
    },
    missing: ["order-102"],
  });

  assert.equal(dto.results["order-101"]?.cached, true);
  assert.equal(dto.results["order-101"]?.rates?.[0]?.serviceCode, "ups_ground");
  assert.equal(dto.results["order-102"]?.best, null);
  assert.deepEqual(dto.missing, ["order-102"]);
});

test("parseCachedRatesResponse accepts cached rate payloads", () => {
  const dto = parseCachedRatesResponse({
    cached: true,
    rates: [{
      serviceCode: "ups_ground",
      serviceName: "UPS Ground",
      packageType: null,
      shipmentCost: 8.25,
      otherCost: 0.5,
      rateDetails: [],
      carrierCode: "ups",
      shippingProviderId: 433543,
      carrierNickname: "UPS Main",
      guaranteed: false,
      zone: "5",
      sourceClientId: null,
      deliveryDays: 3,
      estimatedDelivery: null,
    }],
    best: null,
    fetchedAt: 1710090000000,
  });

  assert.equal(dto.cached, true);
  assert.equal(dto.rates[0]?.serviceCode, "ups_ground");
});

test("parseNullablePackageDto and parseAutoCreatePackageResponse accept package lookup payloads", () => {
  const pkg = parseNullablePackageDto({
    packageId: 42,
    name: "12x9x4 Box",
    type: "box",
    length: 12,
    width: 9,
    height: 4,
    tareWeightOz: 2,
    source: "custom",
    carrierCode: null,
  });
  const created = parseAutoCreatePackageResponse({
    ok: true,
    package: {
      packageId: 42,
      name: "12x9x4 Box",
      type: "box",
      length: 12,
      width: 9,
      height: 4,
      tareWeightOz: 2,
      source: "custom",
      carrierCode: null,
    },
    isNew: true,
  });

  assert.equal(pkg?.packageId, 42);
  assert.equal(created.package?.name, "12x9x4 Box");
  assert.equal(created.isNew, true);
});

test("parseOrdersDailyStatsDto rejects malformed throughput counters", () => {
  assert.throws(
    () => parseOrdersDailyStatsDto({
      window: {
        from: "2026-03-10T12:00:00-08:00",
        to: "2026-03-11T12:00:00-08:00",
        fromLabel: "Tue 12:00 PM PT",
        toLabel: "Wed 12:00 PM PT",
      },
      totalOrders: "12",
      needToShip: 4,
      upcomingOrders: 1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /OrdersDailyStatsDto\.totalOrders/);
      return true;
    },
  );
});

test("parseBrowseRatesResponse rejects malformed browse rates", () => {
  assert.throws(
    () => parseBrowseRatesResponse({
      rates: [{
        serviceCode: "ups_ground",
        serviceName: "UPS Ground",
        packageType: null,
        shipmentCost: "8.25",
        otherCost: 0.5,
        rateDetails: [],
        carrierCode: "ups",
        shippingProviderId: 433543,
        carrierNickname: "UPS Main",
        guaranteed: false,
        zone: "5",
        sourceClientId: null,
        deliveryDays: 3,
        estimatedDelivery: null,
      }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiContractError);
      assert.match(error.message, /BrowseRatesResponse\.rates\[0\]\.shipmentCost/);
      return true;
    },
  );
});

test("fetchValidatedJson surfaces contract mismatches with endpoint context", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      shipmentId: "bad",
      trackingNumber: "1Z999",
      labelUrl: "https://labels.example/9001.pdf",
      cost: 8.75,
      voided: false,
      orderStatus: "shipped",
      apiVersion: "v2",
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    await assert.rejects(
      () => fetchValidatedJson("/api/labels/create", undefined, parseCreateLabelResponse),
      (error: unknown) => {
        assert.ok(error instanceof ApiContractError);
        assert.match(error.message, /\/api\/labels\/create/);
        assert.match(error.message, /shipmentId/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
