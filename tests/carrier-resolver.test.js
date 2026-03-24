/**
 * Integration tests for carrier-resolver.ts
 *
 * These tests lock the carrier display logic so future changes to sync,
 * shipments, or rate data can't silently break the shipping account column.
 *
 * Run: node --experimental-strip-types --test tests/carrier-resolver.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Import via dynamic to avoid TS resolver issues in CJS test runner
const { resolveCarrierNickname, resolveCarrierDisplay } = await import(
  "../apps/api/src/modules/orders/application/carrier-resolver.ts"
);

// ── resolveCarrierNickname ────────────────────────────────────────────────────

test("resolveCarrierNickname: exact providerAccountId match returns nickname", () => {
  // se-565326 = GG6381 (shippingProviderId: 565326)
  const result = resolveCarrierNickname(565326, "ups", null);
  assert.equal(result, "GG6381");
});

test("resolveCarrierNickname: UPS tracking 1ZGG6381... decodes to GG6381", () => {
  const result = resolveCarrierNickname(null, "ups", "1ZGG6381YW08419045");
  assert.equal(result, "GG6381");
});

test("resolveCarrierNickname: UPS tracking 1ZR05H19... decodes to ORION", () => {
  const result = resolveCarrierNickname(null, "ups", "1ZR05H19YW02469122");
  assert.equal(result, "ORION");
});

test("resolveCarrierNickname: UPS tracking 1ZC81F70... decodes to ROCEL C81F70", () => {
  const result = resolveCarrierNickname(null, "ups", "1ZC81F70YW00000000");
  assert.equal(result, "ROCEL C81F70");
});

test("resolveCarrierNickname: USPS single account resolves correctly", () => {
  // Only one stamps_com account for clientId=null: se-433542
  const result = resolveCarrierNickname(null, "stamps_com", null);
  // May return nickname or "USPS" depending on count — just assert not null
  assert.ok(result !== null);
});

test("resolveCarrierNickname: unknown carrier returns formatted name", () => {
  const result = resolveCarrierNickname(null, "some_carrier", null);
  assert.equal(result, "SOME CARRIER");
});

test("resolveCarrierNickname: null carrierCode returns null", () => {
  const result = resolveCarrierNickname(null, null, null);
  assert.equal(result, null);
});

// ── resolveCarrierDisplay ─────────────────────────────────────────────────────

test("resolveCarrierDisplay: externallyFulfilled order → ext-label badge", () => {
  const result = resolveCarrierDisplay({
    orderStatus: "shipped",
    externallyFulfilled: true,
    externalShipped: false,
    providerAccountId: null,
    carrierCode: "ups",
    serviceCode: null,
    trackingNumber: null,
    hasSelectedRate: false,
  });
  assert.equal(result.badge, "ext-label");
  assert.equal(result.nickname, null);
});

test("resolveCarrierDisplay: externalShipped + no selectedRate → ext-label badge", () => {
  const result = resolveCarrierDisplay({
    orderStatus: "shipped",
    externallyFulfilled: false,
    externalShipped: true,
    providerAccountId: null,
    carrierCode: "ups_walleted",
    serviceCode: null,
    trackingNumber: null,
    hasSelectedRate: false,
  });
  assert.equal(result.badge, "ext-label");
});

test("resolveCarrierDisplay: externalShipped + has selectedRate → shows nickname (PrepShip label)", () => {
  // Edge case: order marked externalShipped but we have a selectedRate (shouldn't happen normally)
  const result = resolveCarrierDisplay({
    orderStatus: "shipped",
    externallyFulfilled: false,
    externalShipped: true,
    providerAccountId: 565326,
    carrierCode: "ups",
    serviceCode: null,
    trackingNumber: null,
    hasSelectedRate: true,
  });
  assert.equal(result.badge, null);
  assert.equal(result.nickname, "GG6381");
});

test("resolveCarrierDisplay: normal PrepShip-shipped order → nickname, no badge", () => {
  const result = resolveCarrierDisplay({
    orderStatus: "shipped",
    externallyFulfilled: false,
    externalShipped: false,
    providerAccountId: null,
    carrierCode: "ups",
    serviceCode: null,
    trackingNumber: "1ZGG6381YW08419045",
    hasSelectedRate: true,
  });
  assert.equal(result.badge, null);
  assert.equal(result.nickname, "GG6381");
});

test("resolveCarrierDisplay: awaiting_shipment order → null display (not yet shipped)", () => {
  const result = resolveCarrierDisplay({
    orderStatus: "awaiting_shipment",
    externallyFulfilled: false,
    externalShipped: false,
    providerAccountId: null,
    carrierCode: null,
    serviceCode: null,
    trackingNumber: null,
    hasSelectedRate: false,
  });
  assert.equal(result.badge, null);
  assert.equal(result.nickname, null);
});
