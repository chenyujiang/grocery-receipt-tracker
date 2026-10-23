# Coding standards

How code in this repo is written. `CLAUDE.md` covers the project itself (stack, data model, Supabase, the AI spend model); this file covers the conventions a change is reviewed against. What `npm run lint` and `npm run typecheck` already enforce isn't repeated here: those fail the commit on their own.

## Error handling

Supabase's `PostgrestError` is a plain object, **not** an `Error` instance, and `src/lib/*.ts` rethrows it raw (`throw error`). So `err instanceof Error ? err.message : "..."` is false for the errors this app actually hits — RLS violations, constraint failures, permission denials — and silently shows the generic fallback instead. Always turn a caught error into display text with `errorMessage(err, fallback)` from `src/lib/errorMessage.ts`; never hand-roll an `instanceof Error` check. In `/api`, use `serverErrorMessage(err, fallback)` from the same file instead: it hides a `PostgrestError`'s text behind the fallback (ticket 38), since server-side it describes the admin client's queries, not the user's.

Pass the fallback as `t("errors.…")` (keys in `src/lib/i18n.ts`), not a literal, so it follows the language toggle. That only half-closes the gap: Supabase's own error text, shown whenever the error carries one, is English regardless.

When a `src/lib/*.ts` call fails with no text worth showing — a fetch with no body at all, or only a server's own generic English one (the admin routes' 5xx), or a check of its own with nothing to tell the user (nobody signed in, a row that's gone, a guard that shouldn't trip) — throw `UnexplainedError` (`src/lib/errorMessage.ts`). `errorMessage` always gives it the caller's fallback; its own message (a status code, or what failed) is for the console. Don't signal this with an empty-message `Error` instead. A failed fetch to one of our own `/api` routes goes through `throwForFailedResponse(status, body)` (same file), which throws the body's `error` text when there is some and an `UnexplainedError` otherwise — and for any 5xx, whatever the body says, since that's the server describing its own failure in English — so `adminApi.ts` and `receipts.ts` can't drift apart on what the user sees. Likewise, read the signed-in user through `signedInAccessToken()` / `signedInUserId()` (`src/lib/signedIn.ts`), which throw an `UnexplainedError` when nobody is signed in, rather than calling `getSession`/`getUser` and hand-rolling that check again.

