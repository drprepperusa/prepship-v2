/**
 * carrier-resolver.ts
 *
 * Single source of truth for resolving a carrier account nickname from order data.
 * Imported by list-orders.ts and order-details.ts — never duplicated.
 *
 * Resolution order:
 *   1. providerAccountId exact match → nickname
 *   2. UPS 1Z tracking: chars 3-8 = account code → match accountNumber → nickname
 *   3. Single account for carrierCode → that account's nickname
 *   4. Human-readable carrier display name fallback (USPS, FedEx, etc.)
 *
 * To add a new carrier account: update CARRIER_ACCOUNTS_V2 in prepship-config.ts only.
 * Do not add logic here.
 */

import { CARRIER_ACCOUNTS_V2 } from "../../../common/prepship-config.ts";

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  stamps_com: "USPS",
  ups: "UPS",
  ups_walleted: "UPS",
  fedex: "FedEx",
  fedex_walleted: "FedEx One Balance",
  dhl_express: "DHL Express",
  amazon_buy_shipping: "Amazon",
  amazon_shipping_us: "Amazon",
  sendle: "Sendle",
  tusk: "Tusk",
};

export function resolveCarrierNickname(
  providerAccountId: number | null,
  carrierCode: string | null,
  trackingNumber?: string | null,
): string | null {
  if (!carrierCode) return null;

  // 1. Exact match by providerAccountId (most reliable — set when PrepShip creates label)
  if (providerAccountId) {
    const exact = CARRIER_ACCOUNTS_V2.find((a) => a.shippingProviderId === providerAccountId);
    if (exact) return exact.nickname;
  }

  // 2. UPS: decode account code from tracking number
  //    Format: 1Z [acct:6] [service:2] [seq:8] [check:1]
  //    accountNumber in CARRIER_ACCOUNTS_V2 must be the 6-char UPS account code.
  if ((carrierCode === "ups" || carrierCode === "ups_walleted") && trackingNumber) {
    const tn = trackingNumber.replace(/\s/g, "").toUpperCase();
    if (tn.startsWith("1Z") && tn.length >= 8) {
      const acctCode = tn.slice(2, 8);
      const matched = CARRIER_ACCOUNTS_V2.find(
        (a) =>
          (a.carrierCode === "ups" || a.carrierCode === "ups_walleted") &&
          a.accountNumber?.toUpperCase() === acctCode,
      );
      if (matched) return matched.nickname;
    }
  }

  // 3. Only one account for this carrierCode → unambiguous
  const matching = CARRIER_ACCOUNTS_V2.filter((a) => a.carrierCode === carrierCode);
  if (matching.length === 1) return matching[0]!.nickname;

  // 4. Human-readable carrier name fallback
  return CARRIER_DISPLAY_NAMES[carrierCode] ?? carrierCode.replace(/_/g, " ").toUpperCase();
}

/**
 * Compute the carrierDisplay field for an order.
 * Returns { nickname, badge } for the frontend to render directly.
 *
 * badge = 'ext-label' means show the "Ext. Label" pill (no nickname).
 * If badge is null, render nickname (or nothing if nickname is also null).
 */
export function resolveCarrierDisplay(params: {
  orderStatus: string;
  externallyFulfilled: boolean;
  externalShipped: boolean;
  providerAccountId: number | null;
  carrierCode: string | null;
  serviceCode: string | null;
  trackingNumber: string | null;
  hasSelectedRate: boolean;
}): { nickname: string | null; badge: "ext-label" | null } {
  const { orderStatus, externallyFulfilled, externalShipped, hasSelectedRate } = params;

  if (orderStatus !== "shipped") {
    return { nickname: null, badge: null };
  }

  // Marketplace-fulfilled (SS flag) or externally shipped with no SS shipment record
  if (externallyFulfilled || (externalShipped && !hasSelectedRate)) {
    return { nickname: null, badge: "ext-label" };
  }

  const nickname = resolveCarrierNickname(
    params.providerAccountId,
    params.carrierCode,
    params.trackingNumber,
  );

  return { nickname, badge: null };
}
