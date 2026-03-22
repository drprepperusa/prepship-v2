/**
 * API Client Wrapper - Typed fetch wrapper for PrepShip V2 endpoints
 * Handles authentication, error handling, and response typing
 */

import type {
  ListOrdersQuery,
  ListOrdersResponse,
  OrderFullDto,
  ClientDto,
  CarrierAccountDto,
  InitCountsDto,
  InitStoreDto,
  InventoryItemDto,
  InventoryLedgerEntryDto,
  InventoryAlertDto,
  LocationDto,
  ShipmentSyncStatusDto,
  LegacySyncStatusDto,
  ProductDefaultsDto,
  ReceiveInventoryInput,
  ReceiveInventoryResultDto,
  AdjustInventoryInput,
  UpdateInventoryItemInput,
  SaveLocationInput,
  UpdateClientInput,
  SaveProductDefaultsInput,
  SaveProductDefaultsResult,
  ParentSkuDetailDto,
  ListInventoryQuery,
  ListInventoryLedgerQuery,
} from "../types/api";

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message?: string
  ) {
    super(message || `API Error: ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

/**
 * API Client configuration and methods
 */
class ApiClient {
  private baseUrl: string;
  private appToken: string | null = null;

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
    this.loadToken();
  }

  /**
   * Load app token from localStorage
   */
  private loadToken() {
    if (typeof window !== "undefined") {
      this.appToken = localStorage.getItem("app-token");
    }
  }

  /**
   * Set app token
   */
  setToken(token: string) {
    this.appToken = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("app-token", token);
    }
  }

  /**
   * Clear app token
   */
  clearToken() {
    this.appToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("app-token");
    }
  }

  /**
   * Build headers with authentication
   */
  private buildHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    if (this.appToken) {
      headers["X-App-Token"] = this.appToken;
    }

    return headers;
  }

  /**
   * Make authenticated fetch request
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      query?: Record<string, unknown>;
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { method = "GET", query, body, headers: customHeaders } = options;

    let url = `${this.baseUrl}${endpoint}`;

    // Append query parameters
    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: this.buildHeaders(customHeaders),
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(
        response.status,
        response.statusText,
        text || `HTTP ${response.status}`
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * GET /orders
   */
  async fetchOrders(query: ListOrdersQuery): Promise<ListOrdersResponse> {
    return this.request<ListOrdersResponse>("/orders", {
      method: "GET",
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

  async listOrders(query: ListOrdersQuery): Promise<ListOrdersResponse> {
    return this.fetchOrders(query);
  }

  /**
   * GET /orders/:id
   */
  async fetchOrderDetail(orderId: number): Promise<unknown> {
    return this.request(`/orders/${orderId}`, { method: "GET" });
  }

  /**
   * GET /orders/:id/full
   */
  async fetchOrderFull(orderId: number): Promise<OrderFullDto> {
    return this.request<OrderFullDto>(`/orders/${orderId}/full`, { method: "GET" });
  }

  /**
   * PUT /orders/:id
   */
  async updateOrder(
    orderId: number,
    data: Record<string, unknown>
  ): Promise<unknown> {
    return this.request(`/orders/${orderId}`, {
      method: "PUT",
      body: data,
    });
  }

  /**
   * GET /clients
   */
  async fetchClients(): Promise<ClientDto[]> {
    return this.request<ClientDto[]>("/clients", { method: "GET" });
  }

  async listClients(): Promise<ClientDto[]> {
    return this.fetchClients();
  }

  /**
   * GET /counts
   */
  async fetchCounts(): Promise<InitCountsDto> {
    return this.request<InitCountsDto>("/counts", { method: "GET" });
  }

  /**
   * GET /stores
   */
  async fetchStores(): Promise<InitStoreDto[]> {
    return this.request<InitStoreDto[]>("/stores", { method: "GET" });
  }

  /**
   * GET /clients/:id
   */
  async fetchClientDetail(clientId: number): Promise<ClientDto> {
    return this.request<ClientDto>(`/clients/${clientId}`, { method: "GET" });
  }

  /**
   * POST /clients
   */
  async createClient(data: Record<string, unknown>): Promise<ClientDto> {
    return this.request<ClientDto>("/clients", {
      method: "POST",
      body: data,
    });
  }

  /**
   * PUT /clients/:id
   */
  async updateClient(
    clientId: number,
    data: UpdateClientInput
  ): Promise<ClientDto> {
    return this.request<ClientDto>(`/clients/${clientId}`, {
      method: "PUT",
      body: data,
    });
  }

  /**
   * GET /inventory
   */
  async fetchInventory(query?: ListInventoryQuery): Promise<InventoryItemDto[]> {
    const queryParams: Record<string, unknown> = {};
    if (query) {
      if (query.clientId !== undefined) queryParams.clientId = query.clientId;
      if (query.sku !== undefined) queryParams.sku = query.sku;
    }
    return this.request<InventoryItemDto[]>("/inventory", {
      method: "GET",
      query: queryParams,
    });
  }

  /**
   * GET /inventory/:id
   */
  async fetchInventoryDetail(invSkuId: number): Promise<InventoryItemDto> {
    return this.request<InventoryItemDto>(`/inventory/${invSkuId}`, {
      method: "GET",
    });
  }

  /**
   * PUT /inventory/:id
   */
  async updateInventoryItem(
    invSkuId: number,
    data: UpdateInventoryItemInput
  ): Promise<InventoryItemDto> {
    return this.request<InventoryItemDto>(`/inventory/${invSkuId}`, {
      method: "PUT",
      body: data,
    });
  }

  /**
   * GET /inventory/alerts
   */
  async fetchInventoryAlerts(): Promise<InventoryAlertDto[]> {
    return this.request<InventoryAlertDto[]>("/inventory/alerts", {
      method: "GET",
    });
  }

  /**
   * GET /inventory/ledger
   */
  async fetchInventoryLedger(
    query: ListInventoryLedgerQuery
  ): Promise<InventoryLedgerEntryDto[]> {
    const queryParams: Record<string, unknown> = {
      limit: query.limit,
    };
    if (query.clientId !== undefined) queryParams.clientId = query.clientId;
    if (query.type !== undefined) queryParams.type = query.type;
    if (query.dateStart !== undefined) queryParams.dateStart = query.dateStart;
    if (query.dateEnd !== undefined) queryParams.dateEnd = query.dateEnd;
    
    return this.request<InventoryLedgerEntryDto[]>("/inventory/ledger", {
      method: "GET",
      query: queryParams,
    });
  }

  /**
   * POST /inventory/receive
   */
  async receiveInventory(
    data: ReceiveInventoryInput
  ): Promise<ReceiveInventoryResultDto[]> {
    return this.request<ReceiveInventoryResultDto[]>("/inventory/receive", {
      method: "POST",
      body: data,
    });
  }

  /**
   * POST /inventory/adjust
   */
  async adjustInventory(data: AdjustInventoryInput): Promise<InventoryItemDto> {
    return this.request<InventoryItemDto>("/inventory/adjust", {
      method: "POST",
      body: data,
    });
  }

  /**
   * GET /inventory/parent/:id
   */
  async fetchParentSkuDetail(parentSkuId: number): Promise<ParentSkuDetailDto> {
    return this.request<ParentSkuDetailDto>(`/inventory/parent/${parentSkuId}`, {
      method: "GET",
    });
  }

  /**
   * GET /locations
   */
  async fetchLocations(): Promise<LocationDto[]> {
    return this.request<LocationDto[]>("/locations", { method: "GET" });
  }

  /**
   * GET /carrier-accounts
   */
  async fetchCarrierAccounts(): Promise<CarrierAccountDto[]> {
    return this.request<CarrierAccountDto[]>("/carrier-accounts", { method: "GET" });
  }

  /**
   * GET /locations/:id
   */
  async fetchLocationDetail(locationId: number): Promise<LocationDto> {
    return this.request<LocationDto>(`/locations/${locationId}`, {
      method: "GET",
    });
  }

  /**
   * POST /locations
   */
  async createLocation(data: SaveLocationInput): Promise<LocationDto> {
    return this.request<LocationDto>("/locations", {
      method: "POST",
      body: data,
    });
  }

  /**
   * PUT /locations/:id
   */
  async updateLocation(
    locationId: number,
    data: SaveLocationInput
  ): Promise<LocationDto> {
    return this.request<LocationDto>(`/locations/${locationId}`, {
      method: "PUT",
      body: data,
    });
  }

  /**
   * DELETE /locations/:id
   */
  async deleteLocation(locationId: number): Promise<void> {
    await this.request(`/locations/${locationId}`, { method: "DELETE" });
  }

  /**
   * GET /shipments/sync-status
   */
  async fetchShipmentSyncStatus(): Promise<ShipmentSyncStatusDto> {
    return this.request<ShipmentSyncStatusDto>("/shipments/sync-status", {
      method: "GET",
    });
  }

  /**
   * POST /shipments/sync
   */
  async triggerShipmentSync(): Promise<{ queued: boolean }> {
    return this.request<{ queued: boolean }>("/shipments/sync", {
      method: "POST",
    });
  }

  /**
   * GET /legacy-sync-status
   */
  async fetchLegacySyncStatus(): Promise<LegacySyncStatusDto> {
    return this.request<LegacySyncStatusDto>("/legacy-sync-status", {
      method: "GET",
    });
  }

  /**
   * POST /legacy-sync
   */
  async triggerLegacySync(mode?: "incremental" | "full"): Promise<{ queued: boolean }> {
    return this.request<{ queued: boolean }>("/legacy-sync", {
      method: "POST",
      body: mode ? { mode } : undefined,
    });
  }

  /**
   * GET /products
   */
  async fetchProducts(query?: { clientId?: number }): Promise<ProductDefaultsDto[]> {
    return this.request<ProductDefaultsDto[]>("/products", {
      method: "GET",
      query,
    });
  }

  /**
   * POST /products
   */
  async saveProductDefaults(
    data: SaveProductDefaultsInput
  ): Promise<SaveProductDefaultsResult> {
    return this.request<SaveProductDefaultsResult>("/products", {
      method: "POST",
      body: data,
    });
  }
}

/**
 * Singleton instance
 */
export const apiClient = new ApiClient();

/**
 * Export for testing/overrides
 */
export default apiClient;
