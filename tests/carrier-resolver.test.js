/**
 * Tests for carrier-resolver.ts
 * Run: node --experimental-strip-types --test tests/carrier-resolver.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveCarrierNickname } = await import(
  "../apps/api/src/modules/orders/application/carrier-resolver.ts"
);

test("exact providerAccountId match returns nickname", () => {
  assert.equal(resolveCarrierNickname(565326, "ups", null), "GG6381");
});

test("UPS 1ZGG6381 tracking decodes to GG6381", () => {
  assert.equal(resolveCarrierNickname(null, "ups", "1ZGG6381YW08419045"), "GG6381");
});

test("UPS 1ZR05H19 tracking decodes to ORION", () => {
  assert.equal(resolveCarrierNickname(null, "ups", "1ZR05H19YW02469122"), "ORION");
});

test("UPS 1ZC81F70 tracking decodes to ROCEL C81F70", () => {
  assert.equal(resolveCarrierNickname(null, "ups", "1ZC81F70YW00000000"), "ROCEL C81F70");
});

test("UPS 1ZG19Y32 tracking decodes to G19Y32", () => {
  assert.equal(resolveCarrierNickname(null, "ups", "1ZG19Y32YW00000000"), "G19Y32");
});

test("null carrierCode returns null", () => {
  assert.equal(resolveCarrierNickname(null, null, null), null);
});

test("unknown carrier returns formatted name", () => {
  assert.equal(resolveCarrierNickname(null, "some_carrier", null), "SOME CARRIER");
});
