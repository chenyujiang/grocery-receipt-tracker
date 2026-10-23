# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## What this is

A family-shared web app: photograph grocery receipts, AI (OCR + translation + categorization) extracts line items, the app tracks unit-price changes, consumption rate, and multi-store price comparison. Full requirements: `.scratch/grocery-receipt-tracker/spec.md`, English original first and its Chinese translation below it in the same file — read the relevant section before implementing a feature rather than re-deriving behavior from scratch. The planning history (why each decision was made) is in `.scratch/grocery-receipt-tracker/map.md` and `issues/NN-*.md`.

## Doc language convention

Every planning doc under `.scratch/grocery-receipt-tracker/`, plus this repo's `README.md`, `CONTEXT.md`, and `docs/adr/*.md`, is **one bilingual file**: the English original, then a `---` rule and a `> **中文版**` marker, then the Chinese translation. The English half is canonical when the two disagree, since its terms are the ones that match the code's identifiers. Edit both halves together — don't let them drift. Issue files keep a single `Type:`/`Status:`/`GitHub:` header above the English half, covering the whole file, so status can't differ between languages. This is a documentation-only convention; it's unrelated to the app's own bilingual data fields (see below).

## Stack

React + TypeScript + Vite (frontend), Vercel Serverless Functions in `/api` (backend), Supabase (Postgres + Auth + Storage). Path alias `@` → `src`.

