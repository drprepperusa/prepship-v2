import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShippedOrdersCacheKey } from "../public/js/orders-cache.js";

test("shipped orders cache key varies by date range", () => {
  const last30 = {
    start: new Date("2026-02-10T08:00:00.000Z"),
    end: new Date("2026-03-12T07:59:59.000Z"),
  };
  const allTime = null;

  const last30Key = buildShippedOrdersCacheKey(42, 1, last30);
  const allTimeKey = buildShippedOrdersCacheKey(42, 1, allTime);

  assert.notEqual(last30Key, allTimeKey);
  assert.match(last30Key, /2026-02-10T08:00:00\.000Z/);
  assert.match(last30Key, /2026-03-12T07:59:59\.000Z/);
});

test("shipped orders cache key remains stable for identical inputs", () => {
  const range = {
    start: new Date("2026-02-10T08:00:00.000Z"),
    end: new Date("2026-03-12T07:59:59.000Z"),
  };

  const first = buildShippedOrdersCacheKey("all", 2, range);
  const second = buildShippedOrdersCacheKey("all", 2, {
    start: new Date("2026-02-10T08:00:00.000Z"),
    end: new Date("2026-03-12T07:59:59.000Z"),
  });

  assert.equal(first, second);
});
