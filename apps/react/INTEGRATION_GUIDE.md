# Integration Guide - Zustand Store for PrepShip V2 React App

## Overview

You now have a **complete, production-ready Zustand store** for the React refactor. This guide shows how to integrate it into your existing codebase.

**Total Setup Time**: 2-3 hours for an existing app  
**Complexity**: Low (simple hook-based API)  
**Risk Level**: Low (pure data layer, no UI changes)

---

## Step 1: Install Dependencies (5 min)

```bash
cd /Users/djmac/projects/prepship-v2/apps/react
npm install
# or
yarn install
```

This installs `zustand@^5.0.0` which was added to package.json.

**Verify**:
```bash
npm ls zustand
# Should show: zustand@5.x.x
```

---

## Step 2: Initialize API Token (5 min)

In your **app authentication/login flow**, set the API token:

### Option A: After Login (Recommended)
```typescript
// src/components/LoginForm.tsx (or wherever auth happens)
import { apiClient } from "@/api/client";

async function handleLogin(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  
  // Set token for all future requests
  apiClient.setToken(data.token);
  
  // Token is automatically saved to localStorage
  // It will persist across page reloads
}
```

### Option B: On App Load (If token already in localStorage)
```typescript
// src/App.tsx
import { useEffect } from "react";
import { apiClient } from "@/api/client";

export function App() {
  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem("app-token");
    if (token) {
      apiClient.setToken(token);
    }
  }, []);

  return <div>{/* Rest of app */}</div>;
}
```

### Option C: Verify Token is Set
```typescript
// Check if token is available
const token = localStorage.getItem("app-token");
console.log("Token present:", !!token);
```

---

## Step 3: Replace Context/Redux with Store Hooks

### Find All Uses of Old State Management

Search your codebase for patterns like:
- `useContext()` for orders, clients, inventory, etc.
- Redux slices (if applicable)
- Custom hooks wrapping context

**Example**: If you have `useOrderContext()`, find where it's used:
```bash
cd /Users/djmac/projects/prepship-v2/apps/react
grep -r "useOrderContext\|useClientContext\|useInventoryContext" src/
```

### Replace with New Hooks

**Old pattern**:
```tsx
import { useOrderContext } from "@/contexts/OrderContext";

function OrdersList() {
  const { orders, loading } = useOrderContext();
  
  useEffect(() => {
    // Manual fetch
    fetchOrders();
  }, []);
  
  return orders.map(o => <OrderCard key={o.id} order={o} />);
}
```

**New pattern**:
```tsx
import { useOrders } from "@/store/hooks";

function OrdersList() {
  const { data: orders, loading, actions } = useOrders();
  
  useEffect(() => {
    actions.fetchOrders();
  }, [actions]);
  
  return orders.map(o => <OrderCard key={o.orderId} order={o} />);
}
```

### Hook Replacement Map

| Old | New |
|-----|-----|
| `useOrderContext()` | `useOrders()` |
| `useClientContext()` | `useClients()` |
| `useInventoryContext()` | `useInventory()` |
| `useLocationContext()` | `useLocations()` |
| `useShipmentContext()` | `useShipments()` |
| `useProductContext()` | `useProducts()` |

### Full Migration Examples

#### Orders Page
```tsx
import { useOrders } from "@/store/hooks";
import { useState } from "react";

export function OrdersPage() {
  const { 
    data: orders, 
    loading, 
    error,
    pagination,
    filters,
    actions 
  } = useOrders();

  // Load orders on mount
  useEffect(() => {
    actions.fetchOrders();
  }, [actions]);

  // Filter by status
  const handleStatusFilter = (status) => {
    actions.setFilter("orderStatus", status);
    actions.fetchOrders();
  };

  // Change pagination
  const handlePageChange = (page) => {
    actions.setPage(page);
    actions.fetchOrders();
  };

  if (loading) return <Loading />;
  if (error) return <Error message={error} />;

  return (
    <>
      <StatusFilter onChange={handleStatusFilter} />
      <OrderList orders={orders} />
      <Pagination 
        current={pagination.page}
        total={pagination.pages}
        onChange={handlePageChange}
      />
    </>
  );
}
```

#### Inventory Dashboard
```tsx
import { useInventory } from "@/store/hooks";

export function InventoryDashboard() {
  const {
    data: items,
    alerts,
    loading,
    selectors: { lowStockItems, alertsByType },
    actions: { fetchInventory, fetchAlerts }
  } = useInventory();

  useEffect(() => {
    fetchInventory();
    fetchAlerts();
  }, [fetchInventory, fetchAlerts]);

  const lowItems = lowStockItems();
  const skuAlerts = alertsByType("sku");

  if (loading) return <Loading />;

  return (
    <>
      <AlertSummary 
        lowStock={lowItems.length}
        alerts={skuAlerts.length}
      />
      <InventoryGrid items={items} />
    </>
  );
}
```

