/**
 * Offline test label generator.
 * Produces a self-contained HTML page that looks like a real shipping label
 * but is clearly watermarked TEST — no carrier interaction, zero postage cost.
 */

export interface MockLabelData {
  shipmentId: number;
  orderNumber: string | null;
  trackingNumber: string;
  serviceLabel: string;
  weightOz: number;
  shipFrom: {
    name: string;
    street1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  shipTo: {
    name: string;
    street1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  shipDate: string;
}

function fakeBarcodeSvg(trackingNumber: string): string {
  // Simple visual barcode made of rectangles — not scannable, just visual
  const bars: string[] = [];
  let x = 0;
  for (let i = 0; i < trackingNumber.length * 3; i++) {
    const charCode = trackingNumber.charCodeAt(i % trackingNumber.length);
    const width = ((charCode + i) % 3) + 1;
    const isBlack = (charCode + i) % 3 !== 0;
    if (isBlack) {
      bars.push(`<rect x="${x}" y="0" width="${width}" height="50" fill="black"/>`);
    }
    x += width + 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="50" viewBox="0 0 ${x} 50">${bars.join("")}</svg>`;
}

export function generateMockLabelHtml(data: MockLabelData): string {
  const barcode = fakeBarcodeSvg(data.trackingNumber);
  const formattedTracking = data.trackingNumber.replace(/(.{4})/g, "$1 ").trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TEST LABEL — ${data.orderNumber ?? data.shipmentId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #f0f0f0; display: flex; justify-content: center; align-items: flex-start; padding: 20px; }
  .label {
    width: 4in; min-height: 6in;
    background: white;
    border: 2px solid #000;
    padding: 0;
    page-break-inside: avoid;
    position: relative;
  }
  .void-banner {
    background: #ff0000;
    color: white;
    text-align: center;
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 4px;
    padding: 6px 0;
    border-bottom: 2px solid #000;
  }
  .section {
    border-bottom: 1px solid #000;
    padding: 8px 10px;
  }
  .section:last-child { border-bottom: none; }
  .label-sm { font-size: 9px; text-transform: uppercase; color: #555; font-weight: bold; margin-bottom: 2px; }
  .label-val { font-size: 13px; font-weight: bold; }
  .label-val.small { font-size: 11px; font-weight: normal; }
  .service-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 10px;
    border-bottom: 2px solid #000;
  }
  .service-name { font-size: 20px; font-weight: 900; letter-spacing: 1px; }
  .weight-box { border: 1px solid #999; padding: 4px 8px; font-size: 11px; text-align: center; }
  .tracking-section { padding: 8px 10px; border-bottom: 2px solid #000; text-align: center; }
  .tracking-num { font-size: 16px; font-weight: bold; font-family: monospace; letter-spacing: 1px; margin: 6px 0; }
  .barcode-wrap { display: flex; justify-content: center; margin: 6px 0; overflow: hidden; }
  .order-row { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 11px; }
  .test-watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 80px; font-weight: 900; color: rgba(255,0,0,0.08);
    pointer-events: none; white-space: nowrap; letter-spacing: 10px;
    z-index: 0;
  }
  @media print {
    body { background: white; padding: 0; }
    .label { border: 1px solid #000; page-break-inside: avoid; }
    .no-print { display: none; }
  }
  .print-btn {
    display: block; margin: 16px auto; padding: 10px 30px;
    background: #1d4ed8; color: white; border: none; border-radius: 6px;
    font-size: 14px; cursor: pointer; font-weight: bold;
  }
</style>
</head>
<body>
<div>
  <div class="label">
    <div class="test-watermark">TEST</div>
    <div class="void-banner">⚠ VOID — TEST LABEL — DO NOT SHIP ⚠</div>

    <div class="section">
      <div class="label-sm">Ship From</div>
      <div class="label-val">${data.shipFrom.name}</div>
      <div class="label-val small">${data.shipFrom.street1}</div>
      <div class="label-val small">${data.shipFrom.city}, ${data.shipFrom.state} ${data.shipFrom.postalCode}</div>
    </div>

    <div class="section">
      <div class="label-sm">Ship To</div>
      <div class="label-val" style="font-size:16px">${data.shipTo.name}</div>
      <div class="label-val small" style="font-size:13px">${data.shipTo.street1}</div>
      <div class="label-val small" style="font-size:15px">${data.shipTo.city}, ${data.shipTo.state} ${data.shipTo.postalCode}</div>
    </div>

    <div class="service-row">
      <div class="service-name">${data.serviceLabel}</div>
      <div class="weight-box">
        <div style="font-size:9px;color:#555">WEIGHT</div>
        <div style="font-weight:bold">${data.weightOz} oz</div>
      </div>
    </div>

    <div class="tracking-section">
      <div class="label-sm">Tracking Number</div>
      <div class="tracking-num">${formattedTracking}</div>
      <div class="barcode-wrap">${barcode}</div>
    </div>

    <div class="order-row">
      <span><b>Order #:</b> ${data.orderNumber ?? "—"}</span>
      <span><b>Ship Date:</b> ${data.shipDate}</span>
    </div>
    <div class="order-row">
      <span><b>Shipment ID:</b> ${data.shipmentId}</span>
      <span style="color:red;font-weight:bold">TEST MODE</span>
    </div>
  </div>

  <button class="print-btn no-print" onclick="window.print()">🖨️ Print Label</button>
</div>
</body>
</html>`;
}

export function generateFakeTrackingNumber(): string {
  const digits = Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
  return `TEST${digits}`;
}

export function generateFakeShipmentId(): number {
  // Use negative IDs so they never collide with real ShipStation shipment IDs
  return -(Math.floor(Math.random() * 9_000_000) + 1_000_000);
}

export function serviceCodeToLabel(serviceCode: string): string {
  const map: Record<string, string> = {
    usps_priority_mail: "USPS PRIORITY MAIL",
    usps_first_class_mail: "USPS FIRST CLASS",
    usps_ground_advantage: "USPS GROUND ADVANTAGE",
    usps_priority_mail_express: "USPS PRIORITY EXPRESS",
    ups_ground: "UPS GROUND",
    ups_2nd_day_air: "UPS 2ND DAY AIR",
    ups_next_day_air: "UPS NEXT DAY AIR",
    fedex_ground: "FEDEX GROUND",
    fedex_2day: "FEDEX 2DAY",
  };
  return map[serviceCode] ?? serviceCode.replace(/_/g, " ").toUpperCase();
}
