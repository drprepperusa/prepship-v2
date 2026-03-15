export interface PrintQueueEntry {
  id: string;
  clientId: number;
  orderId: string;
  orderNumber: string | null;
  labelUrl: string;
  skuGroupId: string;
  primarySku: string | null;
  itemDescription: string | null;
  orderQty: number;
  multiSkuData: MultiSkuItem[] | null;
  status: 'queued' | 'printed';
  printCount: number;
  lastPrintedAt: number | null;
  queuedAt: number;
  createdAt: number;
}

export interface MultiSkuItem {
  sku: string;
  description?: string;
  qty: number;
}

export interface AddToQueueInput {
  clientId: number;
  orderId: string;
  orderNumber?: string;
  labelUrl: string;
  skuGroupId: string;
  primarySku?: string;
  itemDescription?: string;
  orderQty?: number;
  multiSkuData?: MultiSkuItem[];
}

export interface PrintQueueSummary {
  totalOrders: number;
  totalQty: number;
  skuGroups: number;
}
