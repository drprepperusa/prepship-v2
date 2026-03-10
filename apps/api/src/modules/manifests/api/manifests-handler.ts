import type { GenerateManifestInput } from "../../../../../../../packages/contracts/src/manifests/contracts.ts";
import type { ManifestServices } from "../application/manifest-services.ts";

export class ManifestsHttpHandler {
  private readonly services: ManifestServices;

  constructor(services: ManifestServices) {
    this.services = services;
  }

  handleGenerate(body: GenerateManifestInput) {
    return this.services.generate(body);
  }
}