Commands: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (vitest run). A Husky pre-commit hook (`.husky/pre-commit`, installed by `npm install`'s `prepare` script) runs lint, typecheck, and the tests, so a commit that fails any of them doesn't land — fix the failure rather than skipping it with `--no-verify`.

`eslint.config.js` enforces three conventions from `CODING_STANDARDS.md` mechanically, outside tests: no `instanceof Error` and no literal `errorMessage` fallback (its "Error handling"), and no user-visible JSX text or `aria-label`/`title`/`placeholder`/`alt` literal containing a word (spec Section 7 — separators like `·` `—` `$` are fine). It also enforces the import rules in "Code `/api` loads at runtime" below.

`tsc -b` spans three projects — `tsconfig.app.json` (`src`), `tsconfig.node.json` (`vite.config.ts`), and `tsconfig.api.json` (`api`) — so `typecheck` and `build` both cover the serverless functions. A new top-level directory needs its own project here, or it silently goes unchecked. `app` and `api` both extend `tsconfig.base.json`, which owns the strictness flags, module resolution, and the `@/*` path alias: put a rule that should hold everywhere there, so the frontend's settings and the functions' can't drift apart.

### Code `/api` loads at runtime

Vercel runs the functions in `api/` under Node's own ESM loader (`package.json` is `"type": "module"`), not Vite — and that includes every `src` file they import, transitively (about a dozen `src` files today, e.g. `src/lib/purchaseHistory.ts`, `lowStockAlerts.ts`, `recognitionFailure.ts`). Each such file must:

- **End every relative import in `.js`** (`"./units.js"`, `"../_lib/userAiAccess.js"`; a directory is `"./dir/index.js"`). Node won't guess an extension, and `moduleResolution: "bundler"` means tsc won't complain — a missing one only shows up on Vercel as `ERR_MODULE_NOT_FOUND` (commit `bb55a2c`). Enforced by lint.
- **Import other `src` code relatively, never through `@/`** — Node doesn't know the alias. `import type` from `@/` is fine; it's erased. Enforced by lint.
- **Stay off `import.meta.env` and the DOM** — so never import `supabaseClient.ts` (take a `SupabaseClient<Database>` parameter instead, as `purchaseHistory.ts` does), and no `window`/`document`/`File`. Enforced by typecheck: `tsconfig.api.json` checks these files with Node types only.

Lint finds these files itself (`filesVercelLoads()` in `eslint.config.js` follows `api/`'s relative imports), so a new import from `api/` is covered as soon as it's written. Tests are exempt — vitest resolves both the alias and bare specifiers.

## Testing

This project is built TDD-first (see the `tdd` skill). Before adding tests for a new unit, confirm the seams (the public interfaces under test) with the user — don't assume. The established boundary-mocking convention is to mock `@/lib/supabaseClient`, never Supabase internals. Tests use Vitest + Testing Library; `src/test/setup.ts` handles jest-dom matchers and DOM cleanup between tests.

## Data model conventions

- Bilingual dynamic content (product names, store names) is stored as `_en`/`_zh` column pairs — `_en` is the OCR-recognized English source text (receipts are from New Zealand supermarkets), `_zh` is the AI translation. Fixed UI chrome is translated too (a hand-written dictionary in `src/lib/i18n.ts`, exposed via `LanguageProvider`'s `t()`), driven by the same toggle as the data content — no separate i18n framework.
- Category lives solely on `Product.category`, read via `product_id` — `ReceiptItem` does not have its own `category` column (see spec.md Section 5.2 for why).
- All user corrections (OCR fixes, translation fixes, category fixes) are recorded in `EditLog`.
- **Purchase history is fetched in exactly one place**: `fetchPurchaseHistories(client, productIds)` in `src/lib/purchaseHistory.ts`. Every price/consumption feature starts from it — price change (S10), price trend, store comparison (S11), consumption rate (S12), price-spike alerts (S13), and the monthly report's leaderboard (S14). It reads in batched, paged `.in("product_id", batch)` queries; a `for` loop around a `receipt_items` select is the N+1 this module exists to prevent. Its page size, `POSTGREST_PAGE_SIZE` (`src/lib/postgrestPaging.ts`), must stay ≤ PostgREST's max-rows, or a server-truncated page looks like the last one and the read silently stops early. The Supabase client is a parameter, not an import: passing `supabase` scopes the read to the caller's circle via RLS, passing `supabaseAdmin` (cron only) sweeps every circle — that choice *is* the scope decision, so keep it visible at the call site rather than behind a flag.
- `CONTEXT.md` is the project's domain glossary (Purchase, Purchase History, Circle, …). Read it before naming a new type, and add to it when a term gets settled — but keep it a glossary: no implementation details, no requirements.

## Coding standards

`CODING_STANDARDS.md` holds how code here is written: error handling (`errorMessage`, `UnexplainedError`, `AdvisedError`), UI styling (tokens, button classes, spacing, cards), and the judgement calls past reviews settled (one source per fact, types, names, tests, comments). Read it before writing a `catch`, a `throw` in `src/lib` or `/api`, any JSX or CSS, and before reviewing a diff.

## Claude API usage in this app (not this coding session)

The app's own backend (`api/receipts/recognize.ts`) calls the Anthropic API server-side to OCR + translate + suggest product matches in one call. Two constraints that must not be relaxed without the user's explicit say-so:

- Model is pinned to **Claude Haiku 4.5** (`claude-haiku-4-5`) for cost reasons.
- Spend is capped **per user** via `user_ai_access` (`api/_lib/userAiAccess.ts`), not a global cap — see spec.md Section 16 / issue 15 for the full model. A brand-new user gets **`FREE_TRIAL_LIMIT` (5) free successful recognition calls**; after that, calls are refused until a global admin grants a dollar credit (default $1) via the admin dashboard. Granting credit is always a **reset** (zeroes spend, sets a fresh cap), never a top-up. **No automatic reset or increase** — only a global admin's manual grant lifts a block. Don't build auto-reset/auto-raise logic even if it seems convenient. (The old global `ai_spend_limit` table is unused.)

Accounting is atomic in Postgres (issue 37): the recognize route calls `reserveCall` before Claude and gets back a `Reservation`, then calls exactly one of its `recordSpend` or `release` (hands the trial call back if Claude didn't answer). Await `release` before writing the error response, never after: Vercel may freeze the function once the response is sent. Each RPC is one row-locking `UPDATE`, so don't reintroduce a read-then-write in TypeScript. The dollar cap is only checked at reservation, so concurrent in-flight calls can overshoot it by their cost.

Failures the user should see in their own language go out as a code, not a sentence, and the page words them: a refused call is a 402 with the `{ code, … }` refusal from `src/lib/aiAccessRefusal.ts`, and a photo that can't be read as a receipt is a 422 with a `{ code }` from `src/lib/recognitionFailure.ts`.

## Admin dashboard (issue 15)

A single global admin (flagged via the `global_admins` table, currently just `nz.eason.chen@gmail.com`) can view every user across every circle, ban/unban accounts (Supabase Auth's own ban mechanism, not an app-level flag), grant AI credit, and merge several standalone-circle users into one shared circle — at `src/pages/AdminDashboard.tsx`, served from the non-obvious path in `ADMIN_DASHBOARD_PATH` (`src/lib/adminApi.ts`), guarded by `RequireGlobalAdmin` (404s for non-admins rather than redirecting to `/auth`, so the route's existence isn't revealed). Backend routes live under `api/admin/`, each re-checking `global_admins` server-side via `requireGlobalAdmin.ts` — never trust the frontend's own admin check for anything privileged.

**Circle merging, not invite links**: there's no invite-token flow (deliberately dropped, not deferred — the app is family-only/self-use). Signup still self-service-creates its own circle per account; an admin multi-selects standalone users in the dashboard and merges them into one new circle via `merge_users_into_new_circle` (a Postgres function, service-role-only, in `supabase/migrations/`), carrying products/receipts/alerts over atomically. That function refuses to merge a user out of an already-multi-member circle — products are circle-level, so a partial-circle merge would strand the circle's other member(s) without their data. `CircleSettings.tsx`'s own "Dissolve circle" is hidden behind a flag (`SHOW_DISSOLVE_CIRCLE`, code kept) now that circle consolidation is admin-driven, not something an owner should do unilaterally.

**Signup inserts without `.select()`**: `src/lib/auth.ts` generates the new circle's id client-side and inserts the circle and profile with no `.select()`. A brand-new user has no `profiles` row yet, so `circles`' SELECT policy hides the new row, and the `INSERT ... RETURNING` that `.select()` adds fails as an RLS violation. Repro trail: issue 15's "Post-launch amendments".

## Supabase

Project `xflabzrcowhqjvvwjrbt` (`Eason's Project`, `ap-southeast-2`). Local migration copies live in `supabase/migrations/` and mirror what's applied live — apply new migrations through the Supabase MCP tools, then save a matching copy there. See `README.md` for env var setup and what's not yet implemented.

Both clients are typed: `createClient<Database>` in `src/lib/supabaseClient.ts` and `api/_lib/supabaseAdmin.ts`, from `src/types/database.types.ts`. That file is **hand-derived from the migrations**, not generated — the Supabase CLI isn't wired up — so **a migration that changes a column must update it in the same commit**, or every query silently goes back to `any`. Two things about it that aren't `gen types` output and must survive any future regeneration: the FK `Relationships` entries (without them supabase-js infers to-one embeds as arrays), and the literal-union narrowing on `profiles.role` / `receipts.status` / `alerts.type`, which Postgres enforces by CHECK constraint but `gen types` only narrows for real enums.

Pass `SupabaseClient<Database>`, never bare `SupabaseClient`, when a module takes its client as a parameter — the bare type defaults to an `any` schema and silently opts that module out of all of the above.

For a row shape, reach for `Database["public"]["Tables"][...]["Row"]` rather than a hand-written interface; `src/types/index.ts` holds only `Role` and `CATEGORIES`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<effort>/` (currently just `.scratch/grocery-receipt-tracker/`), and those files are canonical. Each is mirrored to a GitHub issue, linked from the file's own `GitHub: #NN` header line — **the two numbers differ, by no fixed amount** (issues and PRs share one number sequence, so every merged PR widens the gap), so never cite a GitHub number as if it were the local one, and never compute one from the other — read the header line. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one `CONTEXT.md` + `docs/adr/` at the repo root, created lazily as decisions get resolved). See `docs/agents/domain.md`.
