import type { HealthSyncService, HealthSyncStatusDto } from "../application/health-sync-service.ts";

export class HealthHttpHandler {
  private readonly healthSyncService: HealthSyncService;

  constructor(healthSyncService: HealthSyncService) {
    this.healthSyncService = healthSyncService;
  }

  handleSyncStatus(): HealthSyncStatusDto {
    return this.healthSyncService.getSyncStatus();
  }
}
