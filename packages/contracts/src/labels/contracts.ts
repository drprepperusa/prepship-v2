export interface AddressInputDto {
  name?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

export interface CreateLabelRequestDto {
  orderId: number;
  orderNumber?: string;
  carrierCode?: string;
  serviceCode: string;
  packageCode?: string;
  customPackageId?: number | null;
  shippingProviderId: number;
  weightOz?: number;
  length?: number;
  width?: number;
  height?: number;
  confirmation?: string;
  testLabel?: boolean;
  shipTo?: AddressInputDto;
  shipFrom?: AddressInputDto;
}

export interface CreateLabelResponseDto {
  shipmentId: number;
  trackingNumber: string | null;
  labelUrl: string | null;
  cost: number;
  voided: boolean;
  orderStatus: string;
  apiVersion: "v2";
}

export interface VoidLabelResponseDto {
  success: true;
  shipmentId: number;
  orderNumber: string | null;
  voided: true;
  voidedAt: string;
  trackingNumber: string | null;
  refundAmount: number | null;
  refundInitiated: true;
  refundEstimate: string;
  note: string;
}

export interface ReturnLabelRequestDto {
  reason?: string;
}

export interface ReturnLabelResponseDto {
  success: true;
  shipmentId: number;
  orderNumber: string | null;
  returnTrackingNumber: string;
  returnShipmentId: number | null;
  cost: number;
  reason: string;
  createdAt: string;
}

export interface RetrieveLabelResponseDto {
  orderId: number;
  orderNumber: string | null;
  shipmentId: number;
  trackingNumber: string | null;
  labelUrl: string;
  createdAt: string | null;
  carrier: string;
  service: string;
  cost: number;
}
