import { test } from "node:test";
import assert from "node:assert/strict";
import { createRouteDispatcher, jsonRoute } from "../src/app/router.ts";

test("route dispatcher matches literals, params, and integer-constrained params", async () => {
  const dispatch = createRouteDispatcher([
    jsonRoute("GET", "/api/items/static", () => ({ kind: "static" })),
    jsonRoute("GET", "/api/items/:itemId(int)", ({ params }) => ({ itemId: params.itemId })),
    jsonRoute("DELETE", "/api/items/:slug", ({ params }) => ({ slug: params.slug })),
  ]);

  const staticResponse = await dispatch({
    request: new Request("http://127.0.0.1:4010/api/items/static"),
    url: new URL("http://127.0.0.1:4010/api/items/static"),
    readJson: async () => ({}),
  });
  assert.ok(staticResponse);
  assert.deepEqual(await staticResponse.json(), { kind: "static" });

  const intParamResponse = await dispatch({
    request: new Request("http://127.0.0.1:4010/api/items/42"),
    url: new URL("http://127.0.0.1:4010/api/items/42"),
    readJson: async () => ({}),
  });
  assert.ok(intParamResponse);
  assert.deepEqual(await intParamResponse.json(), { itemId: "42" });

  const nonIntResponse = await dispatch({
    request: new Request("http://127.0.0.1:4010/api/items/not-a-number"),
    url: new URL("http://127.0.0.1:4010/api/items/not-a-number"),
    readJson: async () => ({}),
  });
  assert.equal(nonIntResponse, null);

  const deleteResponse = await dispatch({
    request: new Request("http://127.0.0.1:4010/api/items/queued", { method: "DELETE" }),
    url: new URL("http://127.0.0.1:4010/api/items/queued"),
    readJson: async () => ({}),
  });
  assert.ok(deleteResponse);
  assert.deepEqual(await deleteResponse.json(), { slug: "queued" });
});
