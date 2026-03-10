import {
  parseBillingDetailsQuery,
  parseBillingPackagePricesQuery,
  parseBillingSummaryQuery,
} from "../../../../../../packages/contracts/src/billing/contracts.ts";
import type { BillingServices } from "../application/billing-services.ts";

export class BillingHttpHandler {
  private readonly services: BillingServices;

  constructor(services: BillingServices) {
    this.services = services;
  }

  handleConfig() {
    return this.services.getConfig();
  }

  handleSummary(url: URL) {
    return this.services.getSummary(parseBillingSummaryQuery(url));
  }

  handleDetails(url: URL) {
    return this.services.getDetails(parseBillingDetailsQuery(url));
  }

  handlePackagePrices(url: URL) {
    return this.services.getPackagePrices(parseBillingPackagePricesQuery(url).clientId);
  }

  handleUpdateConfig(clientId: number, body: unknown) {
    return this.services.updateConfig(clientId, body as Record<string, unknown>);
  }

  handleGenerate(body: unknown) {
    return this.services.generate(body as Record<string, unknown>);
  }

  handleUpdatePackagePrices(body: unknown) {
    return this.services.savePackagePrices(body as Record<string, unknown>);
  }

  handleSetDefaultPackagePrices(body: unknown) {
    return this.services.setDefaultPackagePrice(body as Record<string, unknown>);
  }

  handleInvoice(url: URL) {
    const clientId = Number.parseInt(url.searchParams.get("clientId") ?? "0", 10);
    return this.services.getInvoice(clientId, url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
  }

  handleFetchRefRates() {
    return this.services.fetchReferenceRates();
  }

  handleFetchRefRatesStatus() {
    return this.services.getRefRateFetchStatus();
  }

  handleBackfillRefRates(body: unknown) {
    return this.services.backfillReferenceRates(body as Record<string, unknown>);
  }
}
