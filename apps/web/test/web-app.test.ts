import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebApp } from "../src/app/web-app.ts";
import { resolveWebPublicDir } from "../../../packages/shared/src/config/repo-paths.ts";

const publicDir = resolveWebPublicDir(import.meta.url);

test("web app serves the V1 frontend shell from static assets", async () => {
  const app = createWebApp({
    apiBaseUrl: "http://api.test",
    publicDir,
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  });

  const response = await app(new Request("http://web.test/"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);

  const html = await response.text();
  assert.match(html, /PREP<span>SHIP<\/span>/);
  assert.match(html, /view-billing/);
  assert.match(html, /type="module" src="\/js\/app\.js(?:\?v=[^"]+)?"/);
});

test("web app serves copied V1 static assets", async () => {
  const app = createWebApp({
    apiBaseUrl: "http://api.test",
    publicDir,
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  });

  const cssResponse = await app(new Request("http://web.test/css/app.css"));
  assert.equal(cssResponse.status, 200);
  assert.match(cssResponse.headers.get("content-type") ?? "", /text\/css/);
  assert.match(await cssResponse.text(), /\.sidebar/);

  const jsResponse = await app(new Request("http://web.test/js/app.js"));
  assert.equal(jsResponse.status, 200);
  assert.match(jsResponse.headers.get("content-type") ?? "", /text\/javascript/);
  assert.match(await jsResponse.text(), /selectStatus\('awaiting_shipment'\)/);
});

test("web app proxies API requests to the configured backend", async () => {
  const calls: Array<{ input: string; method?: string; body?: string; token?: string | null }> = [];
  const app = createWebApp({
    apiBaseUrl: "http://127.0.0.1:4010",
    publicDir,
    fetchImpl: async (input, init) => {
      calls.push({
        input,
        method: init?.method,
        body: init?.body == null ? undefined : Buffer.from(init.body as ArrayBuffer).toString("utf8"),
        token: new Headers(init?.headers).get("x-app-token"),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });

  const response = await app(new Request("http://web.test/api/billing/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "2026-03-01", to: "2026-03-31" }),
  }));

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [{
    input: "http://127.0.0.1:4010/api/billing/generate",
    method: "POST",
    body: "{\"from\":\"2026-03-01\",\"to\":\"2026-03-31\"}",
    token: "dev-only-insecure-token-change-me",
  }]);
  assert.deepEqual(await response.json(), { ok: true });
});
