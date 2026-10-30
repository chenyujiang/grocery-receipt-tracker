import type { VercelRequest, VercelResponse } from "@vercel/node";

// Fakes for the two objects Vercel hands a route handler, plus the request
// Vercel Cron sends. A handler returns nothing and reports everything through
// `res`, so a test needs to record the status and body rather than read a
// return value.
//
// Deliberately minimal: `status().json()` is the only response shape any of
// the six handlers uses. Add to this only when a handler actually needs more.

export interface RequestParts {
  method?: string;
  /** Bare token; the `Bearer ` prefix is added here. Omit for no header. */
  authToken?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Vercel's dynamic route segments, e.g. `{ userId: "user-1" }`. */
  query?: Record<string, string | string[]>;
}

/** The value doesn't matter: callers mock isCronAuthorized. */
export const CRON_SECRET = "cron-secret";

/**
 * A request carrying `Authorization: Bearer $CRON_SECRET`, as Vercel Cron sends
 * it. Cron only sends GET; pass another method to test a route rejecting it.
 */
export function cronReq(method = "GET"): VercelRequest {
  return makeReq({ method, authToken: CRON_SECRET });
}

export function makeReq({
  method = "POST",
  authToken,
  headers = {},
  body,
  query = {},
}: RequestParts = {}): VercelRequest {
  return {
    method,
    headers: authToken ? { authorization: `Bearer ${authToken}`, ...headers } : headers,
    body,
    query,
  } as unknown as VercelRequest;
}

export interface FakeResponse {
  /** Undefined until the handler responds — asserting on it catches a handler that falls through. */
  statusCode: number | undefined;
  body: unknown;
  res: VercelResponse;
}

export function makeRes(): FakeResponse {
  const captured: FakeResponse = {
    statusCode: undefined,
    body: undefined,
    res: undefined as unknown as VercelResponse,
  };

  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  };

  captured.res = res as unknown as VercelResponse;
  return captured;
}
