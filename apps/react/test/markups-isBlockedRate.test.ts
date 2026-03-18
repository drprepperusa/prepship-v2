/**
 * Tests for isBlockedRate() in utils/markups.ts
 * Verifies the previously-stubbed function now implements real blocking logic.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  isBlockedRate,
  BLOCKED_CARRIER_IDS,
  BLOCKED_SERVICE_CODES,
  BLOCKED_PACKAGE_TYPES,
  MEDIA_MAIL_ALLOWED_STORES,
} from "../src/utils/markups.ts";
import type { Rate } from "../src/types/orders.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRate(overrides: Partial<Rate> = {}): Rate {
  return {
    shippingProviderId: 433542,   // stamps_com — a valid carrier
    carrierCode: "stamps_com",
    serviceCode: "usps_priority_mail",
    serviceName: "USPS Priority Mail",
    packageType: null,
    amount: 12.50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Edge case 1: Valid rate — nothing blocked
// ---------------------------------------------------------------------------
test("valid rate (priority mail, valid carrier) is NOT blocked", () => {
  const rate = makeRate();
  assert.equal(isBlockedRate(rate), false);
  assert.equal(isBlockedRate(rate, 12345), false);
});

// ---------------------------------------------------------------------------
// Edge case 2: Blocked by serviceCode
// ---------------------------------------------------------------------------
test("usps_media_mail is blocked globally (no storeId)", () => {
  const rate = makeRate({ serviceCode: "usps_media_mail" });
  assert.equal(isBlockedRate(rate), true);
});

test("usps_media_mail is blocked when storeId is not in allowlist", () => {
  const rate = makeRate({ serviceCode: "usps_media_mail" });
  assert.equal(isBlockedRate(rate, 99999), true);
});

test("usps_media_mail is NOT blocked for allowed store 376759", () => {
  const rate = makeRate({ serviceCode: "usps_media_mail" });
  const allowedStoreId = [...MEDIA_MAIL_ALLOWED_STORES][0]; // 376759
  assert.equal(isBlockedRate(rate, allowedStoreId), false);
});

test("usps_parcel_select is blocked", () => {
  const rate = makeRate({ serviceCode: "usps_parcel_select" });
  assert.equal(isBlockedRate(rate), true);
});

test("ups_surepost_1_lb_or_greater is blocked", () => {
  const rate = makeRate({ serviceCode: "ups_surepost_1_lb_or_greater" });
  assert.equal(isBlockedRate(rate), true);
});

// ---------------------------------------------------------------------------
// Edge case 3: Blocked by packageType
// ---------------------------------------------------------------------------
test("flat_rate_envelope packageType is blocked", () => {
  const rate = makeRate({ packageType: "flat_rate_envelope" });
  assert.equal(isBlockedRate(rate), true);
});

test("large_flat_rate_box packageType is blocked", () => {
  const rate = makeRate({ packageType: "large_flat_rate_box" });
  assert.equal(isBlockedRate(rate), true);
});

test("null packageType does NOT trigger package block", () => {
  const rate = makeRate({ packageType: null });
  assert.equal(isBlockedRate(rate), false);
});

// ---------------------------------------------------------------------------
// Edge case 4: Blocked by serviceName heuristic
// ---------------------------------------------------------------------------
test("serviceName containing 'Flat Rate' triggers name block", () => {
  const rate = makeRate({ serviceName: "Priority Mail Flat Rate Box" });
  assert.equal(isBlockedRate(rate), true);
});

test("serviceName with 'flat-rate' (hyphen) triggers name block", () => {
  const rate = makeRate({ serviceName: "USPS flat-rate envelope" });
  assert.equal(isBlockedRate(rate), true);
});

test("serviceName 'Priority Mail' (no flat-rate) is NOT blocked by name", () => {
  const rate = makeRate({ serviceName: "Priority Mail" });
  assert.equal(isBlockedRate(rate), false);
});

// ---------------------------------------------------------------------------
// Edge case 5: Blocked by carrier ID
// ---------------------------------------------------------------------------
test("Amazon Buy Shipping (442017) is blocked regardless of service", () => {
  const rate = makeRate({
    shippingProviderId: 442017,
    serviceCode: "usps_priority_mail",
    serviceName: "Priority Mail",
  });
  assert.equal(isBlockedRate(rate), true);
});

test("Sendle (566344) is blocked", () => {
  const rate = makeRate({
    shippingProviderId: 566344,
    serviceCode: "sendle_ground",
    serviceName: "Sendle Ground",
  });
  assert.equal(isBlockedRate(rate), true);
});

test("Amazon Shipping US (593739) is blocked", () => {
  const rate = makeRate({
    shippingProviderId: 593739,
    serviceCode: "amazon_shipping",
    serviceName: "Amazon Shipping",
  });
  assert.equal(isBlockedRate(rate), true);
});

// ---------------------------------------------------------------------------
// Edge case 6: Missing / null inputs
// ---------------------------------------------------------------------------
test("null rate returns false (safe default)", () => {
  // @ts-expect-error — testing runtime null safety
  assert.equal(isBlockedRate(null), false);
});

test("rate with undefined storeId is handled gracefully", () => {
  const rate = makeRate({ serviceCode: "usps_media_mail" });
  // storeId is undefined — media mail should still be blocked
  assert.equal(isBlockedRate(rate, undefined), true);
});

// ---------------------------------------------------------------------------
// Edge case 7: pickBestRate integration (blocked rates filtered out)
// ---------------------------------------------------------------------------
import { pickBestRate } from "../src/utils/markups.ts";

test("pickBestRate filters out blocked rates", () => {
  const good: Rate = makeRate({ serviceCode: "usps_priority_mail", amount: 15, shipmentCost: 15 });
  const blocked: Rate = makeRate({ serviceCode: "usps_parcel_select", amount: 5, shipmentCost: 5 });
  const best = pickBestRate([good, blocked], {});
  assert.ok(best, "should find a rate");
  assert.equal(best!.serviceCode, "usps_priority_mail", "should pick non-blocked rate, not cheapest blocked");
});

test("pickBestRate returns null when all rates are blocked", () => {
  const rates: Rate[] = [
    makeRate({ serviceCode: "usps_parcel_select", amount: 5, shipmentCost: 5 }),
    makeRate({ serviceCode: "ups_surepost_1_lb_or_greater", amount: 4, shipmentCost: 4 }),
  ];
  const result = pickBestRate(rates, {});
  assert.equal(result, null);
});

test("pickBestRate returns null for empty rates array", () => {
  assert.equal(pickBestRate([], {}), null);
});

test("pickBestRate returns null for null rates", () => {
  assert.equal(pickBestRate(null, {}), null);
});

// ---------------------------------------------------------------------------
// Edge case 8: All BLOCKED_SERVICE_CODES are actually blocked
// ---------------------------------------------------------------------------
test("all BLOCKED_SERVICE_CODES are blocked", () => {
  for (const code of BLOCKED_SERVICE_CODES) {
    const rate = makeRate({ serviceCode: code });
    assert.equal(
      isBlockedRate(rate),
      true,
      `Expected ${code} to be blocked`
    );
  }
});

// ---------------------------------------------------------------------------
// Edge case 9: All BLOCKED_CARRIER_IDS are blocked
// ---------------------------------------------------------------------------
test("all BLOCKED_CARRIER_IDS are blocked regardless of service", () => {
  for (const pid of BLOCKED_CARRIER_IDS) {
    const rate = makeRate({
      shippingProviderId: pid,
      serviceCode: "usps_priority_mail",
      serviceName: "Priority Mail",
    });
    assert.equal(
      isBlockedRate(rate),
      true,
      `Expected carrier ${pid} to be blocked`
    );
  }
});

// ---------------------------------------------------------------------------
// Edge case 10: All BLOCKED_PACKAGE_TYPES are blocked
// ---------------------------------------------------------------------------
test("all BLOCKED_PACKAGE_TYPES are blocked", () => {
  for (const pkg of BLOCKED_PACKAGE_TYPES) {
    const rate = makeRate({ packageType: pkg });
    assert.equal(
      isBlockedRate(rate),
      true,
      `Expected packageType ${pkg} to be blocked`
    );
  }
});
