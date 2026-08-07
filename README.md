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

Schema (`supabase/migrations/`) mirrors spec.md Section 5: `circles`, `profiles` (including `display_name`, shown for the receipt list's uploader filter and Circle Settings), `categories` (seeded with the fixed category list, refined post-launch into finer food subcategories — see spec.md Section 9), `products`, `receipts`, `receipt_items`, `edit_logs`, `alerts` (shared table for price-spike and low-stock alerts), `global_admins`, and `user_ai_access` (Section 16). RLS is enabled on every table — members can see everything in their circle, but can only edit/delete rows they uploaded themselves (Sections 2, 4). The `receipts` storage bucket is private, path-scoped by `circle_id`. The old `ai_spend_limit` singleton table is still present but unused (superseded by `user_ai_access`), kept only for a possible later cleanup migration.

`user_ai_access` tracks Claude API access **per user**, not globally: a brand-new user gets exactly one free successful recognition call (count-based), then needs a global admin to grant them a real dollar-based credit (default $1, or custom) via the admin dashboard — granting is always a reset (zeroes spend, sets a fresh cap), never a top-up. `api/receipts/recognize.ts` checks this before every OCR call and refuses (402) once a user is over their allowance; nothing resets it automatically. Model choice is **Claude Haiku 4.5** (`claude-haiku-4-5`), picked for cost — structured extraction doesn't need Opus/Sonnet-tier pricing.

The admin dashboard (Section 16) lives at the non-obvious path in `ADMIN_DASHBOARD_PATH` (`src/lib/adminApi.ts`), reachable only by the account flagged in `global_admins` (currently just `nz.eason.chen@gmail.com`) — everyone else gets a 404, not a login redirect. From there, the admin can see every user across every circle, ban/unban accounts (Supabase Auth's own ban mechanism), grant AI credit, and merge several standalone-circle users into one shared circle (`merge_users_into_new_circle`, a Postgres function callable only by the service role — see below for why this replaced invite links).

Not yet handled — needs an email-sending service (Supabase's built-in option or Resend) the project doesn't have configured yet:

- Emailing price-spike/low-stock alerts — they're already detected and shown in-app (Notifications page), just not sent anywhere.

Deliberately dropped, not deferred: the invite-link "join an existing circle" flow (spec.md Section 4). The app turned out to be family-only/self-use, so instead of building an invite-token mechanism, circle consolidation became admin-driven — every signup still self-service-creates its own circle via RLS, and a global admin merges standalone circles together from the dashboard (multi-select users → one new circle, their products/receipts/alerts carried over atomically). The merge function guards against merging a user out of an already-multi-member circle, since products are circle-level and that would strand the circle's other member(s) without their data.

## Status

The app is functionally complete against spec.md, short of the email-alerting item above. In place: the full receipt upload → AI OCR/translation/categorization → duplicate check → preview/confirm flow (with EditLog tracking every corrected field, and the recognition prompt telling Claude a promotional item is still the same product as its regular-price counterpart, so it matches the same standardized Product/category instead of splitting off); all pages from Section 15 wired to real data (Home, Receipts — sorted newest-first with an upload-time tiebreak for same-day receipts, with per-row delete that also cleans up the stored image, and a detail view for `confirmed` receipts that its own uploader can also edit inline (name/quantity/unit price/promotion/purchase date/weight-volume spec, ticket 16) — both the detail and review screens now also show an item's weight/volume spec (e.g. "2L") next to its price, not just in the edit form — Product Detail with its price-trend chart/store comparison/consumption estimate, Monthly Report, Notifications, Circle Settings' member management (Dissolve circle is hidden behind a flag now that circle consolidation is admin-driven, see above), and the upload/review flow); price-spike and low-stock alerts (the latter via a daily Vercel Cron job); and the Section 7 bilingual toggle, amended post-launch to translate fixed UI chrome as well as dynamic content. Every date-range picker (receipt list filters, CSV export range, and the confirmed-receipt purchase-date editor) uses the same custom year→month→day popover, day-precise — briefly month-only for consistency, then amended post-launch back to day precision once that proved awkward for editing an exact purchase date, gaining a year-grid step (jump straight to a distant year) along the way. The monthly report's own month nav stays month-only (browsing "which month" is inherently monthly) but got the same icon-only redesign — no Previous/Next text buttons, just the calendar icon and its popover, which also gained the year-grid plus a "Today" button that appears whenever viewing a past month. The report's category breakdown expands into a per-product list (boxed in a fieldset when open, the category button itself highlighted), each product showing a red "Saved $X" badge summing its promotional savings that month — informational only, since spend totals already reflect what was actually paid, never a separate negative line. CSV export itself is currently hidden behind a flag (`SHOW_EXPORT_CSV` in `MonthlyReport.tsx`) pending a product decision, code kept intact. The Section 9 category taxonomy was refined post-launch into finer food subcategories (see Supabase section above). A real visual design pass (palette, type, card-based lists, the bottom nav, green "price pill" highlights on Home) replaced the original unstyled scaffolding. The Section 16 admin dashboard (per-user AI credit, ban/unban, circle merge) is also built and live.
