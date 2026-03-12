import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("orders module exposes getDateRange for the polling refresh path", async () => {
  const source = await readFile(new URL("../public/js/orders.js", import.meta.url), "utf8");
  assert.match(source, /window\.getDateRange\s*=\s*getDateRange;/);
});
