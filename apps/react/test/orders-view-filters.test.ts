import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrdersDateRange,
  orderMatchesSearch,
  orderMatchesSku,
} from "../src/components/Views/orders-view-filters.ts";

function assertLocalDateParts(
  date: Date | null | undefined,
  expected: { year: number; month: number; day: number; hour: number; minute: number; second: number },
) {
  assert.ok(date);
  assert.equal(date.getFullYear(), expected.year);
  assert.equal(date.getMonth(), expected.month);
  assert.equal(date.getDate(), expected.day);
  assert.equal(date.getHours(), expected.hour);
  assert.equal(date.getMinutes(), expected.minute);
  assert.equal(date.getSeconds(), expected.second);
}

test("getOrdersDateRange matches the V1 last-30 preset semantics", () => {
  const now = new Date("2026-03-17T15:45:00.000Z");
  const range = getOrdersDateRange("last-30", {}, now);

  assert.ok(range);
  assert.equal(range.start?.toISOString(), "2026-02-15T07:00:00.000Z");
  assert.equal(range.end?.toISOString(), now.toISOString());
});

test("getOrdersDateRange expands custom dates to full-day boundaries", () => {
  const range = getOrdersDateRange("custom", {
    start: "2026-03-01",
    end: "2026-03-05",
  });

  assert.ok(range);
  assertLocalDateParts(range.start, { year: 2026, month: 2, day: 1, hour: 0, minute: 0, second: 0 });
  assertLocalDateParts(range.end, { year: 2026, month: 2, day: 5, hour: 23, minute: 59, second: 59 });
});

test("orderMatchesSearch checks the same fields as the V1 orders filter", () => {
  const order = {
    orderNumber: "100234",
    customerEmail: "ops@example.com",
    shipTo: { name: "Jordan Lee" },
    items: [
      { sku: "SKU-RED", name: "Red Widget" },
      { sku: "SKU-BLU", name: "Blue Widget" },
    ],
  };

  assert.equal(orderMatchesSearch(order, "100234"), true);
  assert.equal(orderMatchesSearch(order, "jordan"), true);
  assert.equal(orderMatchesSearch(order, "ops@example.com"), true);
  assert.equal(orderMatchesSearch(order, "SKU-BLU"), true);
  assert.equal(orderMatchesSearch(order, "blue"), true);
  assert.equal(orderMatchesSearch(order, "missing"), false);
});

test("orderMatchesSku keeps the V1 exact-SKU behavior", () => {
  const order = {
    items: [
      { sku: "SKU-RED", name: "Red Widget" },
      { sku: "SKU-BLU", name: "Blue Widget" },
    ],
  };

  assert.equal(orderMatchesSku(order, "all"), true);
  assert.equal(orderMatchesSku(order, "SKU-RED"), true);
  assert.equal(orderMatchesSku(order, "SKU-GRN"), false);
});
