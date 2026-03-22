const DEFAULT_SESSION_TOKEN = "dev-only-insecure-token-change-me";

export function authedRequest(input: string | URL | Request, init: RequestInit = {}) {
  const request = input instanceof Request ? input : new Request(input, init);
  const headers = new Headers(request.headers);

  if (!headers.has("x-app-token")) {
    headers.set("x-app-token", process.env.SESSION_TOKEN ?? DEFAULT_SESSION_TOKEN);
  }

  return new Request(request, { headers });
}
