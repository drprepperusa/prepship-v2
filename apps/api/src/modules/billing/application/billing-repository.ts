import type {
  BackfillBillingReferenceRatesInput,
  BillingDetailsQuery,
  GenerateBillingInput,
  GenerateBillingResult,
  SaveBillingPackagePricesInput,
  SetDefaultBillingPackagePriceResult,
  BillingSummaryQuery,
  UpdateBillingConfigInput,
} from "../../../../../../../packages/contracts/src/billing/contracts.ts";
import type {
  BillingClientRecord,
  BillingBackfillReferenceRateOrderRecord,
  BillingConfigRecord,
  BillingDetailRecord,
  BillingFetchReferenceRateOrderRecord,
  BillingInvoiceRecord,
  BillingPackagePriceRecord,
  BillingSummaryRecord,
} from "../domain/billing.ts";
import type { RateDto } from "../../../../../../../packages/contracts/src/rates/contracts.ts";

export interface BillingRepository {
  listBillableClients(): BillingClientRecord[];
  listReferenceRateStoreIds(): number[];
  listConfigRecords(): BillingConfigRecord[];
  upsertConfig(clientId: number, input: UpdateBillingConfigInput): void;
  generate(input: Required<Pick<GenerateBillingInput, "from" | "to">> & Pick<GenerateBillingInput, "clientId">): GenerateBillingResult;
  listSummary(query: BillingSummaryQuery): BillingSummaryRecord[];
  listDetails(query: Required<BillingDetailsQuery>): BillingDetailRecord[];
  getInvoice(clientId: number, from: string, to: string): BillingInvoiceRecord | null;
  listPackagePrices(clientId: number): BillingPackagePriceRecord[];
  savePackagePrices(input: { clientId: number; prices: SaveBillingPackagePricesInput["prices"] }): void;
  setDefaultPackagePrice(packageId: number, price: number): SetDefaultBillingPackagePriceResult;
  listOrdersMissingReferenceRatesForFetch(storeIds: number[]): BillingFetchReferenceRateOrderRecord[];
  listOrdersMissingReferenceRatesForBackfill(input: BackfillBillingReferenceRatesInput): BillingBackfillReferenceRateOrderRecord[];
  findCachedReferenceRateCandidates(weightOz: number, zip5: string): RateDto[] | null;
  saveBackfilledReferenceRates(orderId: number, refUspsRate: number | null, refUpsRate: number | null): void;
}
