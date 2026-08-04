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

- Bilingual dynamic content (product names, store names) is stored as `_en`/`_zh` column pairs — `_en` is the OCR-recognized English source text (receipts are from New Zealand supermarkets), `_zh` is the AI translation. Fixed UI chrome is English-only; no i18n framework.
- Category lives solely on `Product.category`, read via `product_id` — `ReceiptItem` does not have its own `category` column (see spec.md Section 5.2 for why).
- All user corrections (OCR fixes, translation fixes, category fixes) are recorded in `EditLog`.

## Claude API usage in this app (not this coding session)

The app's own backend (`api/receipts/recognize.ts`) calls the Anthropic API server-side to OCR + translate + suggest product matches in one call. Two constraints that must not be relaxed without the user's explicit say-so:

- Model is pinned to **Claude Haiku 4.5** (`claude-haiku-4-5`) for cost reasons.
- Spend is capped by `ai_spend_limit`, a **global, hard, dollar-denominated cap (default $1)** — not per-user, not per-call-count. Once hit, calls must be refused outright. **No automatic reset or increase** — only a circle owner manually raising `cap_usd` lifts it. Don't build auto-reset/auto-raise logic even if it seems convenient.

## Supabase

Project `xflabzrcowhqjvvwjrbt` (`Eason's Project`, `ap-southeast-2`). Local migration copies live in `supabase/migrations/` and mirror what's applied live — apply new migrations through the Supabase MCP tools, then save a matching copy there. See `README.md` for env var setup and what's not yet implemented.
