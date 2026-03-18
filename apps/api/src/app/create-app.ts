import { jsonResponse } from "../common/http/json.ts";
import { InputValidationError, parseOptionalIntegerParam } from "../../../../packages/contracts/src/common/input-validation.ts";
import type { AnalysisHttpHandler } from "../modules/analysis/api/analysis-handler.ts";
import type { BillingHttpHandler } from "../modules/billing/api/billing-handler.ts";
import type { ClientsHttpHandler } from "../modules/clients/api/clients-handler.ts";
import type { InitHttpHandler } from "../modules/init/api/init-handler.ts";
import type { InventoryHttpHandler } from "../modules/inventory/api/inventory-handler.ts";
import type { LabelsHttpHandler } from "../modules/labels/api/labels-handler.ts";
import type { LocationsHttpHandler } from "../modules/locations/api/locations-handler.ts";
import type { ManifestsHttpHandler } from "../modules/manifests/api/manifests-handler.ts";
import type { OrdersHttpHandler } from "../modules/orders/api/orders-handler.ts";
import type { PackagesHttpHandler } from "../modules/packages/api/packages-handler.ts";
import type { ProductsHttpHandler } from "../modules/products/api/products-handler.ts";
import type { RatesHttpHandler } from "../modules/rates/api/rates-handler.ts";
import type { SettingsHttpHandler } from "../modules/settings/api/settings-handler.ts";
import type { ShipmentsHttpHandler } from "../modules/shipments/api/shipments-handler.ts";
import type { QueueHttpHandler } from "../modules/queue/api/queue-handler.ts";

export interface AppDependencies {
  queueHandler: QueueHttpHandler;
  analysisHandler: AnalysisHttpHandler;
  billingHandler: BillingHttpHandler;
  ordersHandler: OrdersHttpHandler;
  clientsHandler: ClientsHttpHandler;
  initHandler: InitHttpHandler;
  inventoryHandler: InventoryHttpHandler;
  labelsHandler: LabelsHttpHandler;
  locationsHandler: LocationsHttpHandler;
  manifestsHandler: ManifestsHttpHandler;
  packagesHandler: PackagesHttpHandler;
  productsHandler: ProductsHttpHandler;
  ratesHandler: RatesHttpHandler;
  settingsHandler: SettingsHttpHandler;
  shipmentsHandler: ShipmentsHttpHandler;
}

