import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";

export interface ResidentialLookupResult {
  orderId: number;
  residential: boolean | null;
}

/**
 * ShipstationResidentialGateway queries ShipStation API for address residential/commercial status.
 * This is used to determine the correct shipping rates (residential vs commercial have different pricing).
 * 
 * Why this matters: If we guess "residential" wrong, we fetch the wrong rates and show incorrect pricing.
 */
export class ShipstationResidentialGateway {
  private readonly authHeader: string;
  private readonly baseUrl = "https://ssapi.shipstation.com";

  constructor(secrets: TransitionalSecrets) {
    const apiKey = secrets.shipstation?.api_key;
    const apiSecret = secrets.shipstation?.api_secret;
    if (!apiKey || !apiSecret) {
      throw new Error("ShipStation API credentials required for residential lookup");
    }
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
  }

  /**
   * Lookup residential status for orders.
   * Batch endpoint (if available) is preferred; falls back to per-order if needed.
   * 
   * ShipStation API: /orders endpoint returns residential indicator in response.
   * We extract the shipTo.residential flag from each order object.
   * 
   * Returns:
   * - true = residential address
   * - false = commercial address
   * - null = unable to determine (use fallback logic)
   */
  async lookupResidential(
    shipStationOrderIds: Array<{ orderId: number; shipStationOrderNumber: string | null }>,
  ): Promise<ResidentialLookupResult[]> {
    // If no ShipStation order numbers, return nulls
    if (!shipStationOrderIds.length) {
      return shipStationOrderIds.map((item) => ({ orderId: item.orderId, residential: null }));
    }

    const results = new Map<number, boolean | null>();

    // Initialize all as null (couldn't determine)
    for (const item of shipStationOrderIds) {
      results.set(item.orderId, null);
    }

    try {
      // Batch lookup: Query ShipStation API for all orders at once
      // Use a filter query to get only the orders we care about
      // ShipStation /orders endpoint supports pagination and filtering
      const shipStationNumbers = shipStationOrderIds
        .filter((item) => item.shipStationOrderNumber)
        .map((item) => item.shipStationOrderNumber as string);

      if (shipStationNumbers.length === 0) {
        // No ShipStation order numbers to look up; return all nulls
        return Array.from(results.entries()).map(([orderId, residential]) => ({
          orderId,
          residential,
        }));
      }

      // Query ShipStation for these specific orders
      // Paginate through results (ShipStation returns 100 at a time)
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          `${this.baseUrl}/orders?pageSize=100&page=${page}`,
          {
            method: "GET",
            headers: { Authorization: this.authHeader },
          },
        );

        if (!response.ok) {
          // If API call fails, just return nulls (fall back to heuristic)
          console.warn(
            `ShipStation residential lookup failed: ${response.status}. Using fallback logic.`,
          );
          break;
        }

        const data = (await response.json()) as any;
        if (!data.orders || !Array.isArray(data.orders)) {
          break;
        }

        // Check each order for residential indicator
        for (const ssOrder of data.orders) {
          // Find matching order by ShipStation order number
          const prepshipOrderId = shipStationOrderIds.find(
            (item) => item.shipStationOrderNumber === ssOrder.orderNumber,
          )?.orderId;

          if (prepshipOrderId && results.has(prepshipOrderId)) {
            // Extract residential status from shipTo object
            // ShipStation API returns { shipTo: { residential: true|false } }
            const ssResidential = ssOrder.shipTo?.residential;
            if (typeof ssResidential === "boolean") {
              results.set(prepshipOrderId, ssResidential);
            }
          }
        }

        // Check if more pages available
        hasMore = data.totalPages && page < data.totalPages;
        page++;
      }
    } catch (error) {
      console.warn(`ShipStation residential gateway error: ${error}. Using fallback logic.`);
      // On error, return nulls (triggers fallback to company-based heuristic)
    }

    return Array.from(results.entries()).map(([orderId, residential]) => ({
      orderId,
      residential,
    }));
  }
}
