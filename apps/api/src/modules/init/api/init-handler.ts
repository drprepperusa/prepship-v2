import type { InitServices } from "../application/init-services.ts";

export class InitHttpHandler {
  private readonly services: InitServices;

  constructor(services: InitServices) {
    this.services = services;
  }

  handleInitData() {
    return this.services.getInitData();
  }

  handleCounts() {
    return this.services.getCounts();
  }

  handleStores() {
    return this.services.getStores();
  }

  handleCarriers() {
    return this.services.getCarriers();
  }

  handleCarrierAccounts() {
    return this.services.getCarrierAccounts();
  }

  handleRefreshCarriers() {
    return this.services.refreshCarriers();
  }
}
