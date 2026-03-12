import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getOrderNormalizedServiceCode,
  getOrderRequestedService,
  getSelectedRateCost,
  getSelectedRateProviderId,
  getSelectedRateTotal,
} from "../public/js/order-data.js";

test("getOrderNormalizedServiceCode prefers normalized serviceCode over requested shipping label text", () => {
  const order = {
    serviceCode: "ups_next_day_air",
    raw: {
      requestedShippingService: "NextDay Next US D2D Dom",
      serviceCode: "ups_next_day_air",
    },
  };

  assert.equal(getOrderNormalizedServiceCode(order), "ups_next_day_air");
  assert.equal(getOrderRequestedService(order), "NextDay Next US D2D Dom");
});

test("getSelectedRateProviderId prefers providerAccountId from persisted selected rates", () => {
  const order = {
    selectedRate: {
      providerAccountId: 596001,
      shippingProviderId: 123,
    },
  };

  assert.equal(getSelectedRateProviderId(order), 596001);
});

test("selected-rate helpers preserve cost and otherCost semantics", () => {
  const order = {
    selectedRate: {
      cost: 8.25,
      shipmentCost: 8.25,
      otherCost: 0.5,
    },
  };

  assert.equal(getSelectedRateCost(order), 8.25);
  assert.equal(getSelectedRateTotal(order), 8.75);
});
