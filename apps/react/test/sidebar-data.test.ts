import test from "node:test";
import assert from "node:assert/strict";
import { buildSidebarSections } from "../src/components/Sidebar/sidebar-data.ts";
import type { InitCountsDto, InitStoreDto } from "../src/types/api.ts";

test("buildSidebarSections preserves web-app store labels and global ordering", () => {
  const stores: InitStoreDto[] = [
    {
      storeId: 200,
      storeName: "Beta Store",
      marketplaceId: null,
      marketplaceName: null,
      accountName: null,
      email: null,
      integrationUrl: null,
      active: true,
      companyName: "",
      phone: "",
      publicEmail: "",
      website: "",
      refreshDate: null,
      lastRefreshAttempt: null,
      createDate: null,
      modifyDate: null,
      autoRefresh: false,
      statusMappings: null,
    },
    {
      storeId: 100,
      storeName: "Alpha Store",
      marketplaceId: null,
      marketplaceName: null,
      accountName: null,
      email: null,
      integrationUrl: null,
      active: true,
      companyName: "",
      phone: "",
      publicEmail: "",
      website: "",
      refreshDate: null,
      lastRefreshAttempt: null,
      createDate: null,
      modifyDate: null,
      autoRefresh: false,
      statusMappings: null,
    },
  ];

  const counts: InitCountsDto = {
    byStatus: [
      { orderStatus: "awaiting_shipment", cnt: 7 },
      { orderStatus: "shipped", cnt: 3 },
      { orderStatus: "cancelled", cnt: 0 },
    ],
    byStatusStore: [
      { orderStatus: "awaiting_shipment", storeId: 100, cnt: 2 },
      { orderStatus: "awaiting_shipment", storeId: 200, cnt: 5 },
      { orderStatus: "shipped", storeId: 100, cnt: 3 },
    ],
  };

  const sections = buildSidebarSections(stores, counts);

  assert.equal(sections.awaiting_shipment.total, 7);
  assert.deepEqual(
    sections.awaiting_shipment.stores.map((store) => [store.storeId, store.name, store.cnt]),
    [
      [100, "Alpha Store", 2],
      [200, "Beta Store", 5],
    ],
  );
  assert.deepEqual(
    sections.shipped.stores.map((store) => [store.storeId, store.name, store.cnt]),
    [
      [100, "Alpha Store", 3],
      [200, "Beta Store", 0],
    ],
  );
  assert.deepEqual(
    sections.cancelled.stores.map((store) => [store.storeId, store.name, store.cnt]),
    [
      [100, "Alpha Store", 0],
      [200, "Beta Store", 0],
    ],
  );
});
