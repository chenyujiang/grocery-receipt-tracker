import { parseBearerToken } from "./bearerToken.js";

// Issue 19: a cron route has no user session to check -- it reads and writes
// with the service-role client across every Circle, so RLS doesn't contain
// it. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET
// is set on the project, and that shared secret is the whole of a cron
// route's access control.
//
// An unset CRON_SECRET fails closed. Treating "no secret configured" as
// "skip the check" would leave the route wide open in exactly the
// misconfigured deploy this is meant to protect.
export function isCronAuthorized(authHeader: string | undefined): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && parseBearerToken(authHeader) === cronSecret;
}
