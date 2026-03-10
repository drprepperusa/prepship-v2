import type {
  CreateLabelRequestDto,
  ReturnLabelRequestDto,
} from "../../../../../../../packages/contracts/src/labels/contracts.ts";
import type { LabelServices } from "../application/label-services.ts";

export class LabelsHttpHandler {
  private readonly services: LabelServices;

  constructor(services: LabelServices) {
    this.services = services;
  }

  handleCreate(body: CreateLabelRequestDto) {
    return this.services.create(body);
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
