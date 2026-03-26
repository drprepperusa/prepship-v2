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

test("stamps_com with clientId=null uses shared USPS account", () => {
  // Two stamps_com accounts: se-433542 (clientId=null) and se-442006 (clientId=10)
  // Order for clientId=3 (not 10) → should use shared account se-433542
  const result = resolveCarrierNickname(null, "stamps_com", null, 3);
  assert.equal(result, "USPS Chase x7439");
});

test("stamps_com with clientId=10 uses KFG account", () => {
  const result = resolveCarrierNickname(null, "stamps_com", null, 10);
  assert.equal(result, "GREG PAYABILITY 6/17");
});
