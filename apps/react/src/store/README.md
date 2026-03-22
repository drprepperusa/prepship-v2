# Zustand Store - PrepShip V2 State Management

Comprehensive, slice-based state management for the PrepShip V2 React refactor. Built with Zustand + DevTools, providing typed access to all major resources.

## Architecture

### File Structure

```
src/
├── types/
│   └── api.ts              # Type definitions (DTOs, Row interfaces)
├── api/
│   └── client.ts           # Typed API client wrapper
└── store/
    ├── index.ts            # All store definitions (6 slices)
    ├── hooks.ts            # Convenience hooks for components
    └── README.md           # This file
```

### Store Slices

The store is organized into **6 separate Zustand stores**, one for each major resource:

| Store | Resource | State | Actions |
|-------|----------|-------|---------|
| **OrdersStore** | Orders, filtering, pagination | `orders`, `selectedOrderId`, `pagination`, `filters`, `loading`, `error` | `fetchOrders()`, `setFilter()`, `setPage()`, `updateOrder()`, `selectOrder()`, `clearFilters()` |
| **ClientsStore** | Clients, active selection | `clients`, `activeClientId`, `loading`, `error` | `fetchClients()`, `createClient()`, `updateClient()`, `fetchClientDetail()`, `setActiveClient()` |
| **InventoryStore** | Items, alerts, ledger | `items`, `alerts`, `ledger`, `pagination`, `filters`, `loading`, `error` | `fetchInventory()`, `fetchAlerts()`, `receiveInventory()`, `adjustInventory()`, `updateInventoryItem()`, `fetchLedger()` |
| **LocationsStore** | Locations, default selection | `locations`, `defaultLocationId`, `loading`, `error` | `fetchLocations()`, `createLocation()`, `updateLocation()`, `deleteLocation()`, `fetchLocationDetail()`, `setDefaultLocation()` |
| **ShipmentsStore** | Sync status (standard + legacy) | `syncStatus`, `legacySyncStatus`, `loading`, `error` | `fetchSyncStatus()`, `triggerSync()`, `fetchLegacySyncStatus()`, `triggerLegacySync()` |
| **ProductsStore** | Product defaults | `products`, `loading`, `error` | `fetchProducts()`, `saveProductDefaults()` |

## Usage

### In Components

Use the convenience hooks (`src/store/hooks.ts`) for clean, typed access:

```tsx
import { useOrders, useClients, useInventory } from "@/store/hooks";

function OrdersPage() {
  const {
    data: orders,
    loading,
    error,
    pagination,
    filters,
    actions: { fetchOrders, setFilter, setPage },
  } = useOrders();

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <input
        type="text"
        placeholder="Search by order status"
        onChange={(e) => setFilter("orderStatus", e.target.value)}
      />
      {orders.map((order) => (
        <OrderCard key={order.orderId} order={order} />
      ))}
    </div>
  );
}
```

### Inventory with Selectors

```tsx
import { useInventory } from "@/store/hooks";

function InventoryDashboard() {
  const {
    data: items,
    alerts,
    loading,
    selectors: { lowStockItems, alertsByType },
    actions: { fetchInventory, fetchAlerts },
  } = useInventory();

  useEffect(() => {
    fetchInventory();
    fetchAlerts();
  }, [fetchInventory, fetchAlerts]);

  const lowItems = lowStockItems();
  const skuAlerts = alertsByType("sku");

  return (
    <div>
      <h2>Low Stock Items ({lowItems.length})</h2>
      {lowItems.map((item) => (
        <InventoryCard key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### Direct Store Access (Advanced)

If you need direct store access (rare):

```tsx
import {
  useOrdersStore,
  useClientsStore,
  useInventoryStore,
  useLocationsStore,
  useShipmentsStore,
  useProductsStore,
} from "@/store";

// Selector only (no re-render on other changes)
const orders = useOrdersStore((state) => state.orders);

// Multiple selectors
const [orders, loading] = useOrdersStore((state) => [
  state.orders,
  state.loading,
]);
```

## API Client

The store uses `src/api/client.ts`, a typed fetch wrapper that:

- ✅ Automatically injects `X-App-Token` header from localStorage
- ✅ Handles query parameter serialization
- ✅ Provides typed responses matching contract DTOs
- ✅ Throws `ApiError` with status codes
- ✅ Converts JSON responses automatically

### API Methods

```typescript
// Orders
apiClient.fetchOrders(query)
apiClient.fetchOrderDetail(orderId)
apiClient.updateOrder(orderId, data)

// Clients
apiClient.fetchClients()
apiClient.fetchClientDetail(clientId)
apiClient.createClient(data)
apiClient.updateClient(clientId, data)

// Inventory
apiClient.fetchInventory(query)
apiClient.fetchInventoryDetail(invSkuId)
apiClient.updateInventoryItem(invSkuId, data)
apiClient.fetchInventoryAlerts()
apiClient.fetchInventoryLedger(query)
apiClient.receiveInventory(data)
apiClient.adjustInventory(data)
apiClient.fetchParentSkuDetail(parentSkuId)

// Locations
apiClient.fetchLocations()
apiClient.fetchLocationDetail(locationId)
apiClient.createLocation(data)
apiClient.updateLocation(locationId, data)
apiClient.deleteLocation(locationId)