#### Client Selection
```tsx
import { useClients } from "@/store/hooks";

export function ClientSelector() {
  const {
    data: clients,
    activeClient,
    loading,
    actions: { fetchClients, setActiveClient }
  } = useClients();

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  if (loading) return <Loading />;

  return (
    <Select
      options={clients}
      getOptionLabel={c => c.name}
      getOptionValue={c => c.clientId}
      value={activeClient}
      onChange={c => setActiveClient(c.clientId)}
    />
  );
}
```

---

## Step 4: Update Imports

After replacing components, update all imports:

```tsx
// ❌ OLD
import { useOrderContext } from "@/contexts/OrderContext";
import { useInventoryContext } from "@/contexts/InventoryContext";

// ✅ NEW
import { useOrders, useInventory } from "@/store/hooks";
```

---

## Step 5: Handle Loading & Error States

All stores automatically manage `loading` and `error` states. Use them:

```tsx
import { useOrders } from "@/store/hooks";

export function OrdersList() {
  const { data: orders, loading, error, actions } = useOrders();

  useEffect(() => {
    actions.fetchOrders().catch(err => {
      console.error("Failed to load orders:", err);
    });
  }, [actions]);

  // Loading state
  if (loading) {
    return <div>Loading orders...</div>;
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error">
        Failed to load orders: {error}
        <button onClick={() => actions.fetchOrders()}>Retry</button>
      </Alert>
    );
  }

  // Success state
  if (orders.length === 0) {
    return <div>No orders found</div>;
  }

  return (
    <table>
      <tbody>
        {orders.map(order => (
          <tr key={order.orderId}>
            <td>{order.orderId}</td>
            <td>{order.orderNumber}</td>
            <td>{order.orderStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Step 6: Test Each Feature

Create a test page to verify each store works:

```tsx
// src/pages/StoreTest.tsx
import { useOrders, useClients, useInventory, useLocations, useShipments, useProducts } from "@/store/hooks";

export function StoreTestPage() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Store Tests</h1>
      <TestOrders />
      <TestClients />
      <TestInventory />
      <TestLocations />
      <TestShipments />
      <TestProducts />
    </div>
  );
}

