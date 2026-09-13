Type: bug
Status: ready-for-agent

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
