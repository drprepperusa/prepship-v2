/**
 * Typed API client for PrepShip backend
 * Provides fetch wrapper with error handling and type-safe endpoint definitions
 */

import type {
  ListOrdersResponse,
  ListOrdersQuery,
  OrderSummaryDto,
  OrderFullDto,
  GetOrderIdsQuery,
  GetOrderIdsResponse,
  GetOrderPicklistQuery,
  GetOrderPicklistResponse,
  OrdersDailyStatsDto,
  OrderExportQuery,
} from "@prepshipv2/contracts/orders/contracts";
import type { RateDto, GetCachedRatesQuery, CachedRatesResponseDto, LiveRatesRequestDto } from "@prepshipv2/contracts/rates/contracts";
import type { LocationDto, SaveLocationInput } from "@prepshipv2/contracts/locations/contracts";
import type { ClientDto, CreateClientInput, UpdateClientInput } from "@prepshipv2/contracts/clients/contracts";
import type { InitDataDto } from "@prepshipv2/contracts/init/contracts";
import type { CarrierAccountDto } from "@prepshipv2/contracts/init/contracts";

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    endpoint: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);

    // Add query params
    if (options?.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (options?.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url.toString(), fetchOptions);

      if (!response.ok) {
        let details: unknown;
        try {
          details = await response.json();
        } catch {
          // Response wasn't JSON
        }

        const error: ApiError = {
          status: response.status,
          message: `API request failed: ${response.statusText}`,
          details,
        };
        console.error(`[API ${method} ${endpoint}]`, error);
        throw new Error(error.message);
      }

      const data = await response.json();
      return data as T;
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }

      const message = `Network error: ${typeof err === 'string' ? err : 'Unknown error'}`;
      console.error(`[API ${method} ${endpoint}]`, message);
      throw new Error(message);
    }
  }

  // ====== Orders ======
  async listOrders(query: ListOrdersQuery): Promise<ListOrdersResponse> {
    return this.request<ListOrdersResponse>("GET", "/orders", {
      query: {
        page: query.page,
        pageSize: query.pageSize,
        orderStatus: query.orderStatus,
        storeId: query.storeId,
        clientId: query.clientId,
        dateStart: query.dateStart,
        dateEnd: query.dateEnd,
      },
    });
  }

  async getOrderDetail(orderId: number): Promise<OrderSummaryDto> {
    return this.request<OrderSummaryDto>("GET", `/orders/${orderId}`);
  }

  async getOrderIds(query: GetOrderIdsQuery): Promise<GetOrderIdsResponse> {
    return this.request<GetOrderIdsResponse>("GET", "/orders/ids", {
      query: {
        sku: query.sku,
        qty: query.qty,
        orderStatus: query.orderStatus,
        storeId: query.storeId,
      },
    });
  }

  async getOrderPicklist(query: GetOrderPicklistQuery): Promise<GetOrderPicklistResponse> {
    return this.request<GetOrderPicklistResponse>("GET", "/orders/picklist", {
      query: {
        orderStatus: query.orderStatus,
        storeId: query.storeId,
        dateStart: query.dateStart,
        dateEnd: query.dateEnd,
      },
    });
  }

  async getOrderDailyStats(): Promise<OrdersDailyStatsDto> {
    return this.request<OrdersDailyStatsDto>("GET", "/orders/daily-stats");
  }

  async exportOrders(query: OrderExportQuery): Promise<{ data: string }> {
    return this.request<{ data: string }>("GET", "/orders/export", {
      query: {
        orderStatus: query.orderStatus,
        pageSize: query.pageSize || 5000,
      },
    });
  }

  async setOrderExternalShipped(orderId: number, shipped: boolean, source?: string): Promise<void> {
    return this.request<void>("POST", `/orders/${orderId}/external-shipped`, {
      body: { flag: shipped, source },
    });
  }

  async setOrderResidential(orderId: number, residential: boolean | null): Promise<void> {
    return this.request<void>("POST", `/orders/${orderId}/residential`, {
      body: { residential },
    });
  }

  async setOrderSelectedPid(orderId: number, selectedPid: number | null): Promise<void> {
    return this.request<void>("POST", `/orders/${orderId}/selected-pid`, {
      body: { selectedPid },
    });
  }

  async setOrderBestRate(orderId: number, bestRate: unknown, dims?: string | null): Promise<void> {
    return this.request<void>("POST", `/orders/${orderId}/best-rate`, {
      body: { best: bestRate, dims },
    });
  }

  async getOrderDims(orderId: number): Promise<{ orderId: number; sku: string | null; qty: number | null; dims: { length: number; width: number; height: number } | null }> {
    return this.request<{ orderId: number; sku: string | null; qty: number | null; dims: { length: number; width: number; height: number } | null }>(
      "GET",
      `/orders/${orderId}/dims`
    );
  }

  async saveDims(
    orderId: number,
    sku: string | null,
    qty: number | null,
    length: number,
    width: number,
    height: number
  ): Promise<void> {
    return this.request<void>("POST", `/orders/${orderId}/dims`, {
      body: { sku, qty, length, width, height },
    });
  }

  // ====== Rates ======
  async getCachedRates(query: GetCachedRatesQuery): Promise<CachedRatesResponseDto> {
    return this.request<CachedRatesResponseDto>("GET", "/rates/cached", {
      query: {
        wt: query.wt,
        zip: query.zip,
        dims: query.dims ? JSON.stringify(query.dims) : undefined,
        residential: query.residential,
        storeId: query.storeId,
        signature: query.signature,
      },
    });
  }

  async getLiveRates(request: LiveRatesRequestDto): Promise<RateDto[]> {
    return this.request<RateDto[]>("POST", "/rates/live", {
      body: request,
    });
  }

  // ====== Locations ======
  async listLocations(): Promise<LocationDto[]> {
    return this.request<LocationDto[]>("GET", "/locations");
  }

  async createLocation(input: SaveLocationInput): Promise<LocationDto> {
    return this.request<LocationDto>("POST", "/locations", {
      body: input,
    });
  }

  async updateLocation(locationId: number, input: SaveLocationInput): Promise<LocationDto> {
    return this.request<LocationDto>("PUT", `/locations/${locationId}`, {
      body: input,
    });
  }

  async deleteLocation(locationId: number): Promise<void> {
    return this.request<void>("DELETE", `/locations/${locationId}`);
  }

  // ====== Clients / Stores ======
  async listClients(): Promise<ClientDto[]> {
    return this.request<ClientDto[]>("GET", "/clients");
  }

  async createClient(input: CreateClientInput): Promise<ClientDto> {
    return this.request<ClientDto>("POST", "/clients", {
      body: input,
    });
  }

  async updateClient(clientId: number, input: UpdateClientInput): Promise<ClientDto> {
    return this.request<ClientDto>("PUT", `/clients/${clientId}`, {
      body: input,
    });
  }

  async deleteClient(clientId: number): Promise<void> {
    return this.request<void>("DELETE", `/clients/${clientId}`);
  }

  // ====== Init / Carriers ======
  async getInitData(): Promise<InitDataDto> {
    return this.request<InitDataDto>("GET", "/init");
  }

  async getCarriers(): Promise<CarrierAccountDto[]> {
    return this.request<CarrierAccountDto[]>("GET", "/carriers");
  }

  // ====== Batch Operations ======
  async createLabels(orderIds: number[]): Promise<{ shipmentIds: number[] }> {
    return this.request<{ shipmentIds: number[] }>("POST", "/batch/create-labels", {
      body: { orderIds },
    });
  }

  async markShipped(orderIds: number[], source?: string): Promise<void> {
    return this.request<void>("POST", "/batch/mark-shipped", {
      body: { orderIds, source },
    });
  }

  async exportCsv(orderIds: number[]): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/batch/export-csv?ids=${orderIds.join(",")}`);
    if (!response.ok) {
      throw new Error(`Failed to export CSV: ${response.statusText}`);
    }
    return response.blob();
  }
}

// Create global instance
export const apiClient = new ApiClient();
