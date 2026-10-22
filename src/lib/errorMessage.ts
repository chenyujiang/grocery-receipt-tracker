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
export function errorMessage(err: unknown, fallback: string): string {
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : null;

  return message?.trim() ? message : fallback;
}
