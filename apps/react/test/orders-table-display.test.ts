import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCarrierMarkup,
  formatLabelCreated,
  getAwaitingMarginDisplay,
  getRateBaseTotal,
} from "../src/components/Tables/orders-table-display.ts";

test("getRateBaseTotal prefers shipmentCost + otherCost", () => {
  assert.equal(getRateBaseTotal({ shipmentCost: 8.5, otherCost: 1.25, cost: 99 }), 9.75);
  assert.equal(getRateBaseTotal({ cost: 4.5 }), 4.5);
  assert.equal(getRateBaseTotal(null), null);
});

test("applyCarrierMarkup matches percent and flat account markups", () => {
  const markups = [
    { carrierCode: "ups", markup: 10, markupType: "percent" as const },
    { carrierCode: "fedex", markup: 2.5, markupType: "flat" as const },
  ];

  assert.equal(applyCarrierMarkup(10, "ups", markups), 11);
  assert.equal(applyCarrierMarkup(10, "fedex", markups), 12.5);
  assert.equal(applyCarrierMarkup(10, "usps", markups), 10);
});

test("getAwaitingMarginDisplay returns the V1-style positive diff and percent", () => {
  const margin = getAwaitingMarginDisplay(
    { carrierCode: "ups", shipmentCost: 10, otherCost: 0 },
    [{ carrierCode: "ups", markup: 15, markupType: "percent" }],
  );

  assert.deepEqual(margin, { diff: 1.5, pct: 15 });
  assert.equal(getAwaitingMarginDisplay({ carrierCode: "ups", shipmentCost: 10 }, []), null);
});

test("formatLabelCreated renders the compact V1 label timestamp", () => {
  const formatted = formatLabelCreated("2026-03-17T18:05:00.000Z");
  assert.ok(formatted);
  assert.match(formatted, /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}(am|pm)$/);
});
