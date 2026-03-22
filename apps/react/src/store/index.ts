/**
 * Zustand Store - Central state management for PrepShip V2
 * Slice-based architecture with separate stores for each major resource
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiClient } from "../api/client";
import type {
  OrderRow,
  ListOrdersQuery,
  ListOrdersResponse,
  ClientRow,
  CreateClientInput,
  UpdateClientInput,
  InventoryRow,
  InventoryLedgerRow,
  InventoryAlertDto,
  ReceiveInventoryInput,
  ReceiveInventoryResultDto,
  AdjustInventoryInput,
  UpdateInventoryItemInput,
  LocationRow,
  SaveLocationInput,
  ShipmentSyncStatusDto,
  LegacySyncStatusDto,
  ProductRow,
  SaveProductDefaultsInput,
  SaveProductDefaultsResult,
  PaginationState,
  FilterState,
  PageMeta,
} from "../types/api";

// ============================================================================
// ORDERS STORE
// ============================================================================

export interface OrdersState {
  // Data
  orders: OrderRow[];
  selectedOrderId: number | null;

  // Loading & errors
  loading: boolean;
  error: string | null;

  // Pagination & filters
  pagination: PaginationState;
  filters: {
    orderStatus?: string;
    storeId?: number;
    clientId?: number;
    dateStart?: string;
    dateEnd?: string;
  };

  // Actions
  fetchOrders: (query?: Partial<ListOrdersQuery>) => Promise<void>;
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  selectOrder: (orderId: number | null) => void;
  updateOrder: (orderId: number, data: Record<string, unknown>) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>()(
  devtools((set, get) => ({
    orders: [],
    selectedOrderId: null,
    loading: false,
    error: null,
    pagination: {
      page: 1,
      pageSize: 50,
      total: 0,
      pages: 0,
    },
    filters: {},

    fetchOrders: async (query) => {
      set({ loading: true, error: null });
      try {
        const { pagination, filters } = get();
        const params: ListOrdersQuery = {
          page: query?.page ?? pagination.page,
          pageSize: query?.pageSize ?? pagination.pageSize,
          orderStatus: query?.orderStatus ?? filters.orderStatus,
          storeId: query?.storeId ?? filters.storeId,
          clientId: query?.clientId ?? filters.clientId,
          dateStart: query?.dateStart ?? filters.dateStart,
          dateEnd: query?.dateEnd ?? filters.dateEnd,
        };

        const response = await apiClient.fetchOrders(params);
        set({
          orders: response.orders,
          pagination: {
            page: response.page,
            pageSize: params.pageSize,
            total: response.total,
            pages: response.pages,
          },
          loading: false,
        });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch orders",
          loading: false,
        });
      }
    },

    setFilter: (key, value) => {
      set((state) => ({
        filters: {
          ...state.filters,
          [key]: value,
        },
        pagination: { ...state.pagination, page: 1 }, // Reset to page 1 on filter change
      }));
    },

    clearFilters: () => {
      set({
        filters: {},
        pagination: { page: 1, pageSize: 50, total: 0, pages: 0 },
      });
    },

    setPage: (page) => {
      set((state) => ({
        pagination: { ...state.pagination, page },
      }));
    },

    setPageSize: (pageSize) => {
      set((state) => ({
        pagination: { ...state.pagination, pageSize, page: 1 },
      }));
    },

    selectOrder: (orderId) => {
      set({ selectedOrderId: orderId });
    },

    updateOrder: async (orderId, data) => {
      set({ loading: true, error: null });
      try {
        await apiClient.updateOrder(orderId, data);
        // Refetch orders after update
        const { fetchOrders } = get();
        await fetchOrders();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to update order",
          loading: false,
        });
      }
    },
  }))
);

// ============================================================================
// CLIENTS STORE
// ============================================================================

export interface ClientsState {
  // Data
  clients: ClientRow[];
  activeClientId: number | null;

  // Loading & errors
  loading: boolean;
  error: string | null;

  // Actions
  fetchClients: () => Promise<void>;
  fetchClientDetail: (clientId: number) => Promise<ClientRow>;
  createClient: (data: CreateClientInput) => Promise<ClientRow>;
  updateClient: (clientId: number, data: UpdateClientInput) => Promise<ClientRow>;
  setActiveClient: (clientId: number | null) => void;
}

export const useClientsStore = create<ClientsState>()(
  devtools((set) => ({
    clients: [],
    activeClientId: null,
    loading: false,
    error: null,

    fetchClients: async () => {
      set({ loading: true, error: null });
      try {
        const clients = await apiClient.fetchClients();
        set({ clients, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch clients",
          loading: false,
        });
      }
    },

    fetchClientDetail: async (clientId) => {
      try {
        return await apiClient.fetchClientDetail(clientId);
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch client",
        });
        throw error;
      }
    },

    createClient: async (data) => {
      set({ loading: true, error: null });
      try {
        const client = await apiClient.createClient(data);
        set((state) => ({
          clients: [...state.clients, client],
          loading: false,
        }));
        return client;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to create client",
          loading: false,
        });
        throw error;
      }
    },

    updateClient: async (clientId, data) => {
      set({ loading: true, error: null });
      try {
        const updated = await apiClient.updateClient(clientId, data);
        set((state) => ({
          clients: state.clients.map((c) => (c.clientId === clientId ? updated : c)),
          loading: false,
        }));
        return updated;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to update client",
          loading: false,
        });
        throw error;
      }
    },

    setActiveClient: (clientId) => {
      set({ activeClientId: clientId });
    },
  }))
);

// ============================================================================
// INVENTORY STORE
// ============================================================================

export interface InventoryState {
  // Data
  items: InventoryRow[];
  alerts: InventoryAlertDto[];
  ledger: InventoryLedgerRow[];

  // Loading & errors
  loading: boolean;
  error: string | null;

  // Pagination & filters
  pagination: PaginationState;
  filters: {
    clientId?: number;
    sku?: string;
  };

  // Actions
  fetchInventory: (query?: { clientId?: number; sku?: string }) => Promise<void>;
  fetchInventoryDetail: (invSkuId: number) => Promise<InventoryRow>;
  fetchAlerts: () => Promise<void>;
  fetchLedger: (limit?: number, clientId?: number) => Promise<void>;
  updateInventoryItem: (invSkuId: number, data: UpdateInventoryItemInput) => Promise<void>;
  receiveInventory: (data: ReceiveInventoryInput) => Promise<ReceiveInventoryResultDto[]>;
  adjustInventory: (data: AdjustInventoryInput) => Promise<void>;
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
}

export const useInventoryStore = create<InventoryState>()(
  devtools((set, get) => ({
    items: [],
    alerts: [],
    ledger: [],
    loading: false,
    error: null,
    pagination: {
      page: 1,
      pageSize: 50,
      total: 0,
      pages: 0,
    },
    filters: {},

    fetchInventory: async (query) => {
      set({ loading: true, error: null });
      try {
        const items = await apiClient.fetchInventory(query ?? get().filters);
        set({ items, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch inventory",
          loading: false,
        });
      }
    },

    fetchInventoryDetail: async (invSkuId) => {
      try {
        return await apiClient.fetchInventoryDetail(invSkuId);
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch inventory item",
        });
        throw error;
      }
    },

    fetchAlerts: async () => {
      set({ loading: true, error: null });
      try {
        const alerts = await apiClient.fetchInventoryAlerts();
        set({ alerts, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch alerts",
          loading: false,
        });
      }
    },

    fetchLedger: async (limit = 500, clientId) => {
      set({ loading: true, error: null });
      try {
        const ledger = await apiClient.fetchInventoryLedger({
          limit,
          clientId,
        });
        set({ ledger, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch ledger",
          loading: false,
        });
      }
    },

    updateInventoryItem: async (invSkuId, data) => {
      set({ loading: true, error: null });
      try {
        await apiClient.updateInventoryItem(invSkuId, data);
        // Refetch to get updated data
        const { fetchInventory } = get();
        await fetchInventory();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to update item",
          loading: false,
        });
      }
    },

    receiveInventory: async (data) => {
      set({ loading: true, error: null });
      try {
        const results = await apiClient.receiveInventory(data);
        // Refetch inventory after receive
        const { fetchInventory } = get();
        await fetchInventory();
        return results;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to receive inventory",
          loading: false,
        });
        throw error;
      }
    },

    adjustInventory: async (data) => {
      set({ loading: true, error: null });
      try {
        await apiClient.adjustInventory(data);
        // Refetch inventory after adjust
        const { fetchInventory } = get();
        await fetchInventory();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to adjust inventory",
          loading: false,
        });
      }
    },

    setFilter: (key, value) => {
      set((state) => ({
        filters: {
          ...state.filters,
          [key]: value,
        },
      }));
    },

    clearFilters: () => {
      set({ filters: {} });
    },

    setPage: (page) => {
      set((state) => ({
        pagination: { ...state.pagination, page },
      }));
    },
  }))
);

// ============================================================================
// LOCATIONS STORE
// ============================================================================

export interface LocationsState {
  // Data
  locations: LocationRow[];
  defaultLocationId: number | null;

  // Loading & errors
  loading: boolean;
  error: string | null;

  // Actions
  fetchLocations: () => Promise<void>;
  fetchLocationDetail: (locationId: number) => Promise<LocationRow>;
  createLocation: (data: SaveLocationInput) => Promise<LocationRow>;
  updateLocation: (locationId: number, data: SaveLocationInput) => Promise<LocationRow>;
  deleteLocation: (locationId: number) => Promise<void>;
  setDefaultLocation: (locationId: number) => void;
}

export const useLocationsStore = create<LocationsState>()(
  devtools((set, get) => ({
    locations: [],
    defaultLocationId: null,
    loading: false,
    error: null,

    fetchLocations: async () => {
      set({ loading: true, error: null });
      try {
        const locations = await apiClient.fetchLocations();
        const defaultLocation = locations.find((l) => l.isDefault);
        set({
          locations,
          defaultLocationId: defaultLocation?.locationId ?? null,
          loading: false,
        });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch locations",
          loading: false,
        });
      }
    },

    fetchLocationDetail: async (locationId) => {
      try {
        return await apiClient.fetchLocationDetail(locationId);
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch location",
        });
        throw error;
      }
    },

    createLocation: async (data) => {
      set({ loading: true, error: null });
      try {
        const location = await apiClient.createLocation(data);
        set((state) => ({
          locations: [...state.locations, location],
          loading: false,
        }));
        return location;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to create location",
          loading: false,
        });
        throw error;
      }
    },

    updateLocation: async (locationId, data) => {
      set({ loading: true, error: null });
      try {
        const updated = await apiClient.updateLocation(locationId, data);
        set((state) => ({
          locations: state.locations.map((l) => (l.locationId === locationId ? updated : l)),
          defaultLocationId: updated.isDefault ? updated.locationId : state.defaultLocationId,
          loading: false,
        }));
        return updated;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to update location",
          loading: false,
        });
        throw error;
      }
    },

    deleteLocation: async (locationId) => {
      set({ loading: true, error: null });
      try {
        await apiClient.deleteLocation(locationId);
        set((state) => ({
          locations: state.locations.filter((l) => l.locationId !== locationId),
          defaultLocationId:
            state.defaultLocationId === locationId ? null : state.defaultLocationId,
          loading: false,
        }));
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to delete location",
          loading: false,
        });
      }
    },

    setDefaultLocation: (locationId) => {
      set({ defaultLocationId: locationId });
    },
  }))
);

// ============================================================================
// SHIPMENTS STORE
// ============================================================================

export interface ShipmentsState {
  // Data
  syncStatus: ShipmentSyncStatusDto | null;
  legacySyncStatus: LegacySyncStatusDto | null;

  // Loading & errors
  loading: boolean;
  error: string | null;

  // Actions
  fetchSyncStatus: () => Promise<void>;
  triggerSync: () => Promise<void>;
  fetchLegacySyncStatus: () => Promise<void>;
  triggerLegacySync: (mode?: "incremental" | "full") => Promise<void>;
}

export const useShipmentsStore = create<ShipmentsState>()(
  devtools((set) => ({
    syncStatus: null,
    legacySyncStatus: null,
    loading: false,
    error: null,

    fetchSyncStatus: async () => {
      set({ loading: true, error: null });
      try {
        const syncStatus = await apiClient.fetchShipmentSyncStatus();
        set({ syncStatus, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch sync status",
          loading: false,
        });
      }
    },

    triggerSync: async () => {
      set({ loading: true, error: null });
      try {
        await apiClient.triggerShipmentSync();
        // Refetch status after trigger
        const { fetchSyncStatus } = set(() => ({})); // Get updated state
        set({ loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to trigger sync",
          loading: false,
        });
      }
    },

    fetchLegacySyncStatus: async () => {
      set({ loading: true, error: null });
      try {
        const legacySyncStatus = await apiClient.fetchLegacySyncStatus();
        set({ legacySyncStatus, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch legacy sync status",
          loading: false,
        });
      }
    },

    triggerLegacySync: async (mode) => {
      set({ loading: true, error: null });
      try {
        await apiClient.triggerLegacySync(mode);
        set({ loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to trigger legacy sync",
          loading: false,
        });
      }
    },
  }))
);

// ============================================================================
// PRODUCTS STORE
// ============================================================================

export interface ProductsState {
  // Data
  products: ProductRow[];

  // Loading & errors
  loading: boolean;
  error: string | null;

  // Actions
  fetchProducts: (clientId?: number) => Promise<void>;
  saveProductDefaults: (data: SaveProductDefaultsInput) => Promise<SaveProductDefaultsResult>;
}

export const useProductsStore = create<ProductsState>()(
  devtools((set) => ({
    products: [],
    loading: false,
    error: null,

    fetchProducts: async (clientId) => {
      set({ loading: true, error: null });
      try {
        const products = await apiClient.fetchProducts(clientId ? { clientId } : undefined);
        set({ products, loading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to fetch products",
          loading: false,
        });
      }
    },

    saveProductDefaults: async (data) => {
      set({ loading: true, error: null });
      try {
        const result = await apiClient.saveProductDefaults(data);
        // Refetch products after save
        set((state) => ({ loading: false }));
        return result;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to save product defaults",
          loading: false,
        });
        throw error;
      }
    },
  }))
);
