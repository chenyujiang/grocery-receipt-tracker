# Grocery Receipt Tracker

家庭超市小票记账与价格追踪 App。完整需求文档见 `.scratch/grocery-receipt-tracker/spec.md`（或排版好的 `spec.html`）。

Full requirements are in `.scratch/grocery-receipt-tracker/spec.md` (or the formatted `spec.html`).

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

Schema (`supabase/migrations/`) mirrors spec.md Section 5: `circles`, `profiles`, `categories` (seeded with the 9 fixed categories), `products`, `receipts`, `receipt_items`, `edit_logs`. RLS is enabled on every table — members can see everything in their circle, but can only edit/delete rows they uploaded themselves (Sections 2, 4). The `receipts` storage bucket is private, path-scoped by `circle_id`.

Not yet handled: the invite-link "join an existing circle" flow (ticket 02 deferred its exact mechanism to development) — right now the schema only supports the self-service "sign up → become owner of a new circle" path via RLS. Joining via invite will need a service-role server function once the token mechanism is designed.

## Status

Scaffolding + Supabase schema are in place — routes, types, and page shells match the spec's structure (Section 15), and the database/RLS match Section 5. The actual OCR/translation call, product matching, price/consumption calculations, and alert logic are not implemented yet (see the `TODO`s in `api/`).
