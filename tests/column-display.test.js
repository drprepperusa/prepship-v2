/**
 * column-display.test.js — Integration lock tests for shipping account + rate columns
 *
 * These tests call the live API and assert the exact fields that drive the
 * "Shipping Account" (custcarrier) and "Rate" (bestrate) columns in orders.js.
 *
 * PURPOSE: If any upstream change (sync worker, selectedRate logic, carrier resolver,
 * externalShipped flag, or label fields) breaks column display, these tests catch it
 * before it ships to production.
 *
 * Run: node --test tests/column-display.test.js
 * Requires: API running on localhost:4010 with SESSION_TOKEN env var set.
 *
 * LOCKED: Do not edit these assertions without DJ approval.
 * To add cases, append new test() blocks — never modify existing ones.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const API = "http://localhost:4011";
const TOKEN = process.env.SESSION_TOKEN || "b05b4996d27144788a085477e5db30fbe2e057c7029ab2617647704bf3a07c75";
const HEADERS = { "x-session-token": TOKEN };

async function fetchOrder(orderNumber) {
  for (const status of ["shipped", "awaiting_shipment"]) {
    let page = 1;
    while (page <= 20) {
      const r = await fetch(`${API}/api/orders?orderStatus=${status}&pageSize=500&page=${page}`, { headers: HEADERS });
      const d = await r.json();
      const found = (d.orders || []).find(o => o.orderNumber === orderNumber);
      if (found) return found;
      if (page >= (d.pages || 1)) break;
      page++;
    }
  }
  return null;
}

// ── Shipped via PrepShip — UPS tracking decode ────────────────────────────────

test("112-3420662-8872257: selectedRate.providerAccountNickname = ORION", async (t) => {
  const o = await fetchOrder("112-3420662-8872257");
  assert.ok(o, "Order not found");
  assert.equal(o.orderStatus, "shipped");
  assert.equal(o.selectedRate?.providerAccountNickname, "ORION",
    `Expected ORION, got: ${o.selectedRate?.providerAccountNickname}`);
  assert.equal(o.externalShipped, false);
});

test("113-5256879-8365030: selectedRate.providerAccountNickname = GG6381", async (t) => {
  const o = await fetchOrder("113-5256879-8365030");
  assert.ok(o, "Order not found");
  assert.equal(o.orderStatus, "shipped");
  assert.equal(o.selectedRate?.providerAccountNickname, "GG6381",
    `Expected GG6381, got: ${o.selectedRate?.providerAccountNickname}`);
  assert.equal(o.externalShipped, false);
});

// ── Amazon-fulfilled — ext-label badge ───────────────────────────────────────

test("112-4755286-8349061: externalShipped=true, selectedRate=null (Amazon external)", async (t) => {
  const o = await fetchOrder("112-4755286-8349061");
  assert.ok(o, "Order not found");
  assert.equal(o.orderStatus, "shipped");
  assert.equal(o.externalShipped, true,
    "externalShipped must be true for Amazon-shipped orders with no SS shipment");
  assert.equal(o.selectedRate, null,
    "selectedRate must be null for Amazon-shipped orders");
});

// ── bestRate must be null for all shipped orders ──────────────────────────────

test("bestRate is null for all shipped orders (page 1)", async (t) => {
  const r = await fetch(`${API}/api/orders?orderStatus=shipped&pageSize=100&page=1`, { headers: HEADERS });
  const d = await r.json();
  const withBestRate = (d.orders || []).filter(o => o.bestRate !== null);
  assert.equal(withBestRate.length, 0,
    `${withBestRate.length} shipped orders have non-null bestRate: ${withBestRate.map(o => o.orderNumber).join(", ")}`);
});

// ── no stale selectedRate on awaiting orders without a label ─────────────────

test("awaiting_shipment orders without label have null selectedRate", async (t) => {
  const r = await fetch(`${API}/api/orders?orderStatus=awaiting_shipment&pageSize=100&page=1`, { headers: HEADERS });
  const d = await r.json();
  const leaked = (d.orders || []).filter(o =>
    o.selectedRate !== null && !o.label?.trackingNumber
  );
  assert.equal(leaked.length, 0,
    `${leaked.length} awaiting orders have selectedRate with no label: ${leaked.map(o => o.orderNumber).join(", ")}`);
});

// ── providerAccountNickname is never the sentinel value "External" ────────────

test("no shipped order has providerAccountNickname = 'External' (resolver broken sentinel)", async (t) => {
  const r = await fetch(`${API}/api/orders?orderStatus=shipped&pageSize=500&page=1`, { headers: HEADERS });
  const d = await r.json();
  const bad = (d.orders || []).filter(o => o.selectedRate?.providerAccountNickname === "External");
  assert.equal(bad.length, 0,
    `${bad.length} orders show 'External' sentinel: ${bad.map(o => o.orderNumber).join(", ")}`);
});