Two deliberate `instanceof` exceptions, both in `src/pages/ReceiptUpload.tsx`, both testing for the app's own error types rather than pulling a message out. `err instanceof AiAccessRefusedError` (`src/lib/aiAccessRefusal.ts`) reads its structured `refusal` — the page renders the refusal as JSX, with a `mailto:` link to the admin, worded at render time so it follows the language toggle. `err instanceof AdvisedError` (`src/lib/errorMessage.ts`) shows `t(err.adviceKey)`, the app's own advice for a failure the user can fix: `UnreadablePhotoError` (`src/lib/imageResize.ts`, retake or switch the camera off HEIC) and `RecognitionFailedError` (`src/lib/recognitionFailure.ts`, a photo Claude couldn't read as a receipt). Both are `UnexplainedError`s, so anywhere else they fall back like any other. Every other error on that page still goes through `errorMessage`. Don't hard-code an English sentence in a `src/lib` or `/api` throw to carry advice like this: it can't follow the language toggle. Give it an `AdvisedError` subclass with an i18n key instead.

## UI style conventions

Design tokens are CSS custom properties in `src/index.css`'s `:root` (plus a `prefers-color-scheme: dark` override block) — reach for `var(--primary)`, `var(--danger)`, etc. rather than hardcoding colors.

**Buttons** — default `<button>` plus modifier classes, combinable with `.btn-block` / `.btn-sm`:

- Default `<button>`, no class — green background (`--primary`), white text (`--primary-contrast`). The baseline for primary actions.
- `.btn-danger` — red background (`--danger`), white text. Reserved for destructive actions (delete a receipt, dissolve a circle).
- `.btn-dark` — inverted (background `--text`, text `--bg`). Used only for sign-out — a deliberately distinct look, not a third semantic color, so don't reach for it elsewhere.
- `.btn-secondary` — transparent background, bordered. For a cancel/dismiss action sitting next to a primary one.
- `.btn-block` — `display: block; width: 100%; margin-top: 14px`. A standalone action button below a form/section.
- `.btn-sm` — compact padding/font-size, for inline actions inside a card row (e.g. the receipt list's delete button).

Pick the modifier by what the action *does*, not by where it sits: destructive → `.btn-danger`, sign-out → `.btn-dark`, everything else stays the unstyled green default.

**Spacing**: 14px is the standard gap between a control/list and whatever sits above it (`.btn-block`'s `margin-top`, `.receipt-list`'s `margin-top` and card-to-card `gap`, `form`'s field `gap`). Reuse 14px for that relationship rather than picking a new value; smaller gaps (6–12px) are for tighter internal groupings within a single component.

**Cards**: `.page section`, `.page fieldset`, and `.receipt-card` all share one look — `var(--surface)` background, `var(--border)` border, `var(--radius)` corner radius, `var(--shadow)`, `16px 18px` padding. Reuse one of these rather than inventing a new bordered/shadowed box.

**Form controls**: `input`/`select`/`textarea` are pinned to `font-size: 16px` in `src/index.css` — mobile browsers (iOS Safari, Android Chrome) auto-zoom the whole page on focus if a form control's font-size drops below 16px. Don't let a component-specific style shrink this back down.

## Settled judgement calls

Past reviews raised each of these as a smell, and the answer stuck. Write new code to them; a reviewer cites them as documented standards rather than re-deriving them.

### One source per fact

- **Import a constant from the module that defines it.** No re-export kept just so an old import path still works: the `FREE_TRIAL_LIMIT` re-export from `api/_lib/userAiAccess.ts` and `storeKey`'s from `stores.ts` were both removed. Constants that belong together share a module, as `FREE_TRIAL_LIMIT` and `DEFAULT_GRANT_USD` do in `src/lib/aiAccessPolicy.ts`.
- **A rule lives in one function, and every site calls it.** "Branch unknown" is `isKnownBranch` (`src/lib/storeName.ts`); a Store's display name is `storeName` / `storeShortName`; a select that names a receipt's Store interpolates `STORE_NAMES_EMBED`; chain and branch keys come from `chainKey` / `branchKey` (`src/lib/storeKey.ts`); a credit's dollar figures come from `creditAmounts`. A second inline version of such a check is a defect even when it's weaker and harmless today. A comment that calls a function "the one place" for something must be true.
- **A reason is written once,** beside the code it explains. Docs and other comments point to it rather than restating it.

### Types

- A row shape or RPC argument comes from `Database`: `Pick<…["Row"], …>` for a partial row, the function's `Args` for an RPC payload (see `CLAUDE.md` "Supabase"). A subset of an app type is a `Pick` of it (`Pick<AuthSession, "email" | "userId">`), not a restated object literal.
- A translator parameter is typed `Translate` (`src/lib/i18n.ts`), not a hand-written `(key, params) => string`.
- A column narrowed to a literal union (`Role`, …) keeps that type through the app; it's never widened back to `string`.
- An untrusted JSON body is narrowed with a type guard (`isAiAccessRefusal`, `isRecognitionFailure`), not `as`.
- "None" is `null` or a discriminated-union case, not a sentinel string; the admin dashboard's `"\u0000no-circle"` key became a `null` map key. (`src/lib/storePick.ts`'s `NEW_BRANCH` / `UNKNOWN_BRANCH` inside `pickedStoreId` is a known holdover.) State is never keyed by translated text, which changes with the language toggle.

### Names

- Use `CONTEXT.md`'s term, and one name per concept across functions, constants, and i18n keys. Granting AI Credit is the domain action (`grantCredit`, `DEFAULT_GRANT_USD`); since a grant always resets spend, its UI copy and keys say so (`admin.resetCredit*`, "Reset credit").
- i18n keys are namespaced by concept, not by the page that first used them: `role.owner`, not `settings.roleOwner`.
- A local never shadows an imported function.

### Tests

- Handler tests mock their `src/lib` collaborators (`docs/adr/0001-handler-tests-mock-their-lib-collaborators.md`). A structure another module's test owns, such as the 402 refusal body in `aiAccessRefusal.test.ts`, isn't asserted again in a route test.
- Assert against the real constant (`FREE_TRIAL_LIMIT`), not today's literal value, so changing it can't leave a test silently wrong.
- A failure mock's text is generic and tied to no contract, so a later contract change doesn't leave fixtures that read like the old behavior.
- Setup shared by several test files lives in `src/test/` (`renderInZh`, `fakeSupabase`), not copied into each.
- A fixture's name agrees with what the mock returns.

### Comments and docs

- A comment states what the code does now. When code moves or a file is renamed, update every comment and migration that names it.
- A comment doesn't list a module's callers: the list goes stale with the next import.
- `CONTEXT.md` stays a glossary: no API shapes, no behavior.
