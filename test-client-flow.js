#!/usr/bin/env node
// Quick test to verify clientMap flow

const initDataRes = await fetch('http://127.0.0.1:4010/api/init-data').then(r => r.json());
const ordersRes = await fetch('http://127.0.0.1:4010/api/orders?page=1').then(r => r.json());

console.log('📦 Init Data:');
console.log('  - Clients:', initDataRes.clients?.length || 0);
if (initDataRes.clients) {
  console.log('    Sample:', initDataRes.clients.slice(0, 3).map(c => `[${c.clientId}] ${c.name}`));
}

console.log('\n📋 Orders:');
const sampleOrders = ordersRes.orders?.slice(0, 3) || [];
sampleOrders.forEach((o, i) => {
  const lookupName = initDataRes.clients?.find(c => c.clientId === o.clientId)?.name || 'NOT FOUND';
  console.log(`  [${i}] Order ${o.orderId}: clientId=${o.clientId} → "${lookupName}"`);
});

console.log('\n✅ Flow test complete');
