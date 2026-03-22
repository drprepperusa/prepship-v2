/**
 * Store Hooks - Convenient hooks for accessing store state and actions
 * Provides typed access to each store slice with selectors
 */

import { useCallback } from "react";
import {
  useOrdersStore,
  useClientsStore,
  useInventoryStore,
  useLocationsStore,
  useShipmentsStore,
  useProductsStore,
} from "./index";
import type {
  ListOrdersQuery,
  CreateClientInput,
  UpdateClientInput,
  ReceiveInventoryInput,
  ReceiveInventoryResultDto,
  AdjustInventoryInput,
  UpdateInventoryItemInput,
  SaveLocationInput,
  SaveProductDefaultsInput,
  SaveProductDefaultsResult,
  OrderRow,
  ClientRow,
  InventoryRow,
  LocationRow,
  ProductRow,
} from "../types/api";

// ============================================================================
// ORDERS HOOK
// ============================================================================

export function useOrders() {
  const orders = useOrdersStore((state) => state.orders);
  const selectedOrderId = useOrdersStore((state) => state.selectedOrderId);
  const loading = useOrdersStore((state) => state.loading);
  const error = useOrdersStore((state) => state.error);
  const pagination = useOrdersStore((state) => state.pagination);
  const filters = useOrdersStore((state) => state.filters);

  const fetchOrders = useOrdersStore((state) => state.fetchOrders);
  const setFilter = useOrdersStore((state) => state.setFilter);
  const clearFilters = useOrdersStore((state) => state.clearFilters);
  const setPage = useOrdersStore((state) => state.setPage);
  const setPageSize = useOrdersStore((state) => state.setPageSize);
  const selectOrder = useOrdersStore((state) => state.selectOrder);
  const updateOrder = useOrdersStore((state) => state.updateOrder);

  const selectedOrder = orders.find((o) => o.orderId === selectedOrderId) || null;

  return {
    // State
    data: orders,
    selectedOrder,
    loading,
    error,
    pagination,
    filters,

    // Actions
    actions: {
      fetchOrders,
      setFilter,
      clearFilters,
      setPage,
      setPageSize,
      selectOrder,
      updateOrder,
    },
  };
}

// ============================================================================
// CLIENTS HOOK
// ============================================================================

export function useClients() {
  const clients = useClientsStore((state) => state.clients);
  const activeClientId = useClientsStore((state) => state.activeClientId);
  const loading = useClientsStore((state) => state.loading);
  const error = useClientsStore((state) => state.error);

  const fetchClients = useClientsStore((state) => state.fetchClients);
  const fetchClientDetail = useClientsStore((state) => state.fetchClientDetail);
  const createClient = useClientsStore((state) => state.createClient);
  const updateClient = useClientsStore((state) => state.updateClient);
  const setActiveClient = useClientsStore((state) => state.setActiveClient);

  const activeClient = clients.find((c) => c.clientId === activeClientId) || null;

  return {
    // State
    data: clients,
    activeClient,
    loading,
    error,

    // Actions
    actions: {
      fetchClients,
      fetchClientDetail,
      createClient,
      updateClient,
      setActiveClient,
    },
  };
}

// ============================================================================
// INVENTORY HOOK
// ============================================================================