// Shipments
apiClient.fetchShipmentSyncStatus()
apiClient.triggerShipmentSync()
apiClient.fetchLegacySyncStatus()
apiClient.triggerLegacySync(mode)

// Products
apiClient.fetchProducts(query)
apiClient.saveProductDefaults(data)
```

## Types

All types are defined in `src/types/api.ts`:

- **DTOs**: `OrderSummaryDto`, `ClientDto`, `InventoryItemDto`, etc. (re-exported from contracts)
- **Row Types**: `OrderRow`, `ClientRow`, `InventoryRow`, `LocationRow`, `ProductRow` (for table display)
- **Input Types**: `ListOrdersQuery`, `CreateClientInput`, `UpdateClientInput`, etc.
- **Common Types**: `PaginationState`, `FilterState`, `AsyncState<T>`

## Middleware

The stores use Zustand's **DevTools middleware** for Redux DevTools integration:

1. Open Redux DevTools browser extension
2. Inspect state changes, time-travel, dispatch actions
3. View action history with diff views

```bash
# Enable Redux DevTools in development
npm install redux-devtools-extension
```

## Pagination & Filtering

### Orders

```tsx
const { pagination, filters, actions } = useOrders();

// Change page
actions.setPage(2);

// Change page size
actions.setPageSize(100);

// Add filter (auto-resets to page 1)
actions.setFilter("orderStatus", "pending");

// Clear all filters
actions.clearFilters();

// Fetch with custom query
await actions.fetchOrders({
  page: 1,
  pageSize: 50,
  orderStatus: "shipped",
  clientId: 42,
});
```

### Inventory

```tsx
const { filters, actions } = useInventory();

// Add filter
actions.setFilter("clientId", 123);

// Fetch with filters
await actions.fetchInventory({
  clientId: 123,
  sku: "ITEM-001",
});
```

## Error Handling

All stores include `error` state that is set automatically on failed API calls:

```tsx
const { loading, error, actions } = useOrders();

useEffect(() => {
  actions.fetchOrders().catch((err) => {
    console.error("Failed to fetch orders:", err.message);
  });
}, [actions]);

if (error) {
  return <Alert severity="error">{error}</Alert>;
}
```

## Async Operations

All fetch/write actions:

1. Set `loading: true` immediately
2. Clear `error: null`
3. Execute API call
4. Update state on success
5. Set `error` on failure
6. Set `loading: false` always

```tsx
try {
  await actions.updateOrder(123, { externalShipped: true });
} catch (err) {
  // Error is already in state.error
  console.error(err);
}
```

## Advanced Patterns

### Memoized Selectors

Use `useCallback` for expensive computations:

```tsx
const lowStockItems = useCallback(() => {
  return items.filter((item) => item.status === "low");
}, [items]);
```

### Combining Multiple Stores

```tsx
function DashboardPage() {
  const orders = useOrders();
  const clients = useClients();
  const inventory = useInventory();

  useEffect(() => {
    Promise.all([
      orders.actions.fetchOrders(),
      clients.actions.fetchClients(),
      inventory.actions.fetchInventory(),
    ]);
  }, []);

  const isLoading = orders.loading || clients.loading || inventory.loading;
  
  return isLoading ? <Loading /> : <Dashboard {...{ orders, clients, inventory }} />;
}
```

### Listening to Store Changes (Advanced)

```tsx
import { useOrdersStore } from "@/store";

useEffect(() => {
  // Subscribe directly (rarely needed)
  const unsubscribe = useOrdersStore.subscribe(
    (state) => state.orders,
    (orders) => {
      console.log("Orders changed:", orders);
    }
  );

  return unsubscribe;
}, []);
```

## Best Practices

1. **Use hooks in components**: Always use `useOrders()`, `useClients()`, etc. instead of direct store access
2. **Keep selectors memoized**: Use `useCallback` for computed values
3. **Handle loading states**: Check `loading` before rendering data
4. **Handle errors**: Display error messages to users, log for debugging
5. **Fetch on mount**: Use `useEffect` with dependency array to fetch data when components mount
6. **Batch operations**: Combine multiple state updates into single actions when possible
7. **Type safety**: Always use types from `@/types/api` for better IDE support

## Future Enhancements

- [ ] Optimistic updates (show change before API response)
- [ ] Revalidation on window focus
- [ ] Automatic polling/polling strategies
- [ ] Cache invalidation patterns
- [ ] Offline support (localStorage sync)
- [ ] Batch API requests
- [ ] Request deduplication

## Troubleshooting

### State not updating?

1. Check if action is being called
2. Verify API client has token (`apiClient.setToken()`)
3. Check Redux DevTools for action history
4. Ensure loading/error states are handled

### Performance issues?

1. Check for unnecessary re-renders (use React DevTools Profiler)
2. Move selectors outside components or use `useCallback`
3. Consider using shallow equality checks for filtering
4. Batch updates instead of multiple individual calls

### Type errors?

1. Ensure types are imported from `@/types/api`
2. Verify DTO shape matches API response
3. Check for optional vs required fields (null/undefined)
4. Use `unknown` for dynamic data

## Related Files

- `src/types/api.ts` - Type definitions and DTOs
- `src/api/client.ts` - API client implementation
- `src/store/index.ts` - Store implementations
- `src/store/hooks.ts` - Component hooks
