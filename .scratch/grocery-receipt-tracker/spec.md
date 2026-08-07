# Grocery Receipt Tracking & Price Monitoring App — Product Requirements Document

This document consolidates the decisions from all 14 resolved tickets in the `wayfinder` planning map (`map.md`) into a complete requirements specification, ready to hand off to development.

## 1. Overview

This is a web application for shared use by a family (and potentially friend groups in the future): users photograph grocery receipts, AI automatically recognizes the line items and renders them bilingually in Chinese and English, and the app tracks each product's unit-price changes and consumption rate, proactively alerting when a price spikes or stock is running low.

The user is based in New Zealand, so receipts are originally in English (from supermarkets such as Countdown, New World, and PAK'nSAVE); the app automatically translates the recognized English content into Chinese.

## 2. Scope

### 2.1 In scope

- Photograph/select and upload a receipt, with AI recognition + Chinese/English translation (Section 6).
- A family/circle account-sharing system (Section 4).
- Automatic product categorization and matching (Sections 8, 9).
- Monthly unit-price change comparison and hidden price-hike detection (Section 10).
- Multi-store price comparison (Section 11).
- Consumption-rate analysis and low-stock alerts (Section 12).
- Price-spike alerts (Section 13).
- Data export (CSV) and a monthly report page (Section 14).

### 2.2 Future roadmap (not in this round)

- A native/cross-platform mobile app (the web version ships first to validate the concept).
- App-level native push notifications (this round uses "in-app display + email" instead).
- Per-product/category custom alert thresholds and mute functionality.

### 2.3 Explicitly out of scope

- Pixel-level visual design (fonts, spacing, component styling) — this document defines page structure and information architecture; exact visual presentation is left for implementation or a later prototyping pass.

## 3. Tech Stack & Architecture

- **Frontend**: React.js + TypeScript, a mobile-first responsive web app, deployed on Vercel.
- **Backend**: Node.js, running as Vercel Serverless Functions, handling AI call proxying, business logic, and scheduled jobs.
- **Database/Auth/Storage**: Supabase (Postgres database + Supabase Auth email login + Supabase Storage for objects).
- **Version control**: GitHub.
- **AI model**: the Anthropic Claude API's multimodal model, specifically **Claude Haiku 4.5** (`claude-haiku-4-5`), used for receipt OCR, Chinese/English translation, and product-match suggestions — all performed within the same backend call. Structured-extraction tasks don't need the most expensive model; Haiku 4.5 costs roughly 1/5 of Opus 5, with an upgrade to Sonnet/Opus to be evaluated later only if recognition quality falls short.

### 3.1 Security & cost control

- AI calls must be proxied through a backend Serverless Function; the Claude API key lives only in backend environment variables and never appears in frontend code or browser network requests.
- **Call quota is per-user, not a single global cap** (**amended, see Section 16**): each user has their own dollar cap and spend counter, accumulated from each call's `usage.input_tokens`/`usage.output_tokens` × Haiku 4.5 pricing; once a user's cap is reached, their recognition requests are refused outright, with no effect on any other user. There is no overarching global ceiling. New, never-reviewed users get a one-time free trial capped by *count* (one successful call), not by dollar amount — see Section 16 for the full admin/credit model.
- Original receipt images are stored in a private Supabase Storage bucket with no public URL; when the frontend needs to display an image, the backend generates a short-lived signed URL, obtainable only by circle members.

### 3.2 End-to-end data flow

1. The user uploads/photographs a receipt image on the web page; the frontend sends the image to a backend API route.
2. The backend stores the image in the private Supabase Storage bucket and calls the Claude API to perform OCR recognition and Chinese/English translation, producing a structured draft.
3. The backend matches the recognized product's English text against the circle's existing standardized-product list, generating a match suggestion included in the same draft.
4. The draft is saved with `status = pending_review`; once the user reviews and confirms/corrects each line, the status updates to `confirmed` and it counts toward statistics.
5. Once a receipt is confirmed, the backend immediately runs the price-spike check (Section 13); a separate daily scheduled job scans all products' stock status (Section 12).

## 4. Accounts & Sharing

- **Login method**: Supabase Auth's built-in email login.
- **Account-to-circle relationship**: one account belongs to exactly one "Circle" — a circle is created automatically at signup, or joined via someone else's invite link. This is a simplified model: a family is one circle, and friends using the app independently in the future form their own separate, unrelated circles.
- **Circle size**: a default cap of 10 members (adjustable later).
- **Permission tiers**:
  - **owner**: the person who created the circle; can invite/remove members and dissolve the circle; like members, can only edit/delete records they uploaded themselves.
  - **member**: can only add records, and can only edit/delete records they uploaded themselves — never anyone else's.
  - All members (regardless of role) can **view** all of the circle's records, reports, and alerts.
- **Invite method**: emailed invite links, requiring an email-sending service (e.g. Supabase's built-in option or Resend).
- **Duplicate-receipt prevention**: new receipts are auto-checked for suspected duplicates by matching store + date + total amount; when detected, the user confirms either "yes, duplicate, don't import" or "not a duplicate, continue."
- **Buyer field**: each record's `uploaded_by` is automatically set to the current login email, requiring no extra input, and enables per-person spending statistics.

## 5. Data Model

### 5.0 Circle & User Profile

**Circle**

| Field | Description |
|---|---|
| `id` | Primary key |
| `name` | Circle name (optional, e.g. "Our Family") |
| `max_members` | Member cap, default 10 |
| `created_at` | Created timestamp |

**Profile** (one-to-one with Supabase Auth's `auth.users`)

| Field | Description |
|---|---|
| `user_id` | = `auth.users.id` |
| `circle_id` | The circle this user belongs to |
| `role` | `owner` / `member` |

Since "one account belongs to exactly one circle" (Section 4), circle membership and role are stored directly on the user profile table — no many-to-many membership table is needed.

The concrete implementation of invite links (token generation, expiry, etc.) is left for development to design and isn't expanded on in this document.

### 5.1 Receipt

| Field | Description |
|---|---|
| `id` | Primary key |
| `circle_id` | Which circle this belongs to |
| `uploaded_by` | Uploader's login email |
| `store_name_en` | Store name, OCR-recognized English source text |
| `store_name_zh` | Store name, Chinese translation |
| `purchase_date` | Purchase date |
| `total_amount` | Receipt total |
| `original_image_url` | Original image address (cleared after retention period) |
| `uploaded_at` | Upload timestamp |
| `status` | `pending_review` / `confirmed` |

Original images are stored in Supabase Storage and auto-deleted after 12 months by default (only the images are cleared; structured data is kept forever).

### 5.2 ReceiptItem

| Field | Description |
|---|---|
| `id`, `receipt_id` | Primary key, linked receipt |
| `raw_name_en` | AI-recognized product name, English source text |
| `raw_name_zh` | Product name, Chinese translation |
| `product_id` | Linked standardized product (see 5.3) |
| `quantity` | Quantity |
| `unit_spec_value` / `unit_spec_unit` | Spec value + unit (e.g. 500 / g) |
| `unit_price` | Actual transacted unit price |
| `original_price` | Original price (nullable, filled only when a struck-through/promo price is recognized) |
| `is_promotion` | Boolean, whether it's a promotional price |
| `subtotal` | Line subtotal |

`raw_name_en`/`raw_name_zh` record "the raw text recognized this time," while `product_id` records "which standardized product this line is judged to belong to" — the two serve different purposes.

**Note**: `ReceiptItem` does not store its own `category` field — categorization is owned entirely by `Product` (see 5.3) and read via `product_id`, avoiding a situation where the same product's category is duplicated across multiple `ReceiptItem` rows and drifts out of sync when corrected later. The preview/confirm screen can still let a user edit the category shown for a given line, but what's saved is its matched `Product.category`, not a separate copy on the `ReceiptItem`.

### 5.3 Product (standardized product, a per-circle concept)

| Field | Description |
|---|---|
| `id`, `circle_id` | Primary key, owning circle (a per-circle concept) |
| `canonical_name_en` / `canonical_name_zh` | Standardized product name once confirmed, bilingual |
| `category` | Category, the single place it's stored (see Section 9) |
| `low_stock_alert_active` | Boolean, whether currently in an "already alerted, not yet recovered" state (see Section 12) |
| `created_at` | Created timestamp |

Different purchase records under the same standardized product can have different specs (`unit_spec_value`/`unit_spec_unit`) — this is precisely the data foundation for hidden price-hike detection and consumption-rate calculation.

### 5.4 EditLog

| Field | Description |
|---|---|
| `id` | Primary key |
| `receipt_id` / `receipt_item_id` | Linked record |
| `field_name`, `old_value`, `new_value` | Which field changed, old and new values |
| `edited_by`, `edited_at` | Editor, timestamp |

All user edits (correcting English OCR errors, fixing Chinese translations, correcting categories, etc.) are recorded in this table.

## 6. Receipt Upload & Recognition Flow

**Upload method**: the web app uses a standard `<input type="file" accept="image/*">` control, deliberately *without* a `capture` attribute — setting `capture` makes most mobile browsers jump straight into the camera and skip the OS chooser, which is exactly what would hide "choose from library." Left off, mobile browsers offer both "take photo" and "choose from library," with no need to build a custom camera UI.

**Processing flow**:

1. Upon upload, the Claude API is immediately called to perform OCR, translation, and product-match suggestion, producing a `status = pending_review` draft.
2. The user reviews and corrects each field line by line on a preview screen (product name, quantity, spec, unit price, category, matched standardized product).
3. Once confirmed, the status becomes `confirmed`, it counts toward statistics, and triggers the price-spike check (Section 13).

There's no separate "low confidence" flag — the review/confirm step itself is the safety net for recognition errors.

## 7. Bilingual Content Strategy

- **Scope**: dynamic data content (product names, store names, category labels) is bilingual by design. **Amended from the original English-only-chrome decision**: fixed UI chrome (menus, buttons, labels) is fully translated too, via a hand-written EN/ZH string dictionary (`src/lib/i18n.ts`) rather than a full i18n framework — an English-only shell felt inconsistent once real screens showed translated data next to it.
- **Direction**: receipt text is originally English; `_en` fields hold the authentic OCR source text, while `_zh` fields hold the Chinese translation produced by that same Claude API call.
- **Storage**: bilingual fields are split into two columns (e.g. `name_zh` / `name_en`), not packed into a JSON field.
- **Corrections**: OCR errors in `_en` go through the standard preview/EditLog flow; if a user finds the `_zh` translation inaccurate, they can edit it manually, likewise recorded in EditLog.
- **UI display**: a single language toggle (a switch on the circle settings page) controls both the dynamic content's displayed language and the UI chrome's language together — not two independent toggles.

## 8. Product Matching

**Matching method**: within the same call that recognizes the receipt (or immediately after), the AI compares the newly recognized `raw_name_en` against the circle's existing Product list via semantic similarity, producing a match suggestion; the user confirms or changes it directly within the preview/confirm flow, with no extra steps added.

**Matching basis**: primarily based on `raw_name_en` (the English source text); `raw_name_zh` (the Chinese translation) doesn't factor into matching.

**Spec changes**: don't affect the matching decision — different purchase records under the same standardized product can have different specs; spec is just an attribute of each `ReceiptItem`.

**Barcodes**: not handled. New Zealand supermarket receipts typically don't print barcodes, so no field is reserved for this.

## 9. Category Taxonomy

- **Levels**: two (top-level category + subcategory), a system-fixed preset shared by all circles; circles cannot add their own custom categories.
- **AI categorization scope**: can only pick the best-matching subcategory from the preset list, never invent new categories.
- **Category-memory mechanism**: once a user corrects a product's category, that correction is remembered; the same `product_id` is auto-assigned the corrected category next time (keyed by `product_id`, not raw text, since different wordings of the raw text all resolve to the same standardized product).
- **Initial value source**: when a new line item is recognized, if it matches an existing `Product` in the circle (Section 8), its category is simply that `Product.category` (existing category memory applies); only when there's no match and a new `Product` is created does the AI's category suggestion from that same recognition call become the new `Product.category`'s initial value.

**Initial category list**:

| Top-level category |
|---|
| Food - Grains & Oil |
| Food - Fresh Produce |
| Food - Dairy & Bakery |
| Food - Snacks & Beverages |
| Household - Cleaning |
| Household - Personal Care |
| Baby & Maternity |
| Pet Supplies |
| Other / Uncategorized |

Exact subcategories are left for development to fine-tune; the English names are the taxonomy's original definition, with Chinese as the translation.

**Amended post-launch**: the two catch-all food categories turned out too coarse once real receipts accumulated — `Food - Fresh Produce` mixed fruit, vegetables, and meat together, and `Food - Snacks & Beverages` mixed snacks, drinks, condiments, and frozen food. Split into:

| Top-level category |
|---|
| Food - Grains & Oil |
| Food - Fruits |
| Food - Vegetables |
| Food - Meat & Seafood |
| Food - Dairy & Bakery |
| Food - Frozen |
| Food - Snacks |
| Food - Beverages |
| Household - Cleaning |
| Household - Personal Care |
| Baby & Maternity |
| Pet Supplies |
| Other / Uncategorized |

`Food - Meat & Seafood` and `Food - Frozen` are new, not just splits of an existing category — added because real products didn't fit the fruit/vegetable/snack/beverage split otherwise. Existing `Product` rows in the removed categories were hand-reclassified by name (see `supabase/migrations/20260807000003_refine_food_categories.sql`) since there's still no category-edit UI (Section 15 doesn't expose one) to do it any other way.

## 10. Price-Change Calculation & Display

**Comparison baseline**: against the last purchase price (not a historical average).

**Promotion filtering**: rows with `is_promotion = true` are excluded; both the baseline and current price are taken from normal-price records only. If the most recent purchase was promotional, the calculation looks further back for the nearest non-promotional record, avoiding a false spike when a promo price reverts to normal.

**Unit conversion**:

- Weight units (g/kg) are normalized to price per 100g; volume units (ml/L) to price per 100ml; count-based units (each/pack) are compared directly by `unit_price`.
- The conversion table (e.g. kg→1000g, L→1000ml) is maintained during development, as an implementation detail.

**Formula**: `change % = (this purchase's normalized unit price − baseline's normalized unit price) / baseline's normalized unit price × 100%`.

**Display**:

- Price-change leaderboard: this month's biggest price increases, grouped by `product_id`.
- Per-product price trend chart: a line chart of a standardized product's normalized unit price over time, with promotional records marked using a distinct style (e.g. hollow dots).
- Color coding: increases in red, decreases in green.

## 11. Multi-Store Price Comparison

`Product` is scoped per circle, not per store, and `ReceiptItem` links to `Receipt.store_name` via `receipt_id` — so a single `product_id` can naturally span multiple stores; the data structure already supports cross-store comparison.

- **Comparison basis**: reuses the rules from Section 10 — promotional rows excluded, comparing only each store's latest normal price, without introducing "lowest price" or "average price."
- **Unit conversion**: also reuses the rules from Section 10, ensuring cross-store comparisons use the same basis.
- **Display location**: a module on the product detail page, next to the price trend chart — not a standalone page.
- **Insufficient data**: if only bought at one store so far, no comparison is shown — it displays "no purchase records from other stores yet."

## 12. Consumption Rate & Low-Stock Alerts

**Calculation window**: for a given `product_id`, take the most recent 5 purchases (or all available if fewer) as a sliding window; average daily consumption = total quantity in the window (converted to base units) ÷ total days spanned. This way stockpiling doesn't distort the estimate. If multiple `ReceiptItem` rows for the same `product_id` fall on the same day (e.g. two differently-sized bottles bought in one trip), they're treated as a single "purchase" and their quantities summed.

**Insufficient data**: fewer than 3 accumulated purchases means no estimate or alert — it shows "not enough data yet."

**Trigger condition**:

- Estimated current remaining stock = most recent purchase quantity (base units) − average daily consumption × (days since the most recent purchase).
- Estimated days remaining = estimated current remaining stock ÷ average daily consumption; a reminder triggers when this drops below 5 days (default threshold).

**Check mechanism**: unlike price alerts, this doesn't hang off the "receipt confirmed" event — instead, a daily scheduled job (Vercel Cron / Supabase pg_cron) scans all products.

**Reminder frequency**: the `Product.low_stock_alert_active` flag ensures only one reminder per episode, resetting only once the user buys more and days remaining recovers above the threshold, avoiding repeated daily nagging.

**Automation**: fully derived from purchase records, with no manual "mark as used up" input; the UI clearly labels these as "estimated" figures, not exact inventory counts.

## 13. Price-Spike Alerts

- **Threshold**: a fixed percentage — triggers above a 15% increase (a default, adjustable later).
- **Check timing**: immediately after each receipt is confirmed, the price-change calculation from Section 10 runs for the products on it.
- **Audience**: all members of the circle, not filtered by historical buyer.
- **In-app display**: a notification list; each entry shows the product name (bilingual), the new price, the percentage increase, and a link to that product's price trend chart.
- **Email notification**: batched per receipt (multiple triggered products on the same receipt combined into one email), not sent individually.
- **Muting**: per-product muting is not supported for now.

## 14. Data Export & Monthly Report

**Monthly report page**: a standalone page, selectable by month (with the ability to browse past months), summarizing:

- This month's total spend and its change vs. last month.
- Spending breakdown by category.
- The price-change leaderboard (reusing Section 10's logic as a section on this page).
- The number of price-spike/low-stock alerts triggered this month.
- Spending distribution by uploader, and the total receipts/line items uploaded this month.

**Data export**:

- Format: CSV.
- Content: line-by-line detail, with each `ReceiptItem` expanded into one row (product name, category, quantity, spec, unit price, store, date, uploader); nothing pre-aggregated.
- Scope: the whole circle's data, with a selectable date range (from date → to date, via the same year→month→day picker used elsewhere — **amended from an arbitrary day-level custom range** to a month-only picker for consistency, **then amended again post-launch** back to day precision; see Section 15).
- Entry point: an export button on the monthly report page, with no separate export page.

## 15. UI Structure & Navigation

**Page list** (mobile-first):

1. **Home/Dashboard**: this month's total spend, category breakdown, a pending-alerts summary, recent receipts.
2. **Photo upload flow**: photograph/select → AI processing → preview/confirm → save.
3. **Receipt list**: historical receipts, filterable by store/uploader/date range (a year→month→day picker). Each receipt can be deleted (by its own uploader, per Section 4's permissions — also removes its stored image from Supabase Storage) and, once `confirmed`, opens a detail view (its own page) listing every line item; a still-`pending_review` receipt instead opens the editable preview/confirm screen from Section 6. **Amended (ticket 16)**: the confirmed-receipt detail view is no longer purely read-only — its own uploader can toggle an inline Edit mode to fix name/quantity/unit price/promotion, purchase date (via the same picker as the list filter/export range), and the weight/volume spec (value + a fixed g/kg/ml/L unit dropdown, shown only for items that already have one). Edits reuse the existing `EditLog` diffing and don't retroactively re-check price-spike alerts. **Amended again post-launch**: the shared picker (`DatePickerField`, née `MonthPickerField`) regained a day step for every filter/edit use — the month-only version made correcting an exact purchase date awkward (ticket 16 had to special-case preserving the day-of-month around it, since removed). The monthly report's own month browser (Section 14) is unaffected — it stays month-only, since that page is inherently a monthly view.
4. **Product detail page**: price trend chart + multi-store comparison module + consumption rate/estimated days remaining + purchase history.
5. **Monthly report page**: see Section 14.
6. **Notification center**: the price-spike and low-stock alert list.
7. **Circle settings**: member management, invite links.

**Navigation**: a bottom tab bar with five even items — Home / Receipts / Upload / Report / Me (photo upload is a normal tab, **amended from** a centered floating action button). Notifications is a separate icon pinned to the top-right of every page instead of living in the tab bar.

**Bilingual toggle**: a language toggle on the circle settings page controls both dynamic data content and fixed UI chrome together (Section 7) — **amended from** data-content-only.

Visual styling (fonts, spacing, component design beyond color coding) is outside this document's scope, left for implementation or a later `/prototype` pass.

## 16. Admin Dashboard & Per-User AI Credits

A global-admin identity, separate from the per-circle `owner`/`member` roles in Section 4 — it spans every circle, not just one. In practice there is a single global admin (the app's owner).

**Access security (two layers)**: authorization is authoritative — both the frontend route and every admin API endpoint check the caller's global-admin status, and non-admins are refused regardless of URL. On top of that, the dashboard is served from a non-obvious, unguessable path (not `/admin`), and a non-admin hitting it gets a 404 rather than a login redirect, so the route's existence isn't revealed. Stronger verification (2FA, IP allowlisting) is deferred to a future round.

**Per-user credit model** (replaces Section 3.1's old global cap): each user has an independent dollar cap and spend counter. "Granting credit" is a **reset**, not a top-up — it zeroes the user's spend counter and sets a fresh cap, defaulting to $1 on a single click, or any custom admin-entered amount. It has no relationship to what the user had before.

**New-user free trial**: a brand-new user gets exactly **one free successful recognition call** (count-based, not dollar-based — a single Haiku 4.5 call costs far less than $1, so a dollar allowance wouldn't actually cap them at one use). Only a successful call consumes it; failed/errored attempts don't. Once consumed, further attempts are refused until an admin grants a real (dollar-based) credit.

**Blocked-user messaging**: when refused (free trial spent, or dollar cap hit), the user sees a message with a `mailto:` link to the admin's email address, opening their own email client with a pre-filled draft. No backend transactional-email service is introduced.

**Account disable/enable**: implemented via Supabase Auth's own ban mechanism (`auth.admin.updateUserById` with `ban_duration`), not an app-level flag — a disabled user is rejected at the authentication layer itself, including on session refresh.

**UI placement**: the dashboard never appears in the bottom tab bar or any normal-user menu, and isn't wrapped in the app's normal shell/navigation — it's a standalone console page. A global admin is redirected there once, immediately after login; a visible control lets them switch back into the normal app and navigate freely afterward. **Amended**: since the one-time redirect only fires right after sign-in, Circle Settings also shows a persistent "Go to admin dashboard" link (same `isGlobalAdmin` check) for a global admin who already has a live session.

**Migration of existing users**: everyone who already has an account is grandfathered directly into the dollar-cap model (default $1, or set per-user by the admin), skipping the new-user free-trial gate entirely.

**UI direction**: settled via `/prototype` — a "needs attention" queue surfacing exactly who is blocked and why, followed by the full roster grouped by circle in collapsible sections, each user shown as a card (not a plain table row) with their credit state and actions (Grant $1 / custom amount / ban-unban) always visible.

### 16.1 Data model

Two new tables, neither writable by `authenticated` (every write goes through the backend's service-role client, mirroring `ai_spend_limit`'s existing pattern) — deliberately not columns added to `profiles`, since its existing update policy is scoped to *rows*, not *columns*, and would let a user overwrite any column on their own row, including a hypothetical admin flag.

**`global_admins`**

| Field | Description |
|---|---|
| `user_id` | Primary key, references `auth.users.id` |

Presence of a row = is a global admin. Added by hand via the Supabase SQL editor — there's exactly one admin and no self-serve promotion flow.

**`user_ai_access`** (replaces `ai_spend_limit`)

| Field | Description |
|---|---|
| `user_id` | Primary key, references `auth.users.id` |
| `free_trial_used` | Whether the one free recognition call has been consumed |
| `cap_usd` | Dollar cap; `null` means still in free-trial mode, not yet granted real credit |
| `spent_usd` | Accumulated spend against `cap_usd`, default 0 |
| `updated_at` | Last-write timestamp |

Mode is derived from `cap_usd`, not a separate enum: `null` → free-trial mode (refuse if `free_trial_used`); non-null → dollar-cap mode (refuse if `spent_usd >= cap_usd`). The **absence** of a row for a `user_id` is itself meaningful — a fresh signup that's never consumed its free call. Migrating existing users inserts a row per current `profiles.user_id` with `free_trial_used = true, cap_usd = 1.00, spent_usd = 0`.
