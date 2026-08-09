# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## What this is

A family-shared web app: photograph grocery receipts, AI (OCR + translation + categorization) extracts line items, the app tracks unit-price changes, consumption rate, and multi-store price comparison. Full requirements: `.scratch/grocery-receipt-tracker/spec.md` (English) / `spec_zh.md` (Chinese) — read the relevant section before implementing a feature rather than re-deriving behavior from scratch. The planning history (why each decision was made) is in `.scratch/grocery-receipt-tracker/map.md` and `issues/NN-*.md`.

## Doc language convention

Every planning doc under `.scratch/grocery-receipt-tracker/` and this repo's `README.md` exists as an English original (unsuffixed filename) and a Chinese translation (`_zh` suffix, e.g. `spec_zh.md`, `README_zh.md`). Keep both in sync when editing either — don't let content drift between them. This is a documentation-only convention; it's unrelated to the app's own bilingual data fields (see below).

## Stack

React + TypeScript + Vite (frontend), Vercel Serverless Functions in `/api` (backend), Supabase (Postgres + Auth + Storage). Path alias `@` → `src`.

Commands: `npm run dev`, `npm run build`, `npm run typecheck`, `npm test` (vitest run).

## Testing

This project is built TDD-first (see the `tdd` skill). Before adding tests for a new unit, confirm the seams (the public interfaces under test) with the user — don't assume. The established boundary-mocking convention is to mock `@/lib/supabaseClient`, never Supabase internals. Tests use Vitest + Testing Library; `src/test/setup.ts` handles jest-dom matchers and DOM cleanup between tests.

## Data model conventions

- Bilingual dynamic content (product names, store names) is stored as `_en`/`_zh` column pairs — `_en` is the OCR-recognized English source text (receipts are from New Zealand supermarkets), `_zh` is the AI translation. Fixed UI chrome is translated too (a hand-written dictionary in `src/lib/i18n.ts`, exposed via `LanguageProvider`'s `t()`), driven by the same toggle as the data content — no separate i18n framework.
- Category lives solely on `Product.category`, read via `product_id` — `ReceiptItem` does not have its own `category` column (see spec.md Section 5.2 for why).
- All user corrections (OCR fixes, translation fixes, category fixes) are recorded in `EditLog`.

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

## Claude API usage in this app (not this coding session)

The app's own backend (`api/receipts/recognize.ts`) calls the Anthropic API server-side to OCR + translate + suggest product matches in one call. Two constraints that must not be relaxed without the user's explicit say-so:

- Model is pinned to **Claude Haiku 4.5** (`claude-haiku-4-5`) for cost reasons.
- Spend is capped **per user** via `user_ai_access` (`api/_lib/userAiAccess.ts`), not a global cap — see spec.md Section 16 / issue 15 for the full model. A brand-new user gets **`FREE_TRIAL_LIMIT` (5) free successful recognition calls** (count-based, `free_trial_calls_used`); once exhausted, further calls are refused until a global admin grants them a real dollar-based credit (default $1, or a custom amount) via the admin dashboard. The signup flow tells the user about this allowance right after they register (`src/pages/Home.tsx`'s one-time welcome banner, driven by `justSignedUp` router state set in `src/pages/Auth.tsx`). Granting credit is always a **reset** (zeroes spend, sets a fresh cap), never a top-up. **No automatic reset or increase** — only a global admin's manual grant lifts a block. Don't build auto-reset/auto-raise logic even if it seems convenient. The old singleton `ai_spend_limit` table/global cap is superseded and unused, left in place only for a possible later cleanup migration.

## Admin dashboard (issue 15)

A single global admin (flagged via the `global_admins` table, currently just `nz.eason.chen@gmail.com`) can view every user across every circle, ban/unban accounts (Supabase Auth's own ban mechanism, not an app-level flag), grant AI credit, and merge several standalone-circle users into one shared circle — at `src/pages/AdminDashboard.tsx`, served from the non-obvious path in `ADMIN_DASHBOARD_PATH` (`src/lib/adminApi.ts`), guarded by `RequireGlobalAdmin` (404s for non-admins rather than redirecting to `/auth`, so the route's existence isn't revealed). A global admin is redirected there once, immediately after login, and can also get back in later via a persistent "Go to admin dashboard" link on Circle Settings (same `isGlobalAdmin` check). Backend routes live under `api/admin/`, each re-checking `global_admins` server-side via `requireGlobalAdmin.ts` — never trust the frontend's own admin check for anything privileged.

**Circle merging, not invite links**: there's no invite-token flow (deliberately dropped, not deferred — the app is family-only/self-use). Signup still self-service-creates its own circle per account; an admin multi-selects standalone users in the dashboard and merges them into one new circle via `merge_users_into_new_circle` (a Postgres function, service-role-only, in `supabase/migrations/`), carrying products/receipts/alerts over atomically. That function refuses to merge a user out of an already-multi-member circle — products are circle-level, so a partial-circle merge would strand the circle's other member(s) without their data. `CircleSettings.tsx`'s own "Dissolve circle" is hidden behind a flag (`SHOW_DISSOLVE_CIRCLE`, code kept) now that circle consolidation is admin-driven, not something an owner should do unilaterally.

**Fixed (was: known open bug)**: new-account signup used to fail to auto-create its circle/profile — not actually an intermittent timing race as first suspected, but a 100%-reproducible RLS bug (confirmed with `SET ROLE authenticated` directly in SQL, no client involved): `circles`' own SELECT policy (`id = current_circle_id()`) can't resolve for a brand-new user with no `profiles` row yet, so the `INSERT ... RETURNING` that `.insert().select()` generates has no visible row to return and Postgres reports the whole statement as an RLS violation — even though the INSERT's own `with_check(true)` would have allowed it. Fixed in `src/lib/auth.ts` (`signUpWithEmail`/`ensureProfile`) by generating the circle's id client-side and dropping `.select()` from both inserts, so the RETURNING-visibility check is never triggered. See issue 15's "Post-launch amendments" for the full repro trail.

## Supabase

Project `xflabzrcowhqjvvwjrbt` (`Eason's Project`, `ap-southeast-2`). Local migration copies live in `supabase/migrations/` and mirror what's applied live — apply new migrations through the Supabase MCP tools, then save a matching copy there. See `README.md` for env var setup and what's not yet implemented.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<effort>/` (currently just `.scratch/grocery-receipt-tracker/`) — no GitHub Issues in use, despite the GitHub remote. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one `CONTEXT.md` + `docs/adr/` at the repo root, created lazily as decisions get resolved). See `docs/agents/domain.md`.
