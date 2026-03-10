// Global application state — shared across all modules
export const state = {
  allOrders: [],
  filteredOrders: [],
  selectedOrders: new Set(),
  currentStatus: 'awaiting_shipment',
  currentStoreId: '',
  currentPage: 1,
  totalOrders: 0,
  totalPages: 0,
  storeMap: {},
  clientMap: {},
  sidebarCounts: {},
  rateCache: {},
  currentPanelOrder: null,
  colWidths: {},        // initialized from COLS in app.js
  hiddenCols: new Set(),
  sortState: { key: 'date', dir: 'desc' },
  currentChip: 'all',
  skuSortActive: false,
  preSkuSortSnapshot: null,
  kbRowIndex: -1,
  packagesList: [],
  locationsList: [],
  carrierAccountMap: {},
  carriersList: [],
  // Rate browser state
  rbSelectedPid: null,
  rbRatesData: {},
  rbCurrentOrder: null,
  rbViewMode: 'all',
  rbHideUnavailable: true,
  rbMarkups: {},
  rbStoreCarriers: null,  // Multi-tenant: carriers for current store (if any)
  _markupRefreshTimer: null,
  // Rate fetch
  rateFetchGeneration: 0,
  rateFetchActive: false,
  orderBestRate: {},
  // Analysis
  analysisData: [],
  analysisSortKey: 'qty',
  analysisSortDir: 'desc',
  // Batch
  batchForceShared: false,
  // Sync
  lastSeenSyncTs: 0,
  // Inventory
  invCurrentTab: 'stock',
  invClientsData: [],
  invStockData: [],
  bulkDimsMode: false,
  // Misc
  _adjSign: 1,
  _adjType: 'receive',
  _pkgAdjSign: 1,
  _pkgMatrixClients: [],
  _fetchSkipRates: false,
};
