# Grocery Receipt Tracker

A family-shared web app for photographing grocery receipts and tracking spending/unit-price trends. Full requirements are in `.scratch/grocery-receipt-tracker/spec.md` (or the formatted `spec.html`); the Chinese translation is `spec_zh.md`.

## Stack

React + TypeScript + Vite, deployed on Vercel. Backend logic lives in `/api` as Vercel Serverless Functions. Supabase provides the database, auth, and storage.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Claude values (see below)
npm run dev
```

## Supabase

Project: **Eason's Project** (`xflabzrcowhqjvvwjrbt`, `ap-southeast-2`) in the `Eason Chen` org — reused from an existing paused project rather than a new one, since the free tier caps active projects at 2. `eason-crm-demo` was paused to make room; unpause it from the Supabase dashboard if you need it back (that'll require pausing this project or upgrading the org's plan first).

`.env.local` already has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` filled in (safe to expose client-side). You still need to fill in yourself, from the Supabase dashboard → Settings → API:

- `SUPABASE_SERVICE_ROLE_KEY` — used only inside `/api`, never sent to the client.
- `CLAUDE_API_KEY` — from the Anthropic console, also server-side only.

Schema (`supabase/migrations/`) mirrors spec.md Section 5: `circles`, `profiles` (including `display_name`, shown for the receipt list's uploader filter and Circle Settings), `categories` (seeded with the 9 fixed categories), `products`, `receipts`, `receipt_items`, `edit_logs`, `alerts` (shared table for price-spike and low-stock alerts), and `ai_spend_limit`. RLS is enabled on every table — members can see everything in their circle, but can only edit/delete rows they uploaded themselves (Sections 2, 4). The `receipts` storage bucket is private, path-scoped by `circle_id`.

`ai_spend_limit` is a singleton row tracking cumulative Claude API spend against a **global hard cap (default $1)**. It's not per-user or per-call-count: `api/receipts/recognize.ts` checks it before every OCR call and refuses (402) once `spent_usd` reaches `cap_usd`, until a circle owner manually raises `cap_usd` — nothing resets it automatically. Model choice is **Claude Haiku 4.5** (`claude-haiku-4-5`), picked for cost — structured extraction doesn't need Opus/Sonnet-tier pricing.

Not yet handled — both need an email-sending service (Supabase's built-in option or Resend) the project doesn't have configured yet:

- The invite-link "join an existing circle" flow (spec.md Section 4) — the schema only supports the self-service "sign up → become owner of a new circle" path via RLS. Joining via invite will need a service-role server function once the token mechanism is designed.
- Emailing price-spike/low-stock alerts — they're already detected and shown in-app (Notifications page), just not sent anywhere.

## Status

The app is functionally complete against spec.md, short of the two email-dependent items above. In place: the full receipt upload → AI OCR/translation/categorization → duplicate check → preview/confirm flow (with EditLog tracking every corrected field); all pages from Section 15 wired to real data (Home, Receipts — with per-row delete that also cleans up the stored image, and a read-only detail view for `confirmed` receipts — Product Detail with its price-trend chart/store comparison/consumption estimate, Monthly Report with CSV export, Notifications, Circle Settings' member management, and the upload/review flow); price-spike and low-stock alerts (the latter via a daily Vercel Cron job); and the Section 7 bilingual toggle, amended post-launch to translate fixed UI chrome as well as dynamic content. Every date-range picker (receipt list filters, CSV export range) uses the same custom year-then-month popover, month-level rather than day-precise. A real visual design pass (palette, type, card-based lists, the bottom nav) replaced the original unstyled scaffolding.
