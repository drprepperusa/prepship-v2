import type { PicklistPdfService } from "../application/picklist-pdf-service.ts";

export class PrintsHttpHandler {
  private readonly picklistPdfService: PicklistPdfService;

  constructor(picklistPdfService: PicklistPdfService) {
    this.picklistPdfService = picklistPdfService;
  }

  async handlePicklistPdf(payload: unknown): Promise<Buffer> {
    // Validate and extract order IDs from request body
    const orderIds = this.parseOrderIds(payload);

    if (orderIds.length === 0) {
      throw new Error("orderIds must be a non-empty array");
    }

    // Generate and return PDF
    return this.picklistPdfService.generatePicklistPdf(orderIds);
  }

  private parseOrderIds(payload: unknown): number[] {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid request payload");
    }

    const data = payload as Record<string, unknown>;
    const ids = data.orderIds;

    if (!Array.isArray(ids)) {
      throw new Error("orderIds must be an array");
    }

    return ids.map((id, index) => {
      const parsed = Number(id);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid order ID at index ${index}: ${id}`);
      }
      return parsed;
    });
  }
}