export function useInventory() {
  const items = useInventoryStore((state) => state.items);
  const alerts = useInventoryStore((state) => state.alerts);
  const ledger = useInventoryStore((state) => state.ledger);
  const loading = useInventoryStore((state) => state.loading);
  const error = useInventoryStore((state) => state.error);
  const pagination = useInventoryStore((state) => state.pagination);
  const filters = useInventoryStore((state) => state.filters);

  const fetchInventory = useInventoryStore((state) => state.fetchInventory);
  const fetchInventoryDetail = useInventoryStore((state) => state.fetchInventoryDetail);
  const fetchAlerts = useInventoryStore((state) => state.fetchAlerts);
  const fetchLedger = useInventoryStore((state) => state.fetchLedger);
  const updateInventoryItem = useInventoryStore((state) => state.updateInventoryItem);
  const receiveInventory = useInventoryStore((state) => state.receiveInventory);
  const adjustInventory = useInventoryStore((state) => state.adjustInventory);
  const setFilter = useInventoryStore((state) => state.setFilter);
  const clearFilters = useInventoryStore((state) => state.clearFilters);
  const setPage = useInventoryStore((state) => state.setPage);

  // Memoized selectors
  const lowStockItems = useCallback(() => {
    return items.filter((item) => item.status === "low" || item.status === "out");
  }, [items]);

  const alertsByType = useCallback((type: "sku" | "parent") => {
    return alerts.filter((alert) => alert.type === type);
  }, [alerts]);

  return {
    // State
    data: items,
    alerts,
    ledger,
    loading,
    error,
    pagination,
    filters,

    // Selectors
    selectors: {
      lowStockItems,
      alertsByType,
    },

    // Actions
    actions: {
      fetchInventory,
      fetchInventoryDetail,
      fetchAlerts,
      fetchLedger,
      updateInventoryItem,
      receiveInventory,
      adjustInventory,
      setFilter,
      clearFilters,
      setPage,
    },
  };
}

// ============================================================================
// LOCATIONS HOOK
// ============================================================================

export function useLocations() {
  const locations = useLocationsStore((state) => state.locations);
  const defaultLocationId = useLocationsStore((state) => state.defaultLocationId);
  const loading = useLocationsStore((state) => state.loading);
  const error = useLocationsStore((state) => state.error);

  const fetchLocations = useLocationsStore((state) => state.fetchLocations);
  const fetchLocationDetail = useLocationsStore((state) => state.fetchLocationDetail);
  const createLocation = useLocationsStore((state) => state.createLocation);
  const updateLocation = useLocationsStore((state) => state.updateLocation);
  const deleteLocation = useLocationsStore((state) => state.deleteLocation);
  const setDefaultLocation = useLocationsStore((state) => state.setDefaultLocation);

  const defaultLocation =
    locations.find((l) => l.locationId === defaultLocationId) || null;

  return {
    // State
    data: locations,
    defaultLocation,
    loading,
    error,

    // Actions
    actions: {
      fetchLocations,
      fetchLocationDetail,
      createLocation,
      updateLocation,
      deleteLocation,
      setDefaultLocation,
    },
  };
}

// ============================================================================
// SHIPMENTS HOOK
// ============================================================================

export function useShipments() {
  const syncStatus = useShipmentsStore((state) => state.syncStatus);
  const legacySyncStatus = useShipmentsStore((state) => state.legacySyncStatus);
  const loading = useShipmentsStore((state) => state.loading);
  const error = useShipmentsStore((state) => state.error);

  const fetchSyncStatus = useShipmentsStore((state) => state.fetchSyncStatus);
  const triggerSync = useShipmentsStore((state) => state.triggerSync);
  const fetchLegacySyncStatus = useShipmentsStore((state) => state.fetchLegacySyncStatus);
  const triggerLegacySync = useShipmentsStore((state) => state.triggerLegacySync);

  return {
    // State
    syncStatus,
    legacySyncStatus,
    loading,
    error,

    // Actions
    actions: {
      fetchSyncStatus,
      triggerSync,
      fetchLegacySyncStatus,
      triggerLegacySync,
    },
  };
}

// ============================================================================
// PRODUCTS HOOK
// ============================================================================

export function useProducts() {
  const products = useProductsStore((state) => state.products);
  const loading = useProductsStore((state) => state.loading);
  const error = useProductsStore((state) => state.error);

  const fetchProducts = useProductsStore((state) => state.fetchProducts);
  const saveProductDefaults = useProductsStore((state) => state.saveProductDefaults);

  return {
    // State
    data: products,
    loading,
    error,

    // Actions
    actions: {
      fetchProducts,
      saveProductDefaults,
    },
  };
}
