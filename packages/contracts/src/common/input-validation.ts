export class InputValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export function parseOptionalIntegerParam(value: string | null, name: string): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  if (!/^-?\d+$/.test(value.trim())) {
    throw new InputValidationError(`${name} must be an integer`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new InputValidationError(`${name} must be an integer`);
  }

  return parsed;
}
