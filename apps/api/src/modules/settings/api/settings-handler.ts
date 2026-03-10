import type { SettingsServices } from "../application/settings-services.ts";
import type { RateServices } from "../../rates/application/rate-services.ts";

export class SettingsHttpHandler {
  private readonly services: SettingsServices;
  private readonly rateServices: RateServices;

  constructor(services: SettingsServices, rateServices: RateServices) {
    this.services = services;
    this.rateServices = rateServices;
  }

  handleGet(key: string) {
    return this.services.get(key);
  }

  handlePut(key: string, body: unknown) {
    return this.services.set(key, body);
  }

  handleClearAndRefetch() {
    return this.rateServices.clearAndRefetch();
  }
}
