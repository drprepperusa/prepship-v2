export class Container {
  #registry = new Map<string, unknown>();

  set<T>(key: string, value: T): T {
    this.#registry.set(key, value);
    return value;
  }

  get<T>(key: string): T {
    if (!this.#registry.has(key)) {
      throw new Error(`Missing dependency: ${key}`);
    }

    return this.#registry.get(key) as T;
  }
}

