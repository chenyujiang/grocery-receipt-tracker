# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## What this is

A family-shared web app: photograph grocery receipts, AI (OCR + translation + categorization) extracts line items, the app tracks unit-price changes, consumption rate, and multi-store price comparison. Full requirements: `.scratch/grocery-receipt-tracker/spec.md`, English original first and its Chinese translation below it in the same file — read the relevant section before implementing a feature rather than re-deriving behavior from scratch. The planning history (why each decision was made) is in `.scratch/grocery-receipt-tracker/map.md` and `issues/NN-*.md`.

## Doc language convention

Every planning doc under `.scratch/grocery-receipt-tracker/`, plus this repo's `README.md`, `CONTEXT.md`, and `docs/adr/*.md`, is **one bilingual file**: the English original, then a `---` rule and a `> **中文版**` marker, then the Chinese translation. (They used to be separate `_zh.md` files; that split is gone — don't recreate it.) The English half is canonical when the two disagree, since its terms are the ones that match the code's identifiers. Edit both halves together — don't let them drift. Issue files keep a single `Type:`/`Status:`/`GitHub:` header above the English half, covering the whole file, so status can't differ between languages. This is a documentation-only convention; it's unrelated to the app's own bilingual data fields (see below).

## Stack

React + TypeScript + Vite (frontend), Vercel Serverless Functions in `/api` (backend), Supabase (Postgres + Auth + Storage). Path alias `@` → `src`.

Commands: `npm run dev`, `npm run build`, `npm run typecheck`, `npm test` (vitest run).

`tsc -b` spans three projects — `tsconfig.app.json` (`src`), `tsconfig.node.json` (`vite.config.ts`), and `tsconfig.api.json` (`api`) — so `typecheck` and `build` both cover the serverless functions. A new top-level directory needs its own project here, or it silently goes unchecked. `app` and `api` both extend `tsconfig.base.json`, which owns the strictness flags, module resolution, and the `@/*` path alias: put a rule that should hold everywhere there, so the frontend's settings and the functions' can't drift apart.

## Testing

This project is built TDD-first (see the `tdd` skill). Before adding tests for a new unit, confirm the seams (the public interfaces under test) with the user — don't assume. The established boundary-mocking convention is to mock `@/lib/supabaseClient`, never Supabase internals. Tests use Vitest + Testing Library; `src/test/setup.ts` handles jest-dom matchers and DOM cleanup between tests.

## Data model conventions

