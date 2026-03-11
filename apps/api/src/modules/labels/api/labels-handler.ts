import type {
  CreateBatchLabelRequestDto,
  CreateLabelRequestDto,
  ReturnLabelRequestDto,
} from "../../../../../../../packages/contracts/src/labels/contracts.ts";
import { InputValidationError } from "../../../../../../packages/contracts/src/common/input-validation.ts";
import type { LabelServices } from "../application/label-services.ts";

export class LabelsHttpHandler {
  private readonly services: LabelServices;

  constructor(services: LabelServices) {
    this.services = services;
  }

  handleCreate(body: CreateLabelRequestDto) {
    return this.services.create(body);
  }

  handleCreateBatch(body: unknown) {
    const raw = body as Record<string, unknown>;
    if (!Array.isArray(raw.orderIds) || raw.orderIds.length === 0) {
      throw new InputValidationError("orderIds must be a non-empty array");
    }
    if (!raw.serviceCode || typeof raw.serviceCode !== "string") {
      throw new InputValidationError("serviceCode is required");
    }
    if (!raw.shippingProviderId || !Number.isFinite(Number(raw.shippingProviderId))) {
      throw new InputValidationError("shippingProviderId is required");
    }
    const dto: CreateBatchLabelRequestDto = {
      orderIds: raw.orderIds.map((id: unknown) => Number(id)),
      serviceCode: raw.serviceCode,
      carrierCode: typeof raw.carrierCode === "string" ? raw.carrierCode : undefined,
      packageCode: typeof raw.packageCode === "string" ? raw.packageCode : undefined,
      confirmation: typeof raw.confirmation === "string" ? raw.confirmation : undefined,
      testLabel: raw.testLabel === true || raw.testLabel === 1,
      shippingProviderId: Number(raw.shippingProviderId),
    };
    return this.services.createBatch(dto);
  }

  handleVoid(shipmentId: number) {
    return this.services.void(shipmentId);
  }

  handleReturn(shipmentId: number, body: ReturnLabelRequestDto) {
    return this.services.createReturn(shipmentId, body);
  }

  handleRetrieve(orderLookup: number | string, fresh: boolean) {
    return this.services.retrieve(orderLookup, fresh);
  }
}
