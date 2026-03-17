import assert from "node:assert/strict";
import test from "node:test";

import {
  getDiagnosticAccountNickname,
  getDiagnosticProviderId,
  getOrderDimensions,
  getSelectedRateProviderId,
  getShipAcct,
  getSortValue,
  getStoreName,
} from "../src/components/Tables/orders-table-parity.ts";

test("getSelectedRateProviderId prefers providerAccountId for shipped selected rates", () => {
  const order = {
    orderId: 1,
    orderNumber: "A-1",
    orderDate: "2026-03-17T00:00:00.000Z",
    items: [],
    selectedRate: {
      providerAccountId: 596001,
      shippingProviderId: 595995,
    },
  };

  assert.equal(getSelectedRateProviderId(order), 596001);
});

test("getShipAcct resolves the billed account from raw advanced options", () => {
  const order = {
    orderId: 1,
    orderNumber: "A-1",
    orderDate: "2026-03-17T00:00:00.000Z",
    items: [],
    raw: {
      advancedOptions: {
        billToMyOtherAccount: 433543,
      },
    },
  };

  assert.equal(
    getShipAcct(order, [{ shippingProviderId: 433543, _label: "UPS by SS - Chase x7439" }]),
    "UPS by SS - Chase x7439",
  );
});

test("getStoreName matches the V1 store-map fallback chain", () => {
  const order = {
    orderId: 1,
    orderNumber: "A-1",
    orderDate: "2026-03-17T00:00:00.000Z",
    clientName: "Fallback Client",
    items: [],
    raw: {
      advancedOptions: {
        storeId: 42,
      },
    },
  };

  assert.equal(getStoreName(order, { 42: "KF Goods" }), "KF Goods");
  assert.equal(getStoreName({ ...order, raw: {} }, {}), "Fallback Client");
});

test("getOrderDimensions reads raw dimensions when present", () => {
  const dims = getOrderDimensions({
    orderId: 1,
    orderNumber: "A-1",
    orderDate: "2026-03-17T00:00:00.000Z",
    items: [],
    raw: {
      dimensions: {
        length: 10,
        width: 8,
        height: 4,
      },
    },
  });

  assert.deepEqual(dims, { length: 10, width: 8, height: 4 });
});

test("diagnostic provider/account fields mirror the V1 shipped and awaiting precedence", () => {
  const awaitingOrder = {
    orderId: 1,
    orderNumber: "A-1",
    orderDate: "2026-03-17T00:00:00.000Z",
    orderStatus: "awaiting_shipment",
    items: [],
    bestRate: {
      shippingProviderId: 433543,
    },
  };
  const shippedOrder = {
    orderId: 2,
    orderNumber: "A-2",
    orderDate: "2026-03-17T00:00:00.000Z",
    orderStatus: "shipped",
    items: [],
    selectedRate: {
      providerAccountId: 596001,
      providerAccountNickname: "ORION",
    },
  };

  assert.equal(getDiagnosticProviderId(awaitingOrder), 433543);
  assert.equal(getDiagnosticProviderId(shippedOrder), 596001);
  assert.equal(getDiagnosticAccountNickname(shippedOrder), "ORION");
});

test("getSortValue uses the V1-specific client and shipping-account sources", () => {
  const order = {
    orderId: 1,
    orderNumber: "A-1",
    orderDate: "2026-03-17T00:00:00.000Z",
    clientName: "Fallback Client",
    items: [],
    raw: {
      advancedOptions: {
        storeId: 42,
        billToMyOtherAccount: 433543,
      },
    },
  };

  assert.equal(getSortValue(order, "client", { storeMap: { 42: "KF Goods" } }), "kf goods");
  assert.equal(
    getSortValue(order, "custcarrier", {
      carrierAccounts: [{ shippingProviderId: 433543, _label: "UPS by SS - Chase x7439" }],
    }),
    "ups by ss - chase x7439",
  );
});
