import { ApiContractError } from "./api-contracts.js";

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function parseErrorResponse(response) {
  const body = await parseResponseBody(response);
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  if (typeof body === "string" && body.trim()) {
    return body;
  }
  return `HTTP ${response.status}`;
}

function buildHttpError(response, body) {
  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : `HTTP ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.body = body;
  return error;
}

/**
 * Fetch JSON and validate successful payloads before returning them.
 *
 * @template T
 * @param {string} input
 * @param {RequestInit | undefined} init
 * @param {(value: unknown) => T} parse
 * @returns {Promise<T>}
 */
export async function fetchValidatedJson(input, init, parse) {
  const response = await fetch(input, init);
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response, body);
  }

  try {
    return parse(body);
  } catch (error) {
    if (error instanceof ApiContractError) {
      throw new ApiContractError(`${input}: ${error.message}`);
    }
    throw error;
  }
}
