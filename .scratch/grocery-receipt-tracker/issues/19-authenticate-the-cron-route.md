Type: bug
Status: resolved

## Problem

`api/cron/low-stock-check.ts` has no method check and no caller check. Every other route in `api/` either requires a `Bearer` token (`receipts/recognize.ts`) or re-checks `global_admins` server-side (`api/admin/*`); this one is open. Anyone who knows the URL can trigger a sweep of **every Circle's** products — it reads with `supabaseAdmin`, so RLS doesn't contain it — and can insert Alerts and flip `low_stock_alert_active` across the whole database, repeatedly.

The blast radius is limited (it writes only Alerts and one boolean, all idempotent-ish per run) but it's an unauthenticated write path over every tenant's data, and it can be hammered.

Found while adding the handler tests in `api/cron/low-stock-check.test.ts` — the tests currently **characterize** this, under an explicit `CHARACTERIZATION, NOT ENDORSEMENT` comment:

```ts
it.each(["GET", "POST", "DELETE"])("currently runs for an unauthenticated %s", …)
```

## Fix

Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set in the project's env. So:

1. Reject anything but `GET` with 405, to match the other routes.
2. Compare the `Authorization` header against `process.env.CRON_SECRET` and 401 otherwise.
3. Fail closed if `CRON_SECRET` is unset, rather than skipping the check — an unset secret in production is the exact case this is protecting against.
4. Replace the three characterization tests with their inverse (405 on non-GET, 401 on a missing/wrong secret, 200 on the right one) and drop the `CHARACTERIZATION` comment.

Needs `CRON_SECRET` adding to the Vercel project env, and to `README.md` / `README_zh.md`'s env var list.

## Resolution

All four steps done in `api/cron/low-stock-check.ts` and its test:

- Non-`GET` → 405, matching `receipts/recognize.ts`.
- `Authorization: Bearer <secret>` compared against `process.env.CRON_SECRET`; missing, malformed, or mismatched → 401.
- An unset `CRON_SECRET` refuses every caller rather than skipping the check.
- The `CHARACTERIZATION, NOT ENDORSEMENT` block is gone. `"currently runs for an unauthenticated %s"` is replaced by its inverse: 405 on `POST`/`DELETE`/`PUT`, 401 on missing/wrong secret, 401 when the env var is unset, 200 on a `GET` carrying the right one. Each rejection also asserts `supabaseAdmin.from` was never called — a route that 401s *after* sweeping every Circle would still have done the damage.

`CRON_SECRET` is documented in `.env.example`, `README.md` and `README_zh.md`.

**Still needs a human**: adding `CRON_SECRET` to the Vercel project's env vars. Until that is set in production, the scheduled run fails closed and no low-stock alerts are generated — the fail-closed default is deliberate, but it does mean the deploy is a two-step operation.
