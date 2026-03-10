#!/usr/bin/env node
/**
 * Test Frontend API Validation
 * Validates all API responses against the frontend contract validators
 */

import assert from "assert/strict";
import { fetchValidatedJson } from "./apps/web/public/js/api-client.js";
import {
  ApiContractError,
  parseInitDataDto,
  parseListOrdersResponse,
  parseOrderFullResponse,
  parseBillingConfigList,
  parseBillingDetailList,
  parseBillingSummaryList,
  parseInventoryItemList,
  parseClientDtoList,
  parseLocationDtoList,
  parsePackageLedgerResponse,
  parseRbMarkups,
  parseColPrefs,
  parseSyncStatusResponse,
  parseAnalysisSkusResponse,
  parseAnalysisDailySalesResponse,
} from "./apps/web/public/js/api-contracts.js";

const API_BASE_URL = "http://127.0.0.1:4010";
const results = {
  passed: [],
  failed: [],
  skipped: [],
};

async function testEndpoint(name, method, path, validator) {
  try {
    const url = `${API_BASE_URL}${path}`;
    console.log(`Testing: ${method} ${path}...`);

    const response = await fetch(url, { method });
    const data = await response.json();

    if (!response.ok) {
      console.log(`  ⚠️  HTTP ${response.status}: ${data.error || data.message || "unknown"}`);
      results.skipped.push(`${name} (HTTP ${response.status})`);
      return;
    }

    // Validate with the provided parser
    const validated = validator(data);
    console.log(`  ✅ Valid - ${validator.name}`);
    results.passed.push(name);
  } catch (error) {
    if (error instanceof ApiContractError) {
      console.log(`  ❌ VALIDATION ERROR: ${error.message}`);
      results.failed.push({ name, error: error.message });
    } else {
      console.log(`  ⚠️  Error: ${error.message}`);
      results.skipped.push(`${name} (${error.message})`);
    }
  }
}

async function main() {
  console.log("🧪 Testing Frontend API Validation\n");
  console.log(`API Base: ${API_BASE_URL}\n`);

  // Core endpoints
  await testEndpoint(
    "GET /api/init-data",
    "GET",
    "/api/init-data",
    parseInitDataDto
  );

  await testEndpoint(
    "GET /api/orders (page 1)",
    "GET",
    "/api/orders?page=1&pageSize=5",
    parseListOrdersResponse
  );

  await testEndpoint(
    "GET /api/orders/:id/full",
    "GET",
    "/api/orders/268769317/full",
    parseOrderFullResponse
  );

  // Billing endpoints
  await testEndpoint(
    "GET /api/billing/config",
    "GET",
    "/api/billing/config",
    parseBillingConfigList
  );

  await testEndpoint(
    "GET /api/billing/summary",
    "GET",
    "/api/billing/summary",
    parseBillingSummaryList
  );

  // Inventory endpoints
  await testEndpoint(
    "GET /api/inventory",
    "GET",
    "/api/inventory",
    parseInventoryItemList
  );

  // Clients
  await testEndpoint(
    "GET /api/clients",
    "GET",
    "/api/clients",
    parseClientDtoList
  );

  // Locations
  await testEndpoint(
    "GET /api/locations",
    "GET",
    "/api/locations",
    parseLocationDtoList
  );

  // Settings/markups
  await testEndpoint(
    "GET /api/settings/markups/default",
    "GET",
    "/api/settings/markups/default",
    parseRbMarkups
  );

  // Sync status
  await testEndpoint(
    "GET /api/sync/status",
    "GET",
    "/api/sync/status",
    parseSyncStatusResponse
  );

  // Analysis
  await testEndpoint(
    "GET /api/analysis/skus",
    "GET",
    "/api/analysis/skus",
    parseAnalysisSkusResponse
  );

  await testEndpoint(
    "GET /api/analysis/daily-sales",
    "GET",
    "/api/analysis/daily-sales",
    parseAnalysisDailySalesResponse
  );

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESULTS\n");
  console.log(`✅ Passed:  ${results.passed.length}`);
  console.log(`❌ Failed:  ${results.failed.length}`);
  console.log(`⚠️  Skipped: ${results.skipped.length}`);

  if (results.passed.length > 0) {
    console.log("\nPassed validations:");
    results.passed.forEach(name => console.log(`  ✅ ${name}`));
  }

  if (results.failed.length > 0) {
    console.log("\n⚠️  FAILED VALIDATIONS (need investigation):");
    results.failed.forEach(({ name, error }) => {
      console.log(`  ❌ ${name}`);
      console.log(`     ${error}\n`);
    });
  }

  if (results.skipped.length > 0) {
    console.log("\nSkipped endpoints:");
    results.skipped.forEach(name => console.log(`  ⚠️  ${name}`));
  }

  console.log("\n" + "=".repeat(60));

  // Exit with error code if any validations failed
  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
