/**
 * Fetch wrapper that automatically adds X-App-Token header to all requests
 */

const API_TOKEN = "dev-only-insecure-token-change-me";

export async function fetchWithToken(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const headers = {
    "x-app-token": API_TOKEN,
    ...(options?.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
