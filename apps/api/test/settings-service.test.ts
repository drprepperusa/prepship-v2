import { test } from "node:test";
import assert from "node:assert/strict";
import { SettingsServices } from "../src/modules/settings/application/settings-services.ts";
import type { SettingsRepository } from "../src/modules/settings/application/settings-repository.ts";

class FakeSettingsRepository implements SettingsRepository {
  private readonly values = new Map<string, string>();

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("settings service works without any concrete datastore adapter", () => {
  const repository = new FakeSettingsRepository();
  const services = new SettingsServices(repository);

  assert.deepEqual(services.get("rbSettings"), null);
  assert.deepEqual(services.set("rbSettings", { dense: true }), { ok: true });
  assert.deepEqual(services.get("rbSettings"), { dense: true });
  assert.throws(() => services.get("not-real"), /Unknown setting/);
});
