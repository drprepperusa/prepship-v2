#!/usr/bin/env node
/**
 * Test for Boolean Field Type Conversion
 * Validates that all SQLite 0/1 boolean fields are converted to proper booleans
 */

const endpoints = [
  { path: "/api/orders?page=1&pageSize=2", fields: ["externalShipped", "residential", "sourceResidential"] },
  { path: "/api/orders/268769317/full", fields: ["externalShipped"] },
  { path: "/api/inventory?clientId=2", fields: ["active"] },
  { path: "/api/locations", fields: ["isDefault", "active"] },
  { path: "/api/packages", fields: [] },
  { path: "/api/clients", fields: ["active", "hasOwnAccount"] },
  { path: "/api/rates/cached/order-268769317", fields: ["cached", "guaranteed"] },
];

async function checkEndpoint(path, fields) {
  try {
    const res = await fetch(`http://127.0.0.1:4010${path}`);
    if (!res.ok) {
      console.log(`⚠️  ${path} (HTTP ${res.status})`);
      return;
    }
    const data = await res.json();
    
    // Flatten to check all fields
    const values = Array.isArray(data) ? data : (data.orders || data.results || data.children || [data]);
    
    let issues = [];
    for (const field of fields) {
      for (const item of values) {
        if (item && field in item) {
          const val = item[field];
          if (typeof val === "number" && (val === 0 || val === 1)) {
            issues.push(`${field}=${val} (should be boolean)`);
          }
        }
      }
    }
    
    if (issues.length > 0) {
      console.log(`❌ ${path}`);
      issues.forEach(issue => console.log(`   ${issue}`));
    } else {
      console.log(`✅ ${path}`);
    }
  } catch (err) {
    console.log(`⚠️  ${path} (${err.message})`);
  }
}

async function main() {
  console.log("🔍 Checking Boolean Field Conversions\n");
  for (const ep of endpoints) {
    await checkEndpoint(ep.path, ep.fields);
  }
}

main();
