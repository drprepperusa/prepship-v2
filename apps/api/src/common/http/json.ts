import { STATUS_CODES } from "node:http";

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    statusText: STATUS_CODES[status] ?? "OK",
  });
}