- Bilingual dynamic content (product names, store names) is stored as `_en`/`_zh` column pairs — `_en` is the OCR-recognized English source text (receipts are from New Zealand supermarkets), `_zh` is the AI translation. Fixed UI chrome is translated too (a hand-written dictionary in `src/lib/i18n.ts`, exposed via `LanguageProvider`'s `t()`), driven by the same toggle as the data content — no separate i18n framework.
- Category lives solely on `Product.category`, read via `product_id` — `ReceiptItem` does not have its own `category` column (see spec.md Section 5.2 for why).
- All user corrections (OCR fixes, translation fixes, category fixes) are recorded in `EditLog`.
- **Purchase history is fetched in exactly one place**: `fetchPurchaseHistories(client, productIds)` in `src/lib/purchaseHistory.ts`. Every price/consumption feature starts from it — price change (S10), price trend, store comparison (S11), consumption rate (S12), price-spike alerts (S13), and the monthly report's leaderboard (S14). It splits the ids into batches (to keep the `in.(...)` URL short) and reads each batch's `.in("product_id", batch)` query a page at a time with `.range()` — never one query per product. The page size is `POSTGREST_PAGE_SIZE` (`src/lib/postgrestPaging.ts`), and it must stay ≤ PostgREST's max-rows, or a server-truncated page looks like the last one and the read silently stops early. If you find yourself writing a `for` loop around a `receipt_items` select, that's the N+1 this module exists to prevent. It returns one `PurchaseHistory` per requested id in the order requested (empty `purchases` if that product has none), each sorted oldest-first, and drops rows with no `product_id` or no unit spec, since nothing downstream can normalize them. The Supabase client is a parameter, not an import: passing `supabase` scopes the read to the caller's circle via RLS, passing `supabaseAdmin` (cron only) sweeps every circle — that choice *is* the scope decision, so keep it visible at the call site rather than behind a flag. Keeping the client out of the module is also what lets `/api` import it, since it never touches `import.meta.env`.
- `CONTEXT.md` is the project's domain glossary (Purchase, Purchase History, Circle, …). Read it before naming a new type, and add to it when a term gets settled — but keep it a glossary: no implementation details, no requirements.

## Error handling

Supabase's `PostgrestError` is a plain object, **not** an `Error` instance, and `src/lib/*.ts` rethrows it raw (`throw error`). So `err instanceof Error ? err.message : "..."` is false for the errors this app actually hits — RLS violations, constraint failures, permission denials — and silently shows the generic fallback instead. Always turn a caught error into display text with `errorMessage(err, fallback)` from `src/lib/errorMessage.ts`; never hand-roll an `instanceof Error` check. `api/receipts/recognize.ts` keeps its own `extractErrorMessage` copy — change both together. It differs in one deliberate way: server-side, a `PostgrestError` gets a generic message instead of its own text (ticket 38), since there it describes the admin client's queries, not the user's.

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

## Claude API usage in this app (not this coding session)

The app's own backend (`api/receipts/recognize.ts`) calls the Anthropic API server-side to OCR + translate + suggest product matches in one call. Two constraints that must not be relaxed without the user's explicit say-so:

- Model is pinned to **Claude Haiku 4.5** (`claude-haiku-4-5`) for cost reasons.
- Spend is capped **per user** via `user_ai_access` (`api/_lib/userAiAccess.ts`), not a global cap — see spec.md Section 16 / issue 15 for the full model. A brand-new user gets **`FREE_TRIAL_LIMIT` (5) free successful recognition calls** (count-based, `free_trial_calls_used`); once exhausted, further calls are refused until a global admin grants them a real dollar-based credit (default $1, or a custom amount) via the admin dashboard. The signup flow tells the user about this allowance right after they register (`src/pages/Home.tsx`'s one-time welcome banner, driven by `justSignedUp` router state set in `src/pages/Auth.tsx`). Granting credit is always a **reset** (zeroes spend, sets a fresh cap), never a top-up. **No automatic reset or increase** — only a global admin's manual grant lifts a block. Don't build auto-reset/auto-raise logic even if it seems convenient. Accounting is atomic in Postgres (issue 37): the recognize route calls `reserveCall` before Claude (RPC `reserve_ai_call`, which counts a trial call up front) and gets back a `Reservation`, then calls exactly one of its `recordSpend` (`record_ai_spend`, `spent_usd = spent_usd + cost`) or `release` (`release_ai_call`, hands the trial call back if Claude didn't answer). Await `release` before writing the error response, never after: Vercel may freeze the function once the response is sent. Each RPC is one row-locking `UPDATE`, so don't reintroduce a read-then-write in TypeScript. The dollar cap is only checked (`spent_usd < cap_usd`) at reservation, so concurrent in-flight calls can overshoot it by their cost. A refused call is a 402 whose body is the structured `{ code, … }` refusal defined in `src/lib/aiAccessRefusal.ts` (`ai_trial_exhausted`, or `ai_credit_exhausted` with `spentUsd`/`capUsd`) — not `{ error }` — so the page words it itself, in the user's language. Likewise, a photo Claude answered for but that can't be read as a receipt (too long, incomplete JSON, no date or line items) is a 422 whose body is `{ code }` from `src/lib/recognitionFailure.ts`, not a sentence. The old singleton `ai_spend_limit` table/global cap is superseded and unused, left in place only for a possible later cleanup migration.

## Admin dashboard (issue 15)

A single global admin (flagged via the `global_admins` table, currently just `nz.eason.chen@gmail.com`) can view every user across every circle, ban/unban accounts (Supabase Auth's own ban mechanism, not an app-level flag), grant AI credit, and merge several standalone-circle users into one shared circle — at `src/pages/AdminDashboard.tsx`, served from the non-obvious path in `ADMIN_DASHBOARD_PATH` (`src/lib/adminApi.ts`), guarded by `RequireGlobalAdmin` (404s for non-admins rather than redirecting to `/auth`, so the route's existence isn't revealed). A global admin is redirected there once, immediately after login, and can also get back in later via a persistent "Go to admin dashboard" link on Circle Settings (same `isGlobalAdmin` check). Backend routes live under `api/admin/`, each re-checking `global_admins` server-side via `requireGlobalAdmin.ts` — never trust the frontend's own admin check for anything privileged.

**Circle merging, not invite links**: there's no invite-token flow (deliberately dropped, not deferred — the app is family-only/self-use). Signup still self-service-creates its own circle per account; an admin multi-selects standalone users in the dashboard and merges them into one new circle via `merge_users_into_new_circle` (a Postgres function, service-role-only, in `supabase/migrations/`), carrying products/receipts/alerts over atomically. That function refuses to merge a user out of an already-multi-member circle — products are circle-level, so a partial-circle merge would strand the circle's other member(s) without their data. `CircleSettings.tsx`'s own "Dissolve circle" is hidden behind a flag (`SHOW_DISSOLVE_CIRCLE`, code kept) now that circle consolidation is admin-driven, not something an owner should do unilaterally.

**Fixed (was: known open bug)**: new-account signup used to fail to auto-create its circle/profile — not actually an intermittent timing race as first suspected, but a 100%-reproducible RLS bug (confirmed with `SET ROLE authenticated` directly in SQL, no client involved): `circles`' own SELECT policy (`id = current_circle_id()`) can't resolve for a brand-new user with no `profiles` row yet, so the `INSERT ... RETURNING` that `.insert().select()` generates has no visible row to return and Postgres reports the whole statement as an RLS violation — even though the INSERT's own `with_check(true)` would have allowed it. Fixed in `src/lib/auth.ts` (`signUpWithEmail`/`ensureProfile`) by generating the circle's id client-side and dropping `.select()` from both inserts, so the RETURNING-visibility check is never triggered. See issue 15's "Post-launch amendments" for the full repro trail.

## Supabase

Project `xflabzrcowhqjvvwjrbt` (`Eason's Project`, `ap-southeast-2`). Local migration copies live in `supabase/migrations/` and mirror what's applied live — apply new migrations through the Supabase MCP tools, then save a matching copy there. See `README.md` for env var setup and what's not yet implemented.

Both clients are typed: `createClient<Database>` in `src/lib/supabaseClient.ts` and `api/_lib/supabaseAdmin.ts`, from `src/types/database.types.ts`. That file is **hand-derived from the migrations**, not generated — the Supabase CLI isn't wired up — so **a migration that changes a column must update it in the same commit**, or every query silently goes back to `any`. Two things about it that aren't `gen types` output and must survive any future regeneration: the FK `Relationships` entries (without them supabase-js infers to-one embeds as arrays, which is what the deleted `as unknown as` casts used to paper over), and the literal-union narrowing on `profiles.role` / `receipts.status` / `alerts.type`, which Postgres enforces by CHECK constraint but `gen types` only narrows for real enums.

Pass `SupabaseClient<Database>`, never bare `SupabaseClient`, when a module takes its client as a parameter — the bare type defaults to an `any` schema and silently opts that module out of all of the above.

`src/types/index.ts` used to carry hand-written row interfaces (`Receipt`, `Product`, …) that predated this and were both unused and wrong about `_zh` nullability; they're deleted. Only `Role` and `CATEGORIES` live there now — for a row shape, reach for `Database["public"]["Tables"][...]["Row"]`, and don't reintroduce a hand-written one.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<effort>/` (currently just `.scratch/grocery-receipt-tracker/`), and those files are canonical. Each is mirrored to a GitHub issue, linked from the file's own `GitHub: #NN` header line — **the two numbers differ, by no fixed amount** (issues and PRs share one number sequence, so every merged PR widens the gap: local 01–22 are GitHub #2–#23, local 23–28 are GitHub #27–#32), so never cite a GitHub number as if it were the local one, and never compute one from the other — read the header line. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one `CONTEXT.md` + `docs/adr/` at the repo root, created lazily as decisions get resolved). See `docs/agents/domain.md`.
