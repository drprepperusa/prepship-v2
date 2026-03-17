// Column definitions — exported from a separate file to avoid
// Vite Fast Refresh warning about non-component exports in component files.

export const ALL_COLUMNS = [
  { key: 'select',      label: '',                 width: 34,  sortable: false, defaultVisible: true  },
  { key: 'date',        label: 'Order Date',       width: 100, sortable: true,  defaultVisible: true  },
  { key: 'client',      label: 'Client',           width: 90,  sortable: true,  defaultVisible: true  },
  { key: 'orderNum',    label: 'Order #',          width: 120, sortable: true,  defaultVisible: true  },
  { key: 'customer',    label: 'Recipient',        width: 130, sortable: true,  defaultVisible: true  },
  { key: 'itemname',    label: 'Item Name',        width: 200, sortable: true,  defaultVisible: true  },
  { key: 'sku',         label: 'SKU',              width: 90,  sortable: true,  defaultVisible: true  },
  { key: 'qty',         label: 'Qty',              width: 40,  sortable: true,  defaultVisible: true  },
  { key: 'weight',      label: 'Weight',           width: 80,  sortable: true,  defaultVisible: false },
  { key: 'shipto',      label: 'Ship To',          width: 120, sortable: true,  defaultVisible: false },
  { key: 'carrier',     label: 'Carrier',          width: 100, sortable: true,  defaultVisible: false },
  { key: 'custcarrier', label: 'Shipping Account', width: 130, sortable: true,  defaultVisible: false },
  { key: 'total',       label: 'Order Total',      width: 85,  sortable: true,  defaultVisible: false },
  { key: 'bestrate',    label: 'Best Rate',        width: 80,  sortable: false, defaultVisible: true  },
  { key: 'tracking',    label: 'Tracking #',       width: 120, sortable: false, defaultVisible: false },
]
