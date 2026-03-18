import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { OrderRepository } from "../../orders/application/order-repository.ts";
import type { OrderSummaryDto } from "../../../../../packages/contracts/src/orders/contracts.ts";

interface PdfPicklistItem {
  sku: string | null;
  name: string | null;
  quantity: number;
}

interface PdfPicklistOrder {
  orderId: number;
  orderNumber: string | null;
  customerName: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipPostalCode: string | null;
  items: PdfPicklistItem[];
}

export class PicklistPdfService {
  private readonly repository: OrderRepository;

  constructor(repository: OrderRepository) {
    this.repository = repository;
  }

  async generatePicklistPdf(orderIds: number[]): Promise<Buffer> {
    const orders = this.buildPicklistOrders(orderIds);

    if (orders.length === 0) {
      throw new Error("No orders found for picklist");
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 612; // 8.5"
    const pageHeight = 792; // 11"
    const marginLeft = 40;
    const marginRight = 40;
    const marginTop = 40;
    const marginBottom = 40;

    let currentPage: PDFPage | null = null;
    let yPosition = 0;
    const lineHeight = 14;
    const sectionGap = 16;

    const addNewPage = () => {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - marginTop;

      // Header
      currentPage.drawText("PICKLIST", {
        x: marginLeft,
        y: yPosition,
        font: helveticaBold,
        size: 18,
        color: rgb(0, 0, 0),
      });

      const timestamp = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      currentPage.drawText(`Generated: ${timestamp}`, {
        x: marginLeft,
        y: yPosition - 18,
        font: helvetica,
        size: 9,
        color: rgb(100, 100, 100),
      });

      yPosition -= 40;
    };

    const checkPageSpace = (requiredSpace: number): boolean => {
      if (!currentPage || yPosition - requiredSpace < marginBottom) {
        addNewPage();
        return true;
      }
      return false;
    };

    addNewPage();

    // Draw each order
    for (const order of orders) {
      const itemLines = 2 + order.items.length; // Order header + items
      const requiredSpace = (itemLines * lineHeight) + sectionGap;

      checkPageSpace(requiredSpace);

      // Order number and customer
      const headerY = yPosition;
      currentPage!.drawText(`Order #${order.orderNumber || order.orderId}`, {
        x: marginLeft,
        y: headerY,
        font: helveticaBold,
        size: 11,
        color: rgb(0, 0, 0),
      });

      const customerName = order.customerName || "(No customer name)";
      currentPage!.drawText(`Ship to: ${customerName}`, {
        x: marginLeft + 20,
        y: headerY - lineHeight,
        font: helvetica,
        size: 9,
        color: rgb(50, 50, 50),
      });

      // Address line
      const addressParts = [order.shipCity, order.shipState, order.shipPostalCode].filter(Boolean);
      const addressLine = addressParts.length > 0 ? addressParts.join(", ") : "";

      if (addressLine) {
        currentPage!.drawText(addressLine, {
          x: marginLeft + 20,
          y: headerY - lineHeight * 2,
          font: helvetica,
          size: 8,
          color: rgb(80, 80, 80),
        });
      }

      yPosition = headerY - lineHeight * 3;

      // Items
      for (const item of order.items) {
        const qty = item.quantity || 1;
        const itemName = item.name || item.sku || "(Unknown)";
        const itemLabel = item.sku ? `${item.sku} - ${itemName}` : itemName;
        const qtyStr = `×${qty}`;

        // Draw item name
        currentPage!.drawText(itemLabel, {
          x: marginLeft + 30,
          y: yPosition,
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        });

        // Draw quantity aligned to right
        const qtyWidth = helvetica.widthOfTextAtSize(qtyStr, 10);
        currentPage!.drawText(qtyStr, {
          x: pageWidth - marginRight - qtyWidth,
          y: yPosition,
          font: helveticaBold,
          size: 10,
          color: rgb(200, 50, 50),
        });

        yPosition -= lineHeight;
      }

      // Section divider
      yPosition -= sectionGap / 2;
      currentPage!.drawLine({
        start: { x: marginLeft, y: yPosition },
        end: { x: pageWidth - marginRight, y: yPosition },
        color: rgb(200, 200, 200),
      });

      yPosition -= sectionGap / 2;
    }

    // Convert to bytes
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private buildPicklistOrders(orderIds: number[]): PdfPicklistOrder[] {
    const picklistOrders: PdfPicklistOrder[] = [];

    for (const orderId of orderIds) {
      const order = this.repository.getById(orderId);
      if (!order) continue;

      // Parse items
      let items: Array<{ sku?: string; name?: string; quantity?: number; adjustment?: boolean }> = [];
      if (order.items) {
        try {
          const parsed = JSON.parse(order.items);
          items = Array.isArray(parsed) ? parsed : [];
        } catch {
          items = [];
        }
      }

      // Filter out adjustments and build picklist items
      const picklistItems: PdfPicklistItem[] = items
        .filter((item) => !item.adjustment)
        .map((item) => ({
          sku: item.sku || null,
          name: item.name || null,
          quantity: item.quantity || 1,
        }));

      if (picklistItems.length > 0) {
        picklistOrders.push({
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          customerName: order.shipToName,
          shipCity: order.shipToCity,
          shipState: order.shipToState,
          shipPostalCode: order.shipToPostalCode,
          items: picklistItems,
        });
      }
    }

    return picklistOrders;
  }
}
