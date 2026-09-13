Type: bug
Status: ready-for-agent

## Problem

`api/admin/users/[userId]/grant-credit.ts` silently downgrades an unusable `capUsd` to "use the default":

```ts
const resolvedCapUsd =
  typeof capUsd === "number" && Number.isFinite(capUsd) && capUsd > 0 ? capUsd : undefined;
```

So `"5"` (a string, e.g. straight from an unparsed form field), `0`, `-5`, `NaN`, and `Infinity` all produce a **successful** 200 response that grants the default $1 instead. The admin sees success and believes they granted what they typed.

This matters more than a typical validation gap because a grant is always a **reset**, never a top-up (issue 15 decision 4): a mis-typed grant doesn't just fail to add the intended amount, it zeroes the user's existing spend and replaces their cap with $1. And nothing auto-corrects afterwards — only another manual grant.

Characterized (not endorsed) in `api/admin/users/[userId]/grant-credit.test.ts`:

```ts
it.each([…])("currently falls back to the default cap on %s instead of 400ing", …)
```

## Fix

Distinguish absent from invalid:

- `capUsd` absent (missing body, or the key not present) → `undefined`, meaning "reset to the default". This is the intended, documented path and must keep working.
- `capUsd` present but not a finite number `> 0` → `400 { error: … }`, no grant attempted.

Flip the characterization test to assert the 400, keep the two "defers to the default cap" cases as-is, and drop the `CHARACTERIZATION` comment.

Check `AdminDashboard.tsx`'s grant form while doing this — if it sends the raw input value as a string, it currently hits the silent-default path on every custom grant, which would make this a live bug rather than a latent one.
