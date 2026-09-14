Type: bug
Status: resolved

## Problem

The admin dashboard's custom-grant form loses both halves of a failed grant: it refuses bad input without saying so, and it swallows a failed request entirely.

`src/pages/AdminDashboard.tsx`'s Grant button bails on invalid input with a bare `return`:

```ts
const amount = parseFloat(customAmount);
if (Number.isNaN(amount) || amount <= 0) return;
```

The admin clicks Grant, nothing happens, no message, and the typed amount stays in the box — indistinguishable from a dead button.

`withBusy` has no `catch`:

```ts
async function withBusy(action: () => Promise<void>) {
  setBusy(true);
  try {
    await action();
    onChange();
  } finally {
    setBusy(false);
  }
}
```

So every rejection from `adminApi.ts` — grant, ban/unban, merge — becomes an unhandled promise rejection. The spinner stops, the list doesn't refresh, and the admin is told nothing.

The two combine on the one input `parseFloat` accepts but the backend now refuses: the literal text `Infinity` (and `1e400`, which parses to `Infinity`) passes the frontend's `NaN`/`<= 0` guard, reaches `grant-credit.ts`, comes back `400 { error: "capUsd must be a positive number" }` — and that message is never shown. Issue 21 deliberately made the backend honest about a mis-typed grant; the frontend currently discards the honesty.

This matters for the same reason issue 21 did: a grant is a reset, never a top-up (issue 15 decision 4), so an admin who can't tell a failed grant from a successful one may retry and zero a user's spend, or walk away believing a grant landed when it didn't.

## Fix

1. Give `UserCard` an error slot (component state + a rendered message) and show `errorMessage(err, …)` from `@/lib/errorMessage` — per CLAUDE.md, never a hand-rolled `err instanceof Error` check.
2. `catch` in `withBusy` and put the message in that slot, so ban/unban and merge failures surface too, not just grants.
3. Replace the silent `return` on invalid input with the same visible message rather than a no-op.
4. Have `adminApi.ts`'s helpers carry the server's `{ error }` body into the thrown error, so the backend's "capUsd must be a positive number" is what the admin reads. Check what `grantAdminCredit`/`setAdminUserBanned`/`mergeUsersIntoCircle` currently throw on a non-2xx before assuming.

Decide with the user whether the frontend should also reject non-finite input before the request (i.e. `Number.isFinite`, matching the backend) or let the 400 be the single source of truth — one guard or two, not two that disagree.

## Resolution

Points 1–3 done in `src/pages/AdminDashboard.tsx`. Point 4 needed no change: `authorizedFetch` already threw `new Error(body?.error ?? …)`, so the server's message was reaching the frontend all along — it was only being discarded by the missing `catch`.

The merge button lives on the page, not on a card, so it got its own `mergeError` slot rather than reusing the page's `error` state: `error` deliberately hides the whole roster, and a failed merge should leave the selection on screen to retry or adjust.

**Open question, decided: two guards that agree.** The frontend keeps a pre-request check. A frontend guard is needed regardless — an empty box or `abc` shouldn't cost a round-trip — so the choice was never really "one guard or two", only whether the two agree. They now do: the check is `Number.isFinite(amount) && amount > 0`, matching `grant-credit.ts` exactly. The wording differs on purpose: the admin reads "Enter a grant amount greater than 0.", while the backend's `capUsd must be a positive number` names a request field and is what surfaces if a bad amount ever reaches it anyway.

Parsing is `Number(text.trim())`, not `parseFloat`. `parseFloat` is the leniency the backend *cannot* cover: `parseFloat("5abc")` is `5`, so a typo would arrive as a perfectly valid request and reset the user's cap to an amount nobody typed — the exact failure this issue exists to close. `Number()` rejects the whole string instead.

Two limits worth recording rather than leaving implied:

- The per-user error is held by the page (`cardErrors`, keyed by user id), not by `UserCard`. A flagged user renders as *two* cards — once in the needs-attention queue, once in the circle roster — and card-local state would show the failure on the clicked copy while the other copy looked untouched.
- "The backend's message is what the admin reads" holds for the 400s, not for auth failures: `requireGlobalAdmin` rejections answer `res.status(auth.status).json({})` with no `error` key, so those surface as `Request failed with status 401`. That non-disclosure is deliberate and was left alone.