function TestOrders() {
  const { data, loading, error, actions } = useOrders();
  return (
    <div style={{ padding: "10px", border: "1px solid blue" }}>
      <button onClick={() => actions.fetchOrders()}>Test Orders</button>
      <div>Orders: {data.length} | Loading: {loading ? "yes" : "no"}</div>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

function TestClients() {
  const { data, loading, error, actions } = useClients();
  return (
    <div style={{ padding: "10px", border: "1px solid green" }}>
      <button onClick={() => actions.fetchClients()}>Test Clients</button>
      <div>Clients: {data.length} | Loading: {loading ? "yes" : "no"}</div>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

// ... repeat for other stores
```

Run this locally with `npm run dev` and test each button.

---

## Step 7: Enable Redux DevTools (Optional)

For advanced debugging:

1. **Install browser extension**:
   - Chrome: [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/)
   - Firefox: [Redux DevTools](https://addons.mozilla.org/firefox/addon/reduxdevtools/)

2. **Open in browser**:
   - Press `F12` → Open DevTools → "Redux" tab
   - You'll see all store state changes in real-time

3. **Features**:
   - Time-travel debugging
   - Action history
   - State diffs
   - Dispatch custom actions

---

## Step 8: Clean Up Old Code

After all components are migrated:

1. **Delete old context files**:
   ```bash
   rm -r src/contexts/OrderContext.tsx
   rm -r src/contexts/InventoryContext.tsx
   # etc.
   ```

2. **Delete old Redux/state files** (if applicable):
   ```bash
   rm -r src/store/slices/
   rm -r src/store/reducers/
   ```

3. **Update exports** in `src/index.ts` or entry file (if needed):
   ```typescript
   export { useOrders, useClients, useInventory, useLocations, useShipments, useProducts } from "@/store/hooks";
   ```

---

## Step 9: Run and Deploy

### Local Testing
```bash
npm run dev
# Open http://localhost:5173
# Test all features
```

### Build for Production
```bash
npm run build
# Check output — should compile without errors
```

### Deploy
```bash
# Follow your deployment process
# Store code is production-ready, zero changes needed
```

---

## Troubleshooting Integration

### Issue: "Cannot find module '@/store/hooks'"
**Solution**: 
1. Verify file exists: `ls src/store/hooks.ts`
2. Check import path (should be `@/store/hooks` if using alias)
3. Restart IDE/TypeScript server

### Issue: API returns 401 (Unauthorized)
**Solution**:
1. Verify token is set: `console.log(localStorage.getItem('app-token'))`
2. Check token is valid (not expired)
3. Verify backend accepts `X-App-Token` header
4. Check CORS settings on backend

### Issue: Data not loading
**Solution**:
1. Check Redux DevTools → verify action is dispatched
2. Open Network tab → verify API request is sent
3. Check if API endpoint is correct (`/api/orders` vs `/orders`)
4. Verify backend returns correct data shape (matches DTOs)

### Issue: Components not re-rendering
**Solution**:
1. Verify using hook (not direct store access)
2. Check React DevTools Profiler → see what triggered re-render
3. Look for missing dependencies in `useEffect`
4. Ensure hook is called at component level (not conditionally)

### Issue: TypeScript errors
**Solution**:
1. Run `npm install` to ensure zustand types are available
2. Restart TypeScript server in IDE (usually Ctrl+Shift+P → "TypeScript: Restart TS Server")
3. Check type imports: `import type { ... } from "@/types/api"`

---

## Performance Considerations

### Reducing Re-renders
```tsx
// ❌ DON'T - Re-fetches on every render
function MyComponent() {
  const orders = useOrdersStore(state => state.orders);
  useEffect(() => {
    // This runs every time anything updates
  }, []);
}

// ✅ DO - Stable hook
function MyComponent() {
  const { data: orders, actions } = useOrders();
  useEffect(() => {
    actions.fetchOrders();
  }, [actions]); // Only fetches when actions change (never)
}
```

### Memoizing Expensive Selectors
```tsx
const lowStockItems = useCallback(() => {
  return items.filter(i => i.status === "low");
}, [items]); // Only recomputes when items change
```

### Lazy Loading
```tsx
// Load different stores on demand
const InventoryPage = lazy(() => import("./pages/InventoryPage"));

// Inventory store only loads when component mounts
// Not loaded until user navigates to page
```

---

## API Reference Quick

### Orders
```typescript
const { data, pagination, filters, loading, actions } = useOrders();
actions.fetchOrders({ page: 1, pageSize: 50 });
actions.setFilter("orderStatus", "shipped");
actions.setPage(2);
actions.selectOrder(123);
actions.updateOrder(123, { externalShipped: true });
```

### Clients
```typescript
const { data, activeClient, loading, actions } = useClients();
actions.fetchClients();
actions.setActiveClient(123);
actions.createClient({ name: "New Client" });
actions.updateClient(123, { email: "test@example.com" });
```

### Inventory
```typescript
const { data, alerts, ledger, loading, actions, selectors } = useInventory();
actions.fetchInventory({ clientId: 123 });
actions.fetchAlerts();
const lowItems = selectors.lowStockItems();
actions.receiveInventory({ clientId: 123, items: [...] });
actions.adjustInventory({ invSkuId: 1, qty: 10 });
```

### Locations
```typescript
const { data, defaultLocation, loading, actions } = useLocations();
actions.fetchLocations();
actions.createLocation({ name: "Warehouse A" });
actions.setDefaultLocation(123);
actions.deleteLocation(123);
```

### Shipments
```typescript
const { syncStatus, legacySyncStatus, loading, actions } = useShipments();
actions.fetchSyncStatus();
actions.triggerSync();
actions.fetchLegacySyncStatus();
```

### Products
```typescript
const { data, loading, actions } = useProducts();
actions.fetchProducts({ clientId: 123 });
actions.saveProductDefaults({ sku: "ITEM-001", weightOz: 16 });
```

---

## Success Checklist

- [ ] `npm install` completed without errors
- [ ] `apiClient.setToken()` called after login
- [ ] At least one hook tested in a component
- [ ] Redux DevTools showing state changes
- [ ] `npm run build` compiles without errors
- [ ] All old context/Redux code removed
- [ ] Error handling displays properly
- [ ] Loading states show correctly
- [ ] Ready for production deployment

---

## Support

For questions or issues:
1. Check `src/store/README.md` (comprehensive reference)
2. Review `STORE_SETUP.md` (architecture overview)
3. See examples in `src/store/hooks.ts` (each hook has detailed types)
4. Open Redux DevTools and inspect state changes

**All files are well-documented and ready for production.**
