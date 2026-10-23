import type { TranslationKey } from "./i18n.js";

// Every `throw error` in src/lib/*.ts rethrows whatever Supabase handed back,
// and Supabase's PostgrestError is a *plain object* — not an Error instance.
// So `err instanceof Error ? err.message : fallback` is false for the errors
// this app actually hits (RLS violations, constraint failures, permission
// denials), and the real message gets swallowed by the generic fallback.
//
// Mirrored server-side by extractErrorMessage in api/receipts/recognize.ts —
// kept as a separate copy rather than a shared import. Change both together.
// One deliberate difference: the server hides a PostgrestError's message
// behind a generic one (ticket 38), since there it describes the admin
// client's own queries. Here it's the user's own RLS/constraint failure,
// already visible in their network tab, and the only clue to what went wrong.
//
// An UnexplainedError always gets the fallback: it's how src/lib/*.ts says a
// failure came with no text worth showing the user.
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof UnexplainedError) return fallback;
  const message =
    // eslint-disable-next-line no-restricted-syntax -- this is the one place that reads an Error's text
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : null;

  return message?.trim() ? message : fallback;
}

// A failure with no text worth showing the user: a server that answered with
// no error, or only its own generic English one, or a check in src/lib that
// has nothing to tell the user (nobody signed in, a row that's gone, a guard
// that shouldn't trip). The message names it for the console (a status code,
// or what failed); errorMessage shows the caller's translated fallback in its
// place.
export class UnexplainedError extends Error {}

// A failure the app has its own advice for, which the user can act on
// (retake the photo, photograph the receipt in halves). The advice is fixed
// UI chrome, so it's an i18n key rather than a sentence (spec Section 7): a
// page that can word it shows t(adviceKey); anywhere else it's an
// UnexplainedError like any other.
export class AdvisedError extends UnexplainedError {
  constructor(
    message: string,
    readonly adviceKey: TranslationKey
  ) {
    super(message);
  }
}

// The error for a failed fetch to our own /api routes, whose failure body is
// { error: string }: that text when there is some, else an UnexplainedError
// so the caller's translated fallback shows. A 5xx body is the server
// describing its own failure, in English, with nothing the user can act on,
// so it gets the fallback too; a 4xx body says what was wrong with the
// request, and is kept.
export function throwForFailedResponse(status: number, body: unknown): never {
  const text =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error.trim()
      : "";
  if (!text || status >= 500) {
    throw new UnexplainedError(`Request failed with status ${status}`);
  }
  throw new Error(text);
}
