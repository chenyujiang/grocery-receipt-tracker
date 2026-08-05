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
- Spend is capped by `ai_spend_limit`, a **global, hard, dollar-denominated cap (default $1)** — not per-user, not per-call-count. Once hit, calls must be refused outright. **No automatic reset or increase** — only a circle owner manually raising `cap_usd` lifts it. Don't build auto-reset/auto-raise logic even if it seems convenient.

## Supabase

Project `xflabzrcowhqjvvwjrbt` (`Eason's Project`, `ap-southeast-2`). Local migration copies live in `supabase/migrations/` and mirror what's applied live — apply new migrations through the Supabase MCP tools, then save a matching copy there. See `README.md` for env var setup and what's not yet implemented.
