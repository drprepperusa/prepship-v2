export interface OrderRecord {
  orderId: number;
  clientId: number | null;
  clientName: string | null;
  orderNumber: string | null;
  orderStatus: string;
  orderDate: string | null;
  storeId: number | null;
  customerEmail: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToPostalCode: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  weightValue: number | null;
  orderTotal: number | null;
  shippingAmount: number | null;
  residential: boolean | null;
  sourceResidential: boolean | null;
  externalShipped: boolean;
  externallyFulfilledVerified: boolean;
  bestRateJson: string | null;
  selectedRateJson: string | null;
  labelShipmentId: number | null;
  labelTracking: string | null;
  labelCarrier: string | null;
  labelService: string | null;
  labelProvider: number | null;
  labelCost: number | null;
  labelRawCost: number | null;
  labelShipDate: string | null;
  raw: string;
  items: string;
}

