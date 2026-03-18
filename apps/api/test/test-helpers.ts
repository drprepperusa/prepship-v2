/**
 * Test Helpers — Shared utilities for all API tests
 * Provides authedRequest() to inject X-App-Token header on all requests
 */

export const DEV_SESSION_TOKEN = "dev-only-insecure-token-change-me";

/**
 * Create a Request with X-App-Token header
 * @param url Request URL
 * @param init Optional RequestInit (headers will be merged)
 */
export function authedRequest(url: string | URL, init?: RequestInit): Request {
  const headers = new Headers(init?.headers || {});
  headers.set("X-App-Token", DEV_SESSION_TOKEN);

  return new Request(url, {
    ...init,
    headers,
  });
}
