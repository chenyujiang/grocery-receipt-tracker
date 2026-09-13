const BEARER_PREFIX = "Bearer ";

// The one place that knows how to read an `Authorization: Bearer <token>`
// header. Three routes parse one: receipts/recognize.ts and
// requireGlobalAdmin.ts both pull a Supabase access token out of it, and
// cron/low-stock-check.ts pulls Vercel Cron's shared secret. What the token
// *means* differs; getting it out of the header does not.
//
// An empty token ("Bearer " with nothing after it) is null, not "". Every
// caller already treated "" as missing via a falsy check, and a caller that
// compares the result against a secret must never match on emptiness.
export function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authHeader.slice(BEARER_PREFIX.length) || null;
}
