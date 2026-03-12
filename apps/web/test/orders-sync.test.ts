import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrdersQueryParams, didOrdersResponseChange } from "../public/js/orders-sync.js";

test("buildOrdersQueryParams includes the same filter fields used by initial load and polling", () => {
  const params = buildOrdersQueryParams({
    page: 3,
    pageSize: 50,
    orderStatus: "awaiting_shipment",
    storeId: "42",
    range: {
      start: new Date("2026-02-10T08:00:00.000Z"),
      end: new Date("2026-03-12T07:59:59.000Z"),
    },
  });

  assert.equal(params.get("page"), "3");
  assert.equal(params.get("pageSize"), "50");
  assert.equal(params.get("orderStatus"), "awaiting_shipment");
  assert.equal(params.get("storeId"), "42");
  assert.equal(params.get("dateStart"), "2026-02-10T08:00:00.000Z");
  assert.equal(params.get("dateEnd"), "2026-03-12T07:59:59.000Z");
});

test("didOrdersResponseChange catches order removals and non-cost payload changes", () => {
  const previous = {
    page: 1,
    pages: 1,
    total: 2,
    orders: [
      { orderId: 10, label: { serviceCode: "ups_ground" }, selectedRate: { cost: 8, serviceCode: "ups_ground" } },
      { orderId: 11, label: { serviceCode: "priority_mail" }, selectedRate: null },
    ],
  };

  const changedLabelService = {
    page: 1,
    pages: 1,
    total: 2,
    orders: [
      { orderId: 10, label: { serviceCode: "ups_ground_saver" }, selectedRate: { cost: 8, serviceCode: "ups_ground_saver" } },
      { orderId: 11, label: { serviceCode: "priority_mail" }, selectedRate: null },
    ],
  };

  const removedOrder = {
    page: 1,
    pages: 1,
    total: 1,
    orders: [
      { orderId: 10, label: { serviceCode: "ups_ground" }, selectedRate: { cost: 8, serviceCode: "ups_ground" } },
    ],
  };

  assert.equal(didOrdersResponseChange(previous, changedLabelService), true);
  assert.equal(didOrdersResponseChange(previous, removedOrder), true);
  assert.equal(didOrdersResponseChange(previous, previous), false);
});
