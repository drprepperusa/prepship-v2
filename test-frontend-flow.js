#!/usr/bin/env node
// Simulate the frontend flow to identify where clientName lookup breaks

// Mock state (like the frontend)
const state = {
  clientMap: {},
  allOrders: [],
  filteredOrders: [],
};

// Mock functions (from orders.js)
function clientBadge(name) {
  return `<span class="client-badge">${name}</span>`;
}

// Step 1: Load init-data
console.log('🔄 Step 1: Fetch init-data...');
const initDataRes = await fetch('http://127.0.0.1:4010/api/init-data').then(r => r.json());
console.log(`  ✅ Got ${initDataRes.clients?.length || 0} clients`);

// Step 2: Populate clientMap (like app.js does)
console.log('\n🔄 Step 2: Build clientMap...');
if (Array.isArray(initDataRes.clients)) {
  state.clientMap = {};
  initDataRes.clients.forEach(c => state.clientMap[c.clientId] = c.name);
  console.log(`  ✅ Built clientMap with ${Object.keys(state.clientMap).length} entries`);
  console.log('  Sample:', Object.entries(state.clientMap).slice(0, 3).map(([id, name]) => `[${id}]=${name}`));
}

// Step 3: Fetch orders (like fetchOrders does)
console.log('\n🔄 Step 3: Fetch orders...');
const ordersRes = await fetch('http://127.0.0.1:4010/api/orders?page=1').then(r => r.json());
state.allOrders = ordersRes.orders || [];
console.log(`  ✅ Got ${state.allOrders.length} orders`);

// Step 4: Render first few rows (like renderOrders does)
console.log('\n🔄 Step 4: Render orders (like renderOrders)...');
const rows = state.allOrders.slice(0, 3).map((o, i) => {
  const clientName = state.clientMap?.[o.clientId] || o.clientName || 'Untagged';
  const clientCol = clientBadge(clientName);
  return {
    idx: i,
    orderId: o.orderId,
    clientId: o.clientId,
    clientName: clientName,
    html: clientCol,
  };
});

console.log('\nRendered rows:');
rows.forEach(r => {
  console.log(`  [Order ${r.orderId}] clientId=${r.clientId} → "${r.clientName}"`);
});

// Step 5: Check if any are "Untagged"
const untagged = rows.filter(r => r.clientName === 'Untagged');
if (untagged.length) {
  console.log(`\n❌ ERROR: ${untagged.length} rows are still "Untagged"`);
  untagged.forEach(r => console.log(`   Order ${r.orderId}: clientId=${r.clientId} not found in clientMap`));
  process.exit(1);
} else {
  console.log('\n✅ SUCCESS: All client names resolved correctly!');
}
