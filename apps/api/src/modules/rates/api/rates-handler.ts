import type {
  BrowseRatesRequestDto,
  CarrierLookupResponseDto,
  GetCachedRatesQuery,
  LiveRatesRequestDto,
} from "../../../../../../../packages/contracts/src/rates/contracts.ts";
import type { RateServices } from "../application/rate-services.ts";

export class RatesHttpHandler {
  private readonly services: RateServices;

  constructor(services: RateServices) {
    this.services = services;
  }

  handleCached(query: GetCachedRatesQuery) {
    return this.services.getCached(query);
  }

  handleCachedBulk(body: unknown) {
    if (!Array.isArray(body)) {
      throw new Error("Expected array");
    }
    return this.services.getCachedBulk(body);
  }

  handleCarriersForStore(storeId: number | null): CarrierLookupResponseDto {
    return { carriers: this.services.listCarriersForStore(storeId) };
  }

  handleLiveRates(body: LiveRatesRequestDto) {
    return this.services.getLiveRates(body);
  }

  handleBrowseRates(body: BrowseRatesRequestDto) {
    return this.services.browseRates(body);
  }

  handleClearAndRefetch() {
    return this.services.clearAndRefetch();
  }

  handlePrefetchDisabled() {
    return {
      queued: false,
      message: "Prefetch disabled - rates are cached on demand",
    };
  }
}
