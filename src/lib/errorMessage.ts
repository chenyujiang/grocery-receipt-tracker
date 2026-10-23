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
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : null;

  return message?.trim() ? message : fallback;
}

// A failure with no text worth showing the user: a server that answered with
// no error, or only its own generic English one. The message names it for
// the console (the status code); errorMessage shows the caller's translated
// fallback in its place.
export class UnexplainedError extends Error {}

// The error for a failed fetch to our own /api routes, whose failure body is
// { error: string }: that text when there is some, else an UnexplainedError
// so the caller's translated fallback shows.
export function throwForFailedResponse(status: number, body: unknown): never {
  const text =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error.trim()
      : "";
  if (!text) {
    throw new UnexplainedError(`Request failed with status ${status}`);
  }
  throw new Error(text);
}