export function createApp(dependencies: AppDependencies) {
  const isInputError = (error: unknown, messages: string[] = []): boolean =>
    error instanceof InputValidationError || (error instanceof Error && messages.includes(error.message));

  const parseOptionalNumberQuery = (value: string | null, name: string): number | undefined => {
    if (value == null || value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new InputValidationError(`${name} must be a number`);
    }
    return parsed;
  };

  const parseBooleanQuery = (value: string | null, name: string, fallback: boolean): boolean => {
    if (value == null || value.trim() === "") return fallback;
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
    throw new InputValidationError(`${name} must be true/false or 1/0`);
  };

  const renderBillingInvoiceHtml = (invoice: NonNullable<ReturnType<BillingHttpHandler["handleInvoice"]>>) => {
    const fmt = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;
    const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const rows = invoice.details.map((detail) => `
      <tr>
        <td>${detail.shipDate?.slice(0, 10) ?? ""}</td>
        <td class="mono">${detail.orderNumber || detail.orderId}</td>
        <td class="sku">${detail.skus || "—"}</td>
        <td class="num">${detail.baseQty}</td>
        <td class="num">${fmt(detail.pickpackAmt)}</td>
        <td class="num">${detail.addlQty > 0 ? `${detail.addlQty} (${fmt(detail.additionalAmt)})` : "—"}</td>
        <td class="num">${detail.shippingAmt > 0 ? fmt(detail.shippingAmt) : "—"}</td>
        <td class="num">${detail.storageAmt > 0 ? fmt(detail.storageAmt) : "—"}</td>
        <td class="num bold">${fmt(detail.rowTotal)}</td>
      </tr>
    `).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice — ${invoice.clientName} — ${invoice.from} to ${invoice.to}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; padding: 40px 48px; max-width: 1100px; margin: 0 auto; }
    .print-tip { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; margin-bottom: 24px; font-size: 12px; color: #1d4ed8; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
    .brand h1 { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -.3px; }
    .brand .sub { font-size: 11px; color: #9ca3af; margin-top: 3px; }
    .meta { text-align: right; }
    .meta .client-name { font-size: 18px; font-weight: 700; color: #111; }
    .meta .date-range { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .meta .gen-date { font-size: 10px; color: #9ca3af; margin-top: 2px; }
    .summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 20px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
    .card .cl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
    .card .cv { font-size: 16px; font-weight: 700; color: #111; }
    .grand-total { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .grand-total .gtl { font-size: 13px; font-weight: 600; color: #166534; }
    .grand-total .gtv { font-size: 24px; font-weight: 800; color: #166534; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { background: #f9fafb; border: 1px solid #e5e7eb; padding: 7px 10px; font-weight: 700; color: #374151; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }
    thead th.num { text-align: right; }
    tbody td { border: 1px solid #e5e7eb; padding: 6px 10px; color: #374151; vertical-align: middle; }
    tbody tr:nth-child(even) { background: #fafafa; }
    td.num { text-align: right; }
    td.mono { font-family: monospace; font-size: 11px; color: #2563eb; }
    td.sku { font-family: monospace; font-size: 10px; color: #6b7280; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.bold { font-weight: 700; }
    tfoot td { border: 1px solid #d1d5db; padding: 8px 10px; font-weight: 700; background: #f3f4f6; }
    tfoot td.num { text-align: right; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="print-tip">To save as PDF: press <strong>Ctrl+P</strong> or <strong>⌘P</strong>, then choose <strong>Save as PDF</strong>.</div>
  <div class="header">
    <div class="brand">
      <h1>Invoice</h1>
      <div class="sub">DR Prepper 3PL Services · 14924 S Figueroa St, Gardena CA 90248</div>
    </div>
    <div class="meta">
      <div class="client-name">Bill To: ${invoice.clientName}</div>
      <div class="date-range">Period: ${invoice.from} → ${invoice.to}</div>
      <div class="gen-date">Generated ${generated}</div>
    </div>
  </div>
  <div class="summary-grid">
    <div class="card"><div class="cl">Orders</div><div class="cv">${invoice.summary.orderCount}</div></div>
    <div class="card"><div class="cl">Pick &amp; Pack</div><div class="cv">${fmt(invoice.summary.pickPackTotal)}</div></div>
    <div class="card"><div class="cl">Add'l Units</div><div class="cv">${fmt(invoice.summary.additionalTotal)}</div></div>
    <div class="card"><div class="cl">Packages</div><div class="cv">${invoice.summary.packageTotal > 0 ? fmt(invoice.summary.packageTotal) : "—"}</div></div>
    <div class="card"><div class="cl">Shipping</div><div class="cv">${fmt(invoice.summary.shippingTotal)}</div></div>
    <div class="card"><div class="cl">Storage</div><div class="cv">${invoice.summary.storageTotal > 0 ? fmt(invoice.summary.storageTotal) : "—"}</div></div>
  </div>
  <div class="grand-total">
    <div class="gtl">Total Amount Due — ${invoice.from} → ${invoice.to}</div>
    <div class="gtv">${fmt(invoice.summary.grandTotal)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Ship Date</th>
        <th>Order #</th>
        <th>SKU(s)</th>
        <th class="num">Base Qty</th>
        <th class="num">Pick &amp; Pack</th>
        <th class="num">Add'l Units</th>
        <th class="num">Shipping</th>
        <th class="num">Storage</th>
        <th class="num">Row Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">Totals — ${invoice.summary.orderCount} orders</td>
        <td class="num">${fmt(invoice.summary.pickPackTotal)}</td>
        <td class="num">${fmt(invoice.summary.additionalTotal)}</td>
        <td class="num">${fmt(invoice.summary.shippingTotal)}</td>
        <td class="num">${invoice.summary.storageTotal > 0 ? fmt(invoice.summary.storageTotal) : "—"}</td>
        <td class="num" style="font-size:14px">${fmt(invoice.summary.grandTotal)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">PrepShip · Invoice generated ${generated} · Not a formal tax document · ${invoice.summary.orderCount} orders · ${invoice.from} → ${invoice.to}</div>
</body>
</html>`;
  };

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const readJson = async (): Promise<Record<string, unknown>> => {
      const text = await request.text();
      if (!text) return {};
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new InputValidationError("Malformed JSON body");
      }
    };

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/analysis/skus") {
      try {
        return jsonResponse(200, dependencies.analysisHandler.handleSkus(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/analysis/daily-sales") {
      try {
        return jsonResponse(200, dependencies.analysisHandler.handleDailySales(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/billing/config") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleConfig());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const billingConfigMatch = url.pathname.match(/^\/api\/billing\/config\/(\d+)$/);
    if (billingConfigMatch && request.method === "PUT") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleUpdateConfig(Number.parseInt(billingConfigMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/billing/generate") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleGenerate(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["from and to required", "from and to must be YYYY-MM-DD"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/billing/summary") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleSummary(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["from and to required", "from and to must be YYYY-MM-DD"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/billing/details") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleDetails(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["from, to, clientId required", "from and to must be YYYY-MM-DD"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/billing/package-prices") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handlePackagePrices(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["clientId required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "PUT" && url.pathname === "/api/billing/package-prices") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleUpdatePackagePrices(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["clientId and prices[] required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/billing/package-prices/set-default") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleSetDefaultPackagePrices(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["packageId and price required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/billing/invoice") {
      try {
        const invoice = dependencies.billingHandler.handleInvoice(url);
        if (!invoice) {
          return new Response("<p>Client not found</p>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
        }
        return new Response(renderBillingInvoiceHtml(invoice), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["from, to, clientId required", "from and to must be YYYY-MM-DD"]) ? 400 : 500;
        return new Response(`<p style="font-family:sans-serif;padding:40px;color:red">${message}</p>`, {
          status,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/billing/fetch-ref-rates") {
      try {
        return jsonResponse(200, await dependencies.billingHandler.handleFetchRefRates());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/billing/fetch-ref-rates/status") {
      return jsonResponse(200, dependencies.billingHandler.handleFetchRefRatesStatus());
    }

    if (request.method === "POST" && url.pathname === "/api/billing/backfill-ref-rates") {
      try {
        return jsonResponse(200, dependencies.billingHandler.handleBackfillRefRates(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/init-data") {
      try {
        return jsonResponse(200, await dependencies.initHandler.handleInitData());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/counts") {
      try {
        return jsonResponse(200, dependencies.initHandler.handleCounts());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/stores") {
      try {
        return jsonResponse(200, await dependencies.initHandler.handleStores());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/carriers") {
      try {
        return jsonResponse(200, await dependencies.initHandler.handleCarriers());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/carriers-for-store") {
      try {
        const storeId = parseOptionalIntegerParam(url.searchParams.get("storeId"), "storeId") ?? null;
        return jsonResponse(200, dependencies.ratesHandler.handleCarriersForStore(storeId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/carrier-accounts") {
      try {
        return jsonResponse(200, dependencies.initHandler.handleCarrierAccounts());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/cache/refresh-carriers") {
      try {
        return jsonResponse(200, await dependencies.initHandler.handleRefreshCarriers());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/rates/cached") {
      try {
        const weight = Math.round(parseOptionalNumberQuery(url.searchParams.get("wt"), "wt") ?? 0);
        const length = parseOptionalNumberQuery(url.searchParams.get("l"), "l") ?? 0;
        const width = parseOptionalNumberQuery(url.searchParams.get("w"), "w") ?? 0;
        const height = parseOptionalNumberQuery(url.searchParams.get("h"), "h") ?? 0;
        const dims = length > 0 && width > 0 && height > 0 ? { length, width, height } : null;
        return jsonResponse(200, dependencies.ratesHandler.handleCached({
          wt: weight,
          zip: url.searchParams.get("zip") ?? "",
          dims,
          residential: parseBooleanQuery(url.searchParams.get("residential"), "residential", true),
          storeId: parseOptionalIntegerParam(url.searchParams.get("storeId"), "storeId") ?? null,
          signature: url.searchParams.get("signature") ?? null,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/rates/cached/bulk") {
      try {
        const text = await request.text();
        const body = text ? JSON.parse(text) : [];
        return jsonResponse(200, dependencies.ratesHandler.handleCachedBulk(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["Expected array"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/rates") {
      try {
        return jsonResponse(200, await dependencies.ratesHandler.handleLiveRates(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/rates/browse") {
      try {
        return jsonResponse(200, await dependencies.ratesHandler.handleBrowseRates(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["shippingProviderId required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/rates/prefetch") {
      return jsonResponse(200, dependencies.ratesHandler.handlePrefetchDisabled());
    }

    if (request.method === "POST" && url.pathname === "/api/manifests/generate") {
      try {
        const manifest = dependencies.manifestsHandler.handleGenerate(await readJson() as never);
        return new Response(manifest.body, {
          status: 200,
          headers: {
            "content-type": manifest.contentType,
            "content-disposition": `attachment; filename="${manifest.filename}"`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["startDate and endDate required (YYYY-MM-DD format)"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const settingMatch = url.pathname.match(/^\/api\/settings\/([^/]+)$/);
    if (settingMatch && request.method === "GET") {
      try {
        return jsonResponse(200, dependencies.settingsHandler.handleGet(settingMatch[1] ?? ""));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error) ? 400 : message === "Unknown setting" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (settingMatch && request.method === "PUT") {
      try {
        return jsonResponse(200, dependencies.settingsHandler.handlePut(settingMatch[1] ?? "", await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message === "Unknown setting" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/cache/clear-and-refetch") {
      try {
        return jsonResponse(200, dependencies.settingsHandler.handleClearAndRefetch());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/packages") {
      return jsonResponse(200, dependencies.packagesHandler.handleList(url.searchParams.get("source") ?? undefined));
    }

    if (request.method === "POST" && url.pathname === "/api/packages") {
      try {
        return jsonResponse(200, dependencies.packagesHandler.handleCreate(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["name is required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/packages/low-stock") {
      return jsonResponse(200, dependencies.packagesHandler.handleLowStock());
    }

    if (request.method === "GET" && url.pathname === "/api/packages/find-by-dims") {
      try {
        const length = parseOptionalNumberQuery(url.searchParams.get("length"), "length") ?? 0;
        const width = parseOptionalNumberQuery(url.searchParams.get("width"), "width") ?? 0;
        const height = parseOptionalNumberQuery(url.searchParams.get("height"), "height") ?? 0;
        return jsonResponse(200, dependencies.packagesHandler.handleFindByDims(length, width, height));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/packages/auto-create") {
      try {
        return jsonResponse(200, dependencies.packagesHandler.handleAutoCreate(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["length, width, height are required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/packages/sync") {
      try {
        return jsonResponse(200, dependencies.packagesHandler.handleSync());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/shipments/sync") {
      try {
        return jsonResponse(200, dependencies.shipmentsHandler.handleSync());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/shipments/status") {
      try {
        return jsonResponse(200, dependencies.shipmentsHandler.handleStatus());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/sync/status") {
      try {
        return jsonResponse(200, dependencies.shipmentsHandler.handleLegacySyncStatus());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/sync/trigger") {
      try {
        const body = request.headers.get("content-type")?.includes("application/json") ? await readJson() as { full?: boolean } : {};
        const full = url.searchParams.get("full") === "1" || body.full === true;
        return jsonResponse(200, dependencies.shipmentsHandler.handleLegacySyncTrigger(full));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/shipments") {
      try {
        return jsonResponse(200, await dependencies.shipmentsHandler.handleList(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    const packageLedgerMatch = url.pathname.match(/^\/api\/packages\/(\d+)\/ledger$/);
    if (packageLedgerMatch && request.method === "GET") {
      return jsonResponse(200, dependencies.packagesHandler.handleLedger(Number.parseInt(packageLedgerMatch[1] ?? "0", 10)));
    }

    const packageReceiveMatch = url.pathname.match(/^\/api\/packages\/(\d+)\/receive$/);
    if (packageReceiveMatch && request.method === "POST") {
      try {
        return jsonResponse(200, dependencies.packagesHandler.handleReceive(Number.parseInt(packageReceiveMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["qty must be > 0"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const packageAdjustMatch = url.pathname.match(/^\/api\/packages\/(\d+)\/adjust$/);
    if (packageAdjustMatch && request.method === "POST") {
      try {
        return jsonResponse(200, dependencies.packagesHandler.handleAdjust(Number.parseInt(packageAdjustMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["qty is required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const packageReorderMatch = url.pathname.match(/^\/api\/packages\/(\d+)\/reorder-level$/);
    if (packageReorderMatch && request.method === "PATCH") {
      try {
        const body = await readJson();
        return jsonResponse(
          200,
          dependencies.packagesHandler.handleSetReorderLevel(
            Number.parseInt(packageReorderMatch[1] ?? "0", 10),
            Number(String(body.reorderLevel)),
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["reorderLevel must be a number"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/locations") {
      return jsonResponse(200, dependencies.locationsHandler.handleList());
    }

    if (request.method === "POST" && url.pathname === "/api/locations") {
      try {
        return jsonResponse(200, dependencies.locationsHandler.handleCreate(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["name is required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const locationMatch = url.pathname.match(/^\/api\/locations\/(\d+)$/);
    if (locationMatch && request.method === "PUT") {
      try {
        return jsonResponse(200, dependencies.locationsHandler.handleUpdate(Number.parseInt(locationMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (locationMatch && request.method === "DELETE") {
      try {
        return jsonResponse(200, dependencies.locationsHandler.handleDelete(Number.parseInt(locationMatch[1] ?? "0", 10)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const locationDefaultMatch = url.pathname.match(/^\/api\/locations\/(\d+)\/setDefault$/);
    if (locationDefaultMatch && request.method === "POST") {
      try {
        return jsonResponse(200, dependencies.locationsHandler.handleSetDefault(Number.parseInt(locationDefaultMatch[1] ?? "0", 10)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    const packageMatch = url.pathname.match(/^\/api\/packages\/(\d+)$/);
    if (packageMatch && request.method === "GET") {
      const payload = dependencies.packagesHandler.handleGetById(Number.parseInt(packageMatch[1] ?? "0", 10));
      if (!payload) return jsonResponse(404, { error: "Package not found" });
      return jsonResponse(200, payload);
    }

    if (packageMatch && request.method === "PUT") {
      try {
        return jsonResponse(200, dependencies.packagesHandler.handleUpdate(Number.parseInt(packageMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (packageMatch && request.method === "DELETE") {
      return jsonResponse(200, dependencies.packagesHandler.handleDelete(Number.parseInt(packageMatch[1] ?? "0", 10)));
    }

    if (request.method === "GET" && url.pathname === "/api/clients") {
      return jsonResponse(200, dependencies.clientsHandler.handleList());
    }

    if (request.method === "POST" && url.pathname === "/api/clients") {
      try {
        return jsonResponse(200, dependencies.clientsHandler.handleCreate(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["name is required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/clients/sync-stores") {
      try {
        return jsonResponse(200, await dependencies.clientsHandler.handleSyncStores());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const clientMatch = url.pathname.match(/^\/api\/clients\/(\d+)$/);
    if (clientMatch && request.method === "PUT") {
      try {
        return jsonResponse(200, dependencies.clientsHandler.handleUpdate(Number.parseInt(clientMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (clientMatch && request.method === "DELETE") {
      try {
        return jsonResponse(200, dependencies.clientsHandler.handleDelete(Number.parseInt(clientMatch[1] ?? "0", 10)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/inventory") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleList(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/inventory/receive") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleReceive(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["clientId required", "items array required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/inventory/adjust") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleAdjust(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["invSkuId and qty required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/inventory/ledger") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleLedger(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/inventory/alerts") {
      try {
        const clientId = parseOptionalIntegerParam(url.searchParams.get("clientId"), "clientId") ?? 0;
        return jsonResponse(200, dependencies.inventoryHandler.handleAlerts(clientId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["clientId required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/inventory/populate") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handlePopulate());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/inventory/import-dims") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleImportDimensions(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/inventory/bulk-update-dims") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleBulkUpdateDimensions(await readJson() as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["updates array required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/parent-skus") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleListParentSkus(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["clientId required", "id required"]) ? 400 : message === "Parent SKU not found" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/parent-skus") {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleCreateParentSku(await readJson() as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["clientId and name required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const parentSkuMatch = url.pathname.match(/^\/api\/parent-skus\/(\d+)$/);
    if (request.method === "DELETE" && parentSkuMatch) {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleDeleteParent(Number.parseInt(parentSkuMatch[1] ?? "0", 10)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message.startsWith("Cannot delete parent") ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/orders") {
      try {
        return jsonResponse(200, await dependencies.ordersHandler.handleList(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/orders/ids") {
      try {
        return jsonResponse(200, dependencies.ordersHandler.handleGetIds(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["sku required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/orders/picklist") {
      try {
        return jsonResponse(200, dependencies.ordersHandler.handlePicklist(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/orders/daily-stats") {
      try {
        return jsonResponse(200, dependencies.ordersHandler.handleDailyStats());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/orders/export") {
      try {
        const result = dependencies.ordersHandler.handleExport(url);
        return new Response(result.body, {
          status: 200,
          headers: {
            "content-type": result.contentType,
            "content-disposition": `attachment; filename="${result.filename}"`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const fullOrderMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/full$/);
    if (request.method === "GET" && fullOrderMatch) {
      const payload = dependencies.ordersHandler.handleGetFull(Number.parseInt(fullOrderMatch[1] ?? "0", 10));
      if (!payload) {
        return jsonResponse(404, { error: "Order not found" });
      }
      return jsonResponse(200, payload);
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
    if (request.method === "GET" && orderMatch) {
      const payload = dependencies.ordersHandler.handleGetById(Number.parseInt(orderMatch[1] ?? "0", 10));
      if (!payload) {
        return jsonResponse(404, { error: "Order not found" });
      }
      return jsonResponse(200, payload);
    }

    const externalMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/shipped-external$/);
    if (request.method === "POST" && externalMatch) {
      try {
        const body = await readJson();
        return jsonResponse(200, dependencies.ordersHandler.handleSetExternalShipped(Number.parseInt(externalMatch[1] ?? "0", 10), body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const residentialMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/residential$/);
    if (request.method === "POST" && residentialMatch) {
      try {
        const body = await readJson();
        return jsonResponse(200, dependencies.ordersHandler.handleSetResidential(Number.parseInt(residentialMatch[1] ?? "0", 10), body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const selectedPidMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/selected-pid$/);
    if (request.method === "POST" && selectedPidMatch) {
      try {
        const body = await readJson();
        return jsonResponse(200, dependencies.ordersHandler.handleSetSelectedPid(Number.parseInt(selectedPidMatch[1] ?? "0", 10), body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const selectedPackageIdMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/selected-package-id$/);
    if (request.method === "POST" && selectedPackageIdMatch) {
      try {
        const body = await readJson();
        return jsonResponse(200, dependencies.ordersHandler.handleSetSelectedPid(Number.parseInt(selectedPackageIdMatch[1] ?? "0", 10), {
          selectedPid: body.selectedPid ?? body.packageId ?? null,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const bestRateMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/best-rate$/);
    if (request.method === "POST" && bestRateMatch) {
      try {
        const body = await readJson();
        return jsonResponse(200, dependencies.ordersHandler.handleSetBestRate(Number.parseInt(bestRateMatch[1] ?? "0", 10), body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["best + orderId required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const saveDimsMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/save-dims$/);
    if (request.method === "POST" && saveDimsMatch) {
      try {
        const body = await readJson();
        return jsonResponse(200, dependencies.ordersHandler.handleSaveDims(Number.parseInt(saveDimsMatch[1] ?? "0", 10), body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    const getDimsMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/dims$/);
    if (request.method === "GET" && getDimsMatch) {
      try {
        const orderId = Number.parseInt(getDimsMatch[1] ?? "0", 10);
        const dims = dependencies.ordersHandler.handleGetDims(orderId);
        return jsonResponse(200, dims);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    const inventoryLedgerMatch = url.pathname.match(/^\/api\/inventory\/(\d+)\/ledger$/);
    if (request.method === "GET" && inventoryLedgerMatch) {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleInventoryLedger(Number.parseInt(inventoryLedgerMatch[1] ?? "0", 10)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    const inventoryMatch = url.pathname.match(/^\/api\/inventory\/(\d+)$/);
    if (request.method === "PUT" && inventoryMatch) {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleUpdate(Number.parseInt(inventoryMatch[1] ?? "0", 10), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error) || message.includes("dimensions must be all > 0 or all 0") ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const inventorySetParentMatch = url.pathname.match(/^\/api\/inventory\/(\d+)\/set-parent$/);
    if (request.method === "PUT" && inventorySetParentMatch) {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleSetParent(Number.parseInt(inventorySetParentMatch[1] ?? "0", 10), await readJson() as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error) ? 400 : message === "Parent SKU not found" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const skuOrdersMatch = url.pathname.match(/^\/api\/inventory\/(\d+)\/sku-orders$/);
    if (request.method === "GET" && skuOrdersMatch) {
      try {
        return jsonResponse(200, dependencies.inventoryHandler.handleSkuOrders(Number.parseInt(skuOrdersMatch[1] ?? "0", 10), url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error) ? 400 : message === "SKU not found" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/products/bulk") {
      try {
        return jsonResponse(200, dependencies.productsHandler.handleBulk(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    const productBySkuMatch = url.pathname.match(/^\/api\/products\/by-sku\/(.+)$/);
    if (request.method === "GET" && productBySkuMatch) {
      try {
        const payload = dependencies.productsHandler.handleBySku(decodeURIComponent(productBySkuMatch[1] ?? ""));
        if (!payload) return jsonResponse(404, { error: "Not found" });
        return jsonResponse(200, payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(500, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/products/save-defaults") {
      try {
        return jsonResponse(200, dependencies.productsHandler.handleSaveDefaults(await readJson() as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["productId or sku required", "Nothing to save"]) ? 400 : message === "Product not found" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const productDefaultsMatch = url.pathname.match(/^\/api\/products\/(.+)\/defaults$/);
    if (request.method === "POST" && productDefaultsMatch) {
      try {
        return jsonResponse(200, dependencies.productsHandler.handleSaveSkuDefaults(decodeURIComponent(productDefaultsMatch[1] ?? ""), await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["productId or sku required", "Nothing to save"]) ? 400 : message === "Product not found" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/manifests/generate") {
      try {
        const startDate = url.searchParams.get("startDate") ?? "";
        const endDate = url.searchParams.get("endDate") ?? "";
        const carrierId = url.searchParams.get("carrierId") ?? null;
        const clientIdRaw = url.searchParams.get("clientId");
        const clientId = clientIdRaw ? Number.parseInt(clientIdRaw, 10) : null;
        const manifest = dependencies.manifestsHandler.handleGenerate({ startDate, endDate, carrierId, clientId });
        return new Response(manifest.body, {
          status: 200,
          headers: {
            "content-type": manifest.contentType,
            "content-disposition": `attachment; filename="${manifest.filename}"`,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error, ["startDate and endDate required (YYYY-MM-DD format)"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/labels/create-batch") {
      try {
        return jsonResponse(200, await dependencies.labelsHandler.handleCreateBatch(await readJson()));
      } catch (error) {
        const err = error as Error & { rateLimited?: boolean; retryAfterMs?: number };
        const message = err instanceof Error ? err.message : "Unknown error";
        if (err.rateLimited) {
          const retryAfter = Math.ceil((err.retryAfterMs ?? 60000) / 1000);
          return jsonResponse(429, {
            error: message,
            retryAfter,
            rateLimited: true,
          });
        }
        const status = isInputError(error, ["orderIds must be a non-empty array", "serviceCode is required", "shippingProviderId is required"]) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/labels/create") {
      try {
        const requestBody = await readJson();
        console.log("[DEBUG] /api/labels/create request body:", JSON.stringify(requestBody, null, 2));
        const response = await dependencies.labelsHandler.handleCreate(requestBody as never);
        console.log("[DEBUG] /api/labels/create succeeded:", JSON.stringify(response, null, 2));
        return jsonResponse(200, response);
      } catch (error) {
        const err = error as Error & { details?: Record<string, unknown>; rateLimited?: boolean; retryAfterMs?: number };
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[DEBUG] /api/labels/create error:", message, err.details ? JSON.stringify(err.details) : "");
        if (err.rateLimited) {
          const retryAfter = Math.ceil((err.retryAfterMs ?? 60000) / 1000);
          return jsonResponse(429, {
            error: message,
            retryAfter,
            rateLimited: true,
            ...(err.details ?? {}),
          });
        }
        const status = isInputError(error, ["orderId and serviceCode required", "shippingProviderId required for v2 label creation", "Order weight required to create label"])
          ? 400
          : message === "Order not found"
            ? 404
            : message.startsWith("Cannot create label for") || message === "Label already exists for this order"
              ? 400
              : 500;
        return jsonResponse(status, { error: message, ...(err.details ?? {}) });
      }
    }

    const labelVoidMatch = url.pathname.match(/^\/api\/labels\/(\d+)\/void$/);
    if (request.method === "POST" && labelVoidMatch) {
      try {
        return jsonResponse(200, await dependencies.labelsHandler.handleVoid(Number.parseInt(labelVoidMatch[1] ?? "0", 10)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message === "Shipment not found" ? 404 : message === "Label already voided" ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const labelReturnMatch = url.pathname.match(/^\/api\/labels\/(\d+)\/return$/);
    if (request.method === "POST" && labelReturnMatch) {
      try {
        return jsonResponse(200, await dependencies.labelsHandler.handleReturn(Number.parseInt(labelReturnMatch[1] ?? "0", 10), await readJson() as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = isInputError(error) ? 400 : message === "Shipment not found" ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    const labelRetrieveMatch = url.pathname.match(/^\/api\/labels\/([^/]+)\/retrieve$/);
    if (request.method === "GET" && labelRetrieveMatch) {
      try {
        const rawLookup = decodeURIComponent(labelRetrieveMatch[1] ?? "");
        const numericLookup = Number.parseInt(rawLookup, 10);
        const orderLookup = Number.isFinite(numericLookup) && String(numericLookup) === rawLookup ? numericLookup : rawLookup;
        return jsonResponse(200, await dependencies.labelsHandler.handleRetrieve(orderLookup, url.searchParams.get("fresh") === "true"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message.startsWith("No active label found") || message.startsWith("Label was created") || message === "Label URL not available. The label may have been voided or deleted." ? 404 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    // ── PRINT QUEUE ENDPOINTS ────────────────────────────────────────────────

    // CRITICAL #1: GET /api/queue — hydrate UI from DB (source of truth)
    if (request.method === "GET" && url.pathname === "/api/queue") {
      try {
        return jsonResponse(200, dependencies.queueHandler.handleGet(url));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    // CRITICAL #2: POST /api/queue/add — atomic add to queue
    if (request.method === "POST" && url.pathname === "/api/queue/add") {
      try {
        const body = await readJson();
        const result = dependencies.queueHandler.handleAdd(body);
        // 200 with already_queued flag so frontend can show toast
        return jsonResponse(200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    // POST /api/queue/clear — remove all queued orders for a client
    if (request.method === "POST" && url.pathname === "/api/queue/clear") {
      try {
        return jsonResponse(200, dependencies.queueHandler.handleClear(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    // CRITICAL #5: POST /api/queue/print — start async PDF merge job
    if (request.method === "POST" && url.pathname === "/api/queue/print") {
      try {
        return jsonResponse(200, dependencies.queueHandler.handleStartPrint(await readJson()));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return jsonResponse(isInputError(error) ? 400 : 500, { error: message });
      }
    }

    // GET /api/queue/print/status/:jobId — poll job status
    const printStatusMatch = url.pathname.match(/^\/api\/queue\/print\/status\/([^/]+)$/);
    if (request.method === "GET" && printStatusMatch) {
      const jobId = printStatusMatch[1] ?? "";
      const status = dependencies.queueHandler.handleJobStatus(jobId);
      if (!status) return jsonResponse(404, { error: "Job not found" });
      return jsonResponse(200, status);
    }

    // GET /api/queue/print/download/:jobId — download the merged PDF
    const printDownloadMatch = url.pathname.match(/^\/api\/queue\/print\/download\/([^/]+)$/);
    if (request.method === "GET" && printDownloadMatch) {
      const jobId = printDownloadMatch[1] ?? "";
      const dl = dependencies.queueHandler.handleJobDownload(jobId);
      if (!dl) return jsonResponse(404, { error: "Job not found or not ready" });
      const pdfBytes = Buffer.from(dl.base64, 'base64');
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${dl.fileName}"`,
          "content-length": String(pdfBytes.byteLength),
        },
      });
    }

    // DELETE /api/queue/:entryId — remove single order from queue
    const queueEntryMatch = url.pathname.match(/^\/api\/queue\/([^/]+)$/);
    if (request.method === "DELETE" && queueEntryMatch) {
      try {
        // Support client_id in body (preferred) OR query param (fallback for clients that don't send DELETE bodies)
        const body = await readJson();
        const clientIdFromQuery = url.searchParams.get('client_id');
        if (!body.client_id && clientIdFromQuery) body.client_id = Number(clientIdFromQuery);
        return jsonResponse(200, dependencies.queueHandler.handleRemove(queueEntryMatch[1] ?? "", body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message.includes("not found") ? 404 : isInputError(error) ? 400 : 500;
        return jsonResponse(status, { error: message });
      }
    }

    return jsonResponse(404, { error: "Not found" });
  };
}
