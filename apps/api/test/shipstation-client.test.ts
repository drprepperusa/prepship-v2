/**
 * ShipStationClient unit tests
 *
 * Tests the shared client's rate limiting, circuit breaker,
 * and request deduplication behavior using mock fetch responses.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ShipStationClient, getShipStationClient, setShipStationClient } from "../src/common/shipstation/client.ts";

// ─── Mock fetch ───────────────────────────────────────────────────────────────

type MockCall = { url: string; method: string };

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: MockCall[] = [];
  let callIndex = 0;

  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url.toString();
    calls.push({ url: urlStr, method: (init?.method ?? "GET").toUpperCase() });

    const spec = responses[callIndex];
    if (!spec) throw new Error(`Unexpected fetch call #${callIndex + 1} to ${urlStr}`);
    callIndex++;

    return new Response(JSON.stringify(spec.body), {
      status: spec.status,
      headers: { "Content-Type": "application/json", ...(spec.headers ?? {}) },
    });
  };

  return { fn, calls: () => calls, callCount: () => callIndex };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setShipStationClient(null);
});

afterEach(() => {
  setShipStationClient(null);
});

test("ShipStationClient: successful V1 GET request", async () => {
  const { fn, calls } = mockFetch([
    { status: 200, body: { stores: [{ storeId: 1, storeName: "Test" }] } },
  ]);

  const client = new ShipStationClient();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;

  try {
    const result = await client.v1(
      { apiKey: "key", apiSecret: "secret" },
      "/stores",
    ) as { stores: Array<{ storeId: number; storeName: string }> };

    assert.equal(calls().length, 1);
    assert.equal(calls()[0]?.url, "https://ssapi.shipstation.com/stores");
    assert.equal(calls()[0]?.method, "GET");
    assert.equal(result.stores[0]?.storeName, "Test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ShipStationClient: successful V2 POST request", async () => {
  const { fn, calls } = mockFetch([
    { status: 200, body: { label_id: "se-1234", tracking_number: "1Z999" } },
  ]);

  const client = new ShipStationClient();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;

  try {
    const result = await client.v2(
      { apiKeyV2: "v2key" },
      "/labels",
      { method: "POST", body: { shipment: {} } },
    ) as { label_id: string; tracking_number: string };

    assert.equal(calls().length, 1);
    assert.equal(calls()[0]?.url, "https://api.shipstation.com/v2/labels");
    assert.equal(calls()[0]?.method, "POST");
    assert.equal(result.tracking_number, "1Z999");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ShipStationClient: retries on 429 and succeeds on retry", async () => {
  const { fn, calls } = mockFetch([
    { status: 429, body: { message: "rate limited" }, headers: { "X-Rate-Limit-Reset": "1" } },
    { status: 200, body: { orders: [], pages: 1 } },
  ]);

  const client = new ShipStationClient({ maxRetries: 3 });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;

  try {
    const result = await client.v1<{ orders: unknown[]; pages: number }>(
      { apiKey: "key", apiSecret: "secret" },
      "/orders",
    );
    assert.equal(calls().length, 2, "Should retry once after 429");
    assert.equal(result.pages, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ShipStationClient: circuit breaker opens after threshold failures", async () => {
  // Build a client with low failure threshold (2) for testing
  const responses = Array.from({ length: 10 }, () => ({
    status: 500,
    body: { error: "server error" },
  }));

  const { fn, callCount } = mockFetch(responses);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;

  const client = new ShipStationClient({ maxRetries: 0 });

  // Force 5 failures to open the circuit breaker
  let circuitOpened = false;
  for (let i = 0; i < 10; i++) {
    try {
      await client.v1<unknown>({ apiKey: "key", apiSecret: "secret" }, "/test");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("circuit breaker open")) {
        circuitOpened = true;
        break;
      }
    }
  }

  globalThis.fetch = originalFetch;

  assert.ok(circuitOpened, "Circuit breaker should have opened after repeated failures");
  assert.equal(client.getCircuitState(), "open");
  // Should NOT have made unlimited calls — circuit breaker cut it off
  assert.ok(callCount() < 10, `Should stop making calls after circuit opens (made ${callCount()})`);
});

test("ShipStationClient: deduplicates concurrent identical GET requests", async () => {
  let fetchCallCount = 0;

  const slowFetch = async (_url: string | URL | Request): Promise<Response> => {
    fetchCallCount++;
    await new Promise((r) => setTimeout(r, 20)); // Simulate slow response
    return new Response(JSON.stringify({ carriers: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = new ShipStationClient();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = slowFetch as typeof fetch;

  try {
    // Fire 3 identical requests simultaneously
    const [r1, r2, r3] = await Promise.all([
      client.v1<{ carriers: unknown[] }>({ apiKey: "key", apiSecret: "secret" }, "/carriers", { deduplicate: true }),
      client.v1<{ carriers: unknown[] }>({ apiKey: "key", apiSecret: "secret" }, "/carriers", { deduplicate: true }),
      client.v1<{ carriers: unknown[] }>({ apiKey: "key", apiSecret: "secret" }, "/carriers", { deduplicate: true }),
    ]);

    assert.equal(fetchCallCount, 1, "Should deduplicate to 1 actual fetch call");
    assert.deepEqual(r1, r2);
    assert.deepEqual(r2, r3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ShipStationClient: v1Pages fetches all pages", async () => {
  const { fn, calls } = mockFetch([
    { status: 200, body: { orders: [{ orderId: 1, orderNumber: "A-001" }], pages: 2, page: 1 } },
    { status: 200, body: { orders: [{ orderId: 2, orderNumber: "A-002" }], pages: 2, page: 2 } },
  ]);

  const client = new ShipStationClient();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;

  try {
    const results = await client.v1Pages<{ orderId: number; orderNumber: string }>(
      { apiKey: "key", apiSecret: "secret" },
      "/orders",
      { orderStatus: "awaiting_shipment" },
    );

    assert.equal(calls().length, 2, "Should fetch 2 pages");
    assert.equal(results.length, 2);
    assert.equal(results[0]?.orderNumber, "A-001");
    assert.equal(results[1]?.orderNumber, "A-002");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ShipStationClient: throws on non-retryable 4xx errors", async () => {
  const { fn } = mockFetch([
    { status: 404, body: { message: "Not found" } },
  ]);

  const client = new ShipStationClient({ maxRetries: 0 });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;

  try {
    await assert.rejects(
      async () => client.v1<unknown>({ apiKey: "key", apiSecret: "secret" }, "/nonexistent"),
      (err: Error) => {
        assert.ok(err.message.includes("404"), `Expected 404 in error message, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getShipStationClient returns singleton", () => {
  const c1 = getShipStationClient();
  const c2 = getShipStationClient();
  assert.equal(c1, c2, "Should return same instance");
});

test("setShipStationClient replaces global client", () => {
  const custom = new ShipStationClient({ maxRetries: 5 });
  setShipStationClient(custom);
  assert.equal(getShipStationClient(), custom, "Should return replaced instance");
});
