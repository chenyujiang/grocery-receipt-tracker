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

**Amended post-launch — invite links dropped, not deferred**: the app turned out to be family-only/self-use, so the invite-link "join an existing circle" path above was never built and won't be. Signup still self-service-creates its own circle via RLS (unchanged), but bringing several people into one shared circle is now an admin-driven action instead — see Section 16's amendment for `merge_users_into_new_circle`.

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

The concrete implementation of invite links (token generation, expiry, etc.) is left for development to design and isn't expanded on in this document. **Amended post-launch**: never designed or built — see Section 4's amendment.

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

**Amended post-launch**: the recognition prompt now explicitly tells Claude that a promotional/on-special item is still the same underlying product as its regular-price counterpart — ignore promo wording ("was $X now $Y", "special", "clearance") when matching, so it lands on the same `matched_product_id` (and therefore the same `Product.category`) instead of splitting off into a separate `Product`.

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

**Amended post-launch**: each category row expands into a per-product breakdown (which products made up that category's total, and how much each cost) — the category total alone didn't say what was actually bought. A product with promotional purchases that month also shows how much its promotions saved, as a separate informational figure (a red badge in the UI) — this is never subtracted from or added to any spend total, which already reflects what was actually paid (`ReceiptItem.subtotal` uses the transacted `unit_price`, not `original_price`); no negative-amount line is recorded anywhere.

**Amended post-launch**: the page's own month nav (browse which month's report to view) dropped its Previous/Next text buttons in favor of an icon-only calendar trigger; its popover gained a year-grid (jump straight to a distant year) and a "Today" button that appears only when viewing a past month.

**Data export**:

- Format: CSV.
- Content: line-by-line detail, with each `ReceiptItem` expanded into one row (product name, category, quantity, spec, unit price, store, date, uploader); nothing pre-aggregated.
- Scope: the whole circle's data, with a selectable date range (from date → to date, via the same year→month→day picker used elsewhere — **amended from an arbitrary day-level custom range** to a month-only picker for consistency, **then amended again post-launch** back to day precision; see Section 15).
- Entry point: an export button on the monthly report page, with no separate export page.

## 15. UI Structure & Navigation

**Page list** (mobile-first):

1. **Home/Dashboard**: this month's total spend, category breakdown, a pending-alerts summary, recent receipts.
2. **Photo upload flow**: photograph/select → AI processing → preview/confirm → save.
3. **Receipt list**: historical receipts, filterable by store/uploader/date range (a year→month→day picker). Each receipt can be deleted (by its own uploader, per Section 4's permissions — also removes its stored image from Supabase Storage) and, once `confirmed`, opens a detail view (its own page) listing every line item; a still-`pending_review` receipt instead opens the editable preview/confirm screen from Section 6. **Amended (ticket 16)**: the confirmed-receipt detail view is no longer purely read-only — its own uploader can toggle an inline Edit mode to fix name/quantity/unit price/promotion, purchase date (via the same picker as the list filter/export range), and the weight/volume spec (value + a fixed g/kg/ml/L unit dropdown, shown only for items that already have one). Edits reuse the existing `EditLog` diffing and don't retroactively re-check price-spike alerts. **Amended post-launch**: an item's weight/volume spec is now also shown next to its quantity/price in the read-only detail view and the pre-confirm review screen, not just in edit mode. **Amended again post-launch**: the shared picker (`DatePickerField`, née `MonthPickerField`) regained a day step for every filter/edit use — the month-only version made correcting an exact purchase date awkward (ticket 16 had to special-case preserving the day-of-month around it, since removed). It later also gained a year-grid step (jump straight to a distant year, matching Section 14's own month-nav amendment) for both the list filters and the purchase-date editor. The monthly report's own month browser (Section 14) is unaffected — it stays month-only, since that page is inherently a monthly view.
4. **Product detail page**: price trend chart + multi-store comparison module + consumption rate/estimated days remaining + purchase history.
5. **Monthly report page**: see Section 14.
6. **Notification center**: the price-spike and low-stock alert list.
7. **Circle settings**: member management, invite links. **Amended post-launch**: invite links dropped (see Section 4); "Dissolve circle" is hidden behind a flag (code kept) now that circle consolidation is an admin-only action (Section 16), not something an owner should do unilaterally.

**Navigation**: a bottom tab bar with five even items — Home / Receipts / Upload / Report / Me (photo upload is a normal tab, **amended from** a centered floating action button). Notifications is a separate icon pinned to the top-right of every page instead of living in the tab bar.

**Bilingual toggle**: a language toggle on the circle settings page controls both dynamic data content and fixed UI chrome together (Section 7) — **amended from** data-content-only.

Visual styling (fonts, spacing, component design beyond color coding) is outside this document's scope, left for implementation or a later `/prototype` pass.

## 16. Admin Dashboard & Per-User AI Credits

A global-admin identity, separate from the per-circle `owner`/`member` roles in Section 4 — it spans every circle, not just one. In practice there is a single global admin (the app's owner).

**Access security (two layers)**: authorization is authoritative — both the frontend route and every admin API endpoint check the caller's global-admin status, and non-admins are refused regardless of URL. On top of that, the dashboard is served from a non-obvious, unguessable path (not `/admin`), and a non-admin hitting it gets a 404 rather than a login redirect, so the route's existence isn't revealed. Stronger verification (2FA, IP allowlisting) is deferred to a future round.

**Per-user credit model** (replaces Section 3.1's old global cap): each user has an independent dollar cap and spend counter. "Granting credit" is a **reset**, not a top-up — it zeroes the user's spend counter and sets a fresh cap, defaulting to $1 on a single click, or any custom admin-entered amount. It has no relationship to what the user had before.

**New-user free trial**: a brand-new user gets **`FREE_TRIAL_LIMIT` (5) free successful recognition calls** (count-based, not dollar-based — a single Haiku 4.5 call costs far less than $1, so a dollar allowance wouldn't actually cap them usefully). Only a successful call consumes one; failed/errored attempts don't. Once all 5 are used, further attempts are refused until an admin grants a real (dollar-based) credit. **Amended post-launch**: the signup flow now tells the user about this allowance directly — a one-time welcome message on the Home page right after registering, via `justSignedUp` router state set by `Auth.tsx`'s post-signup redirect.

**Blocked-user messaging**: when refused (free trial spent, or dollar cap hit), the user sees a message with a `mailto:` link to the admin's email address, opening their own email client with a pre-filled draft. No backend transactional-email service is introduced.

**Account disable/enable**: implemented via Supabase Auth's own ban mechanism (`auth.admin.updateUserById` with `ban_duration`), not an app-level flag — a disabled user is rejected at the authentication layer itself, including on session refresh.

**UI placement**: the dashboard never appears in the bottom tab bar or any normal-user menu, and isn't wrapped in the app's normal shell/navigation — it's a standalone console page. A global admin is redirected there once, immediately after login; a visible control lets them switch back into the normal app and navigate freely afterward. **Amended**: since the one-time redirect only fires right after sign-in, Circle Settings also shows a persistent "Go to admin dashboard" link (same `isGlobalAdmin` check) for a global admin who already has a live session.

**Migration of existing users**: everyone who already has an account is grandfathered directly into the dollar-cap model (default $1, or set per-user by the admin), skipping the new-user free-trial gate entirely.

**UI direction**: settled via `/prototype` — a "needs attention" queue surfacing exactly who is blocked and why, followed by the full roster grouped by circle in collapsible sections, each user shown as a card (not a plain table row) with their credit state and actions (Grant $1 / custom amount / ban-unban) always visible.

**Amended post-launch — circle merging**: with invite links dropped (Section 4's amendment), the dashboard gained a third admin action: multi-select several standalone-circle users in the roster and merge them into one brand-new circle. Backed by `merge_users_into_new_circle`, a service-role-only Postgres function that atomically moves the selected users' products/receipts/alerts to the new circle, sets the first-selected user as owner and the rest as members, and deletes the now-empty old circles. It refuses the merge if any selected user's current circle already has other members — `Product` rows are circle-level, not per-user, so pulling one member out of an already-shared circle would strand the rest of that circle's data with no owner action able to recover it.

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
| `free_trial_calls_used` | Count of free recognition calls consumed so far (0–5) |
| `cap_usd` | Dollar cap; `null` means still in free-trial mode, not yet granted real credit |
| `spent_usd` | Accumulated spend against `cap_usd`, default 0 |
| `updated_at` | Last-write timestamp |

Mode is derived from `cap_usd`, not a separate enum: `null` → free-trial mode (refuse if `free_trial_calls_used >= FREE_TRIAL_LIMIT`); non-null → dollar-cap mode (refuse if `spent_usd >= cap_usd`). The **absence** of a row for a `user_id` is itself meaningful — a fresh signup that's never consumed a free call. Migrating existing users inserts a row per current `profiles.user_id` with `free_trial_calls_used = 5, cap_usd = 1.00, spent_usd = 0` (grandfathered straight into dollar-cap mode, so the trial-call count is moot for them). **Amended post-launch**: the trial limit was raised from 1 to 5 (`free_trial_used boolean` → `free_trial_calls_used integer`, migration `20260809000001_user_ai_access_trial_count`).

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# 家庭超市小票记账与价格追踪 App — 需求文档

本文档整理自 `wayfinder` 规划地图（`map.md`）里 14 张已解决 ticket 的决策，是这个项目的完整需求说明，可直接交付给开发阶段使用。

## 1. 概述

这是一个面向家庭（以及未来可能的朋友圈子）共享使用的网页应用：用户拍照上传超市小票，AI 自动识别出商品明细并中英双语化，应用据此追踪每件商品的单价变化、消耗速度，并在价格异常上涨或库存快用完时主动提醒。

用户所在地为新西兰，小票原文为英文（如 Countdown、New World、PAK'nSAVE 等超市），应用会将识别出的英文内容自动翻译成中文。

## 2. 范围

### 2.1 本期功能范围

- 拍照/选图上传小票，AI 识别 + 中英翻译（第 6 节）。
- 家庭/圈子共享账号体系（第 4 节）。
- 商品自动分类与匹配（第 8、9 节）。
- 月度单价涨幅对比、隐性涨价识别（第 10 节）。
- 多店铺比价（第 11 节）。
- 消耗速度分析与库存快用完提醒（第 12 节）。
- 价格异常提醒（第 13 节）。
- 数据导出（CSV）与月度报告页面（第 14 节）。

### 2.2 后续路线图（本期不做）

- 原生/跨平台手机 App（先做网页版验证可行性）。
- App 级别的原生推送通知（本期用"网页内展示 + 邮件通知"代替）。
- 按商品/分类自定义提醒阈值和静音功能。

### 2.3 明确排除

- 像素级视觉设计（字体、间距、组件样式）——本文档定义页面结构和信息架构，具体视觉呈现留给实现阶段或后续原型环节。

## 3. 技术栈与架构

- **前端**：React.js + TypeScript，移动优先的响应式网页应用，部署在 Vercel。
- **后端**：Node.js，以 Vercel Serverless Functions 的形式运行，承担 AI 调用中转、业务逻辑和定时任务。
- **数据库/认证/存储**：Supabase（Postgres 数据库 + Supabase Auth 邮箱登录 + Supabase Storage 对象存储）。
- **版本控制**：GitHub。
- **AI 模型**：Anthropic Claude API 的多模态模型，具体是 **Claude Haiku 4.5**（`claude-haiku-4-5`），用于小票 OCR 识别 + 中英翻译 + 商品匹配建议，全部在同一次后端调用中完成。结构化提取类任务不需要最贵的模型，Haiku 4.5 成本约为 Opus 5 的 1/5；后续如果识别质量不够可以再评估升级到 Sonnet/Opus。

### 3.1 安全与成本控制

- AI 调用必须经后端 Serverless Function 中转，Claude API Key 只存在后端环境变量里，绝不出现在前端代码或浏览器网络请求中。
- **调用限额是按用户分配的，不是单一全局上限**（**已修订，详见第 16 节**）：每个用户有自己独立的美元上限和花费计数，按每次调用实际的 `usage.input_tokens`/`usage.output_tokens` × Haiku 4.5 单价累计花费，一旦某个用户的上限被打满就直接拒绝他的新识别请求，不影响其他任何人。不再有叠加在上面的全局总上限。全新的、还没被审核过的用户拿到的是按**次数**（1次成功调用）计算的一次性免费额度，不是按金额算的——完整的管理员/额度模型见第 16 节。
- 小票原图存储在 Supabase Storage 的私有 bucket，不开放公开 URL；前端需要显示原图时，由后端生成一个有效期较短的签名 URL，仅圈子成员可获取。

### 3.2 端到端数据流

1. 用户在网页上传/拍摄小票图片，前端把图片发给后端 API route。
2. 后端把原图存入 Supabase Storage 私有 bucket，同时调用 Claude API 完成 OCR 识别 + 中英翻译，产出结构化草稿。
3. 后端把识别出的商品英文原文与该圈子已有的标准商品列表做匹配，生成匹配建议，一并写入草稿。
4. 草稿以 `status = pending_review` 存入数据库；用户在预览页逐条确认/修正后，状态更新为 `confirmed`，正式计入统计。
5. 小票确认后，后端立即跑价格异常检查（第 13 节）；每天的定时任务另外扫描所有商品的库存状态（第 12 节）。

## 4. 账号与共享模型

- **登录方式**：Supabase Auth 自带的邮箱登录方案。
- **账号与圈子关系**：一个账号只属于一个"圈子"（Circle）——注册时自动创建一个圈子，或通过邀请链接加入别人的圈子。这是个简化模型：家庭是一个圈子，未来朋友各自使用则是互不相关的独立圈子。
- **圈子人数**：默认上限 10 人（后续可调整）。
- **权限分级**：
  - **owner**：创建圈子的人，可邀请/移除成员、解散圈子；和 member 一样，只能修改/删除自己上传的记录。
  - **member**：只能新增记录，只能修改/删除自己上传的记录，不能动别人的。
  - 所有成员（无论角色）都能**查看**圈子内的全部记录、报告和提醒。
- **邀请方式**：邮箱邀请链接，需要接入邮件发送服务（如 Supabase 自带方案或 Resend）。
- **防重复拍票**：新小票按"店铺 + 日期 + 总金额"自动检测疑似重复，检测到就提示用户确认"确实重复，不导入"或"不是重复，继续导入"。
- **购买人字段**：每条记录的 `uploaded_by` 自动取当前登录账号的邮箱，无需额外输入，可用于按人统计消费。

**上线后修订——邀请链接主动放弃，不是延后**：这个应用最终定位是只给自己家人用，所以上面说的邀请链接"加入已有圈子"这条路一直没做，以后也不会做了。注册时依然会像原来一样自助创建自己的圈子（靠 RLS 实现，没变），但是把几个人合并进同一个圈子这件事，现在改成了由管理员来操作——详见第 16 节里 `merge_users_into_new_circle` 那条修订。

## 5. 数据模型

### 5.0 Circle（圈子）与用户资料

**Circle**

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `name` | 圈子名称（可选，如"我们家"） |
| `max_members` | 人数上限，默认 10 |
| `created_at` | 创建时间 |

**Profile**（一对一关联 Supabase Auth 的 `auth.users`）

| 字段 | 说明 |
|---|---|
| `user_id` | = `auth.users.id` |
| `circle_id` | 所属圈子 |
| `role` | `owner` / `member` |

由于"一个账号只属于一个圈子"（第 4 节），圈子归属和角色直接存在用户资料表上，不需要多对多的成员关系表。

邀请链接的具体实现（邀请 token 的生成、过期时间等）留给开发阶段设计，本文档不展开。**上线后修订**：从来没有设计或实现过——见第 4 节的修订说明。

### 5.1 Receipt（小票）

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `circle_id` | 所属圈子 |
| `uploaded_by` | 上传人登录邮箱 |
| `store_name_en` | 店铺名，OCR 识别的英文原文 |
| `store_name_zh` | 店铺名中文翻译 |
| `purchase_date` | 购买日期 |
| `total_amount` | 小票总价 |
| `original_image_url` | 原图存储地址（保留期后清空） |
| `uploaded_at` | 上传时间 |
| `status` | `pending_review` / `confirmed` |

原图存储在 Supabase Storage，默认保留 12 个月后自动清理（只清图片，结构化数据永久保留）。

### 5.2 ReceiptItem（商品行）

| 字段 | 说明 |
|---|---|
| `id`, `receipt_id` | 主键、关联小票 |
| `raw_name_en` | AI 识别的商品名英文原文 |
| `raw_name_zh` | 商品名中文翻译 |
| `product_id` | 关联到标准化商品（见 5.3） |
| `quantity` | 数量 |
| `unit_spec_value` / `unit_spec_unit` | 规格数值 + 单位（如 500 / g） |
| `unit_price` | 实际成交单价 |
| `original_price` | 原价（可为空，识别到划线价/优惠时才填） |
| `is_promotion` | 布尔，是否促销价 |
| `subtotal` | 小计 |

`raw_name_en`/`raw_name_zh` 记录"这次识别到的原始文本"，`product_id` 记录"这行被认定属于哪个标准商品"——两者分工不同。

**注意**：`ReceiptItem` 不单独存 `category` 字段——分类归属统一挂在 `Product`（见 5.3）上，通过 `product_id` 读取，避免同一个商品的分类在多条 `ReceiptItem` 记录里各存一份、事后修正时彼此不同步。预览确认页上仍然可以让用户对某一行编辑分类，但保存的是它所匹配的 `Product.category`，而不是 `ReceiptItem` 自己的副本。

### 5.3 Product（标准商品，圈子内维度）

| 字段 | 说明 |
|---|---|
| `id`, `circle_id` | 主键、所属圈子（标准商品是圈子内概念） |
| `canonical_name_en` / `canonical_name_zh` | 用户确认后的标准商品名，双语 |
| `category` | 分类，唯一的存储位置（见第 9 节） |
| `low_stock_alert_active` | 布尔，是否处于"已提醒、尚未回升"状态（见第 12 节） |
| `created_at` | 创建时间 |

同一个标准商品下，不同购买记录的规格（`unit_spec_value`/`unit_spec_unit`）可以不一样——这正是隐性涨价识别和消耗速度计算的数据基础。

### 5.4 EditLog（修改历史）

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `receipt_id` / `receipt_item_id` | 关联记录 |
| `field_name`, `old_value`, `new_value` | 改了哪个字段、改前改后的值 |
| `edited_by`, `edited_at` | 修改人、修改时间 |

所有用户编辑（英文原文的识别纠错、中文翻译的修正、分类修正等）都记录在这张表里。

## 6. 小票上传与识别流程

**上传方式**：网页用标准的 `<input type="file" accept="image/*">` 控件，特意**不加** `capture` 属性——加了 `capture` 之后大部分手机浏览器会直接跳进相机、跳过系统选择框，恰好就是这个选择框才提供"从相册选择"这个入口。不加的话，手机浏览器会同时提供"拍照"和"从相册选择"两个入口，无需自建相机取景 UI。

**处理流程**：

1. 上传后立即调用 Claude API 完成 OCR + 翻译 + 商品匹配建议，生成 `status = pending_review` 的草稿。
2. 用户在预览页逐条确认/修正每个字段（商品名、数量、规格、单价、分类、匹配的标准商品）。
3. 确认后状态变为 `confirmed`，正式计入统计，并触发价格异常检查（第 13 节）。

不单独设"识别置信度低"标记——预览确认这一步本身就是识别错误的兜底机制。

## 7. 双语内容策略

- **范围**：动态数据内容（商品名、店铺名、分类标签）本来就双语化。**相对最初"界面文案只做英文"的决定有修订**：界面固定文案（菜单、按钮、标签）现在也全部翻译了，用手写的中英文字典（`src/lib/i18n.ts`）实现，没引入完整的 i18n 框架——原因是页面上数据内容已经双语了，界面文案还是纯英文会显得不一致。
- **方向**：小票原文是英文，`_en` 字段是 OCR 识别的原始真实文本，`_zh` 字段是同一次 Claude API 调用顺带产出的中文翻译。
- **存储**：双语字段拆成两列（如 `name_zh` / `name_en`），不用 JSON 字段。
- **修正**：`_en` 的识别错误走标准的预览确认/EditLog 流程；用户发现 `_zh` 翻译不准时可以手动修改，同样记入 EditLog。
- **界面显示**：一个语言切换开关（圈子设置页里的开关）同时控制动态内容和界面文案的显示语言——不是两个独立的开关。

## 8. 商品匹配

**匹配方式**：AI 在识别小票的同一次调用（或紧接着）里，把新识别出的 `raw_name_en` 与该圈子已有的标准商品（Product）列表做语义相似度比对，生成匹配建议；用户在预览确认流程里直接确认或改这个建议，不增加额外操作步骤。

**判定依据**：以 `raw_name_en`（英文原文）为主要判断依据，`raw_name_zh`（中文翻译）不参与匹配。

**规格变化**：不影响匹配判定——同一个标准商品下，不同购买记录的规格可以不一样，规格只是 `ReceiptItem` 自己的属性。

**条码**：不处理。新西兰超市小票通常不打印条码，不为此预留字段。

**上线后修订**：识别用的 prompt 现在会明确告诉 AI，促销/特价商品本质上还是跟正常价商品同一个产品——匹配时要忽略促销相关的文案（"was $X now $Y"、"special"、"clearance" 之类），这样才会落到同一个 `matched_product_id`（进而落到同一个 `Product.category`），而不是被拆成一个新的 `Product`。

## 9. 分类体系

- **层级**：两级（大类 + 子类），系统固定预设，所有圈子共用，不支持圈子自定义新增。
- **AI 分类范围**：只能从预设列表里选最匹配的子类，不允许生成新类目。
- **分类记忆机制**：用户手动改过某个商品的分类后，记住这次修正；同一个 `product_id` 下次再出现时自动套用改过的分类（key 是 `product_id`，不是原始文本，因为不同措辞的原始文本都会归到同一个标准商品）。
- **初始值来源**：识别出一行新商品时，如果它匹配到圈子里已有的 `Product`（第 8 节），分类直接取该 `Product.category`（已有的分类记忆生效）；如果没有匹配、要新建 `Product`，才用 AI 在同一次识别调用里给出的分类建议作为这个新 `Product.category` 的初始值。

**初始分类目录**：

| 大类 |
|---|
| 食品-粮油调味 |
| 食品-生鲜 |
| 食品-乳制品烘焙 |
| 食品-零食饮料 |
| 日用品-清洁洗护 |
| 日用品-个人护理 |
| 母婴用品 |
| 宠物用品 |
| 其他/未分类 |

具体子类留给开发阶段微调；英文名是分类目录的原始定义，中文是翻译。

**上线后修订**：真实小票数据积累起来之后，发现两个食品大类太粗——"食品-生鲜"把水果、蔬菜、肉类混在一起，"食品-零食饮料"把零食、饮料、调味品、冷冻食品也混在一起。拆分为：

| 大类 |
|---|
| 食品-粮油调味 |
| 食品-水果 |
| 食品-蔬菜 |
| 食品-肉类海鲜 |
| 食品-乳制品烘焙 |
| 食品-冷冻食品 |
| 食品-零食 |
| 食品-饮料 |
| 日用品-清洁洗护 |
| 日用品-个人护理 |
| 母婴用品 |
| 宠物用品 |
| 其他/未分类 |

"食品-肉类海鲜"和"食品-冷冻食品"不只是原有分类的拆分，是新增的——因为有些真实商品用水果/蔬菜/零食/饮料这个拆法根本放不进去。已有的、原本挂在被删掉的两个分类下的 `Product` 记录，是按商品名手动重新归类的（见 `supabase/migrations/20260807000003_refine_food_categories.sql`），因为目前还没有分类编辑的界面（第 15 节没有暴露这个入口），没有别的办法批量改。

## 10. 涨幅计算与展示

**对比基准**：和上一次购买价格对比（不是历史均价）。

**促销过滤**：排除 `is_promotion = true` 的行，基准价和当前价都只取正常价记录；如果最近一次购买恰好是促销价，就继续往前找最近一次非促销记录做基准，避免促销价回归原价被误判为暴涨。

**单位换算**：

- 重量类（g/kg）换算成每 100g 单价；体积类（ml/L）换算成每 100ml 单价；计数类（个/pack）直接比 `unit_price`。
- 换算表（如 kg→1000g、L→1000ml）由开发阶段维护，属于实现细节。

**公式**：`涨幅% = (本次换算后单价 − 基准换算后单价) / 基准换算后单价 × 100%`。

**展示内容**：

- 涨幅榜单：本月涨幅最高的商品排行，按 `product_id` 分组。
- 单品价格趋势图：某个标准商品历史换算单价随时间变化的折线图，促销记录用空心点等不同样式标出。
- 涨跌颜色：涨价红色，降价绿色。

## 11. 多店铺比价

`Product` 本身是圈子内维度、不区分店铺，`ReceiptItem` 通过 `receipt_id` 关联到 `Receipt.store_name`，所以同一个 `product_id` 天然可能对应多个店铺——数据结构本身已支持跨店铺比较。

- **对比基准**：复用第 10 节的规则——排除促销行，只比每家店最新一次正常价，不引入"最低价"或"平均价"。
- **单位换算**：同样复用第 10 节的规则，确保跨店铺比较用同一个基准。
- **展示位置**：商品详情页里紧挨价格趋势图的一个模块，不是独立页面。
- **数据不足**：只在一家店买过时不显示对比，显示"暂无其他店铺的购买记录"。

## 12. 消耗速度与库存提醒

**计算窗口**：按 `product_id` 取最近 5 次购买记录（不足 5 次用全部）做滑动窗口，日均消耗速度 = 窗口内总购买量（换算成基准单位）÷ 窗口跨越的总天数。这样囤货不会打乱估算。同一天内同一 `product_id` 出现多条 `ReceiptItem`（比如一次买了不同规格的两瓶）时，按同一次"购买记录"合并处理，量直接相加。

**数据不足**：累计购买记录少于 3 次时不计算、不提醒，显示"数据不足"。

**触发条件**：

- 预计当前剩余量 = 最近一次购买量（基准单位）− 日均消耗速度 ×（今天 − 最近一次购买日期的天数）。
- 预计剩余天数 = 预计当前剩余量 ÷ 日均消耗速度；跌破 5 天（默认阈值）时触发提醒。

**检查机制**：不像价格提醒挂在"确认小票"事件上，而是用每天一次的定时任务（Vercel Cron / Supabase pg_cron）扫描所有商品。

**提醒频率**：用 `Product.low_stock_alert_active` 标记只提醒一次，直到用户买了新的、剩余天数回升到阈值以上才重置，避免每天重复骚扰。

**自动化**：完全依赖购买记录自动推算，不引入手动"标记用完"的录入；UI 明确标注这是"预计"数值，非精确库存。

## 13. 价格异常提醒

- **阈值**：固定百分比，涨幅超过 15% 触发（默认值，后续可开放成可调设置项）。
- **检查时机**：每次小票确认后，立刻对涉及的商品跑第 10 节的涨幅计算。
- **接收范围**：圈子内所有成员，不按历史购买人筛选。
- **应用内展示**：通知列表，每条显示商品名（双语）、新价格、涨幅百分比，链接到该商品的价格趋势图。
- **邮件通知**：按小票汇总成一封（同一张小票的多个触发商品合并），不逐条单发。
- **静音**：暂不支持按商品关闭提醒。

## 14. 数据导出与月度报告

**月度报告页面**：独立页面，按月份选择查看（可回溯历史月份），汇总：

- 本月总支出及环比变化。
- 按分类的支出占比。
- 涨幅榜单（复用第 10 节的计算逻辑，作为本页一个板块）。
- 本月触发的价格异常/低库存提醒次数。
- 按上传人的支出分布，以及本月上传的小票/商品条目总数。

**上线后修订**：每个分类行现在可以展开成具体商品明细（这个分类里到底买了什么、各花了多少钱）——之前只有分类总额，看不出实际买了什么。这个月有促销购买记录的商品，还会额外显示这个月促销总共省了多少钱（界面上用红色标签展示）——这只是个展示用的信息，不会加进或减出任何支出总额，因为总额本来就已经反映了实际付的钱（`ReceiptItem.subtotal` 用的是实际成交的 `unit_price`，不是 `original_price`）；系统任何地方都不会另外记一笔负数。

**上线后修订**：这个页面自己的月份导航（浏览"看哪个月的报告"）去掉了"上一月/下一月"文字按钮，改成只留日历图标触发；弹出的选择器加了年份网格（可以直接跳到很久以前的某一年），以及一个"回到本月"按钮（只在浏览的不是本月时才出现）。

**数据导出**：

- 格式：CSV。
- 内容：逐条明细，每个 `ReceiptItem` 展开一行（商品名、分类、数量、规格、单价、店铺、日期、上传人），不预先汇总。
- 范围：整个圈子的数据，可选日期范围（起始日期→结束日期，用和其他地方一样的"先选年再选月再选日"选择器）——**相对自定义起止日期有修订**：先改成"只精确到月"以保持全 app 日期选择器一致，**上线后又再次修订**，改回精确到日（详见第 15 节）。
- 入口：月度报告页面上的一个导出按钮，不单独开导出页面。

## 15. UI 结构与导航

**页面清单**（移动优先）：

1. **首页/Dashboard**：本月总支出、分类占比、待处理提醒摘要、最近几张小票。
2. **拍照上传流程**：拍照/选图 → AI 处理中 → 预览确认页 → 确认入库。
3. **小票列表**：按店铺/上传人/日期范围（先选年再选月再选日）筛选历史小票。每张小票都可以删除（限本人上传的，见第 4 节权限——删除时同时清掉 Supabase Storage 里的原图），已 `confirmed` 的小票点开是一个详情页（独立页面），展示每条商品明细；还处于 `pending_review` 的小票点开则是第 6 节那个可编辑的预览确认页。**已修订（票16）**：已确认小票的详情页不再是纯只读的——上传人本人可以切换到内联编辑模式，修正商品名/数量/单价/促销标记、购买日期（用跟列表筛选/导出范围同一个选择器）、以及重量/体积规格（数值+固定的 g/kg/ml/L 单位下拉框，只对本来就有单位的商品显示）。编辑复用现有的 `EditLog` 差异记录机制，不会追溯性地重新检查价格异常提醒。**上线后修订**：商品的重量/体积规格现在也会显示在只读的详情页和确认前的预览页上（挨着数量/单价），不再只有编辑模式才看得到。**上线后又再次修订**：这个共用选择器（`DatePickerField`，原名 `MonthPickerField`）在每个筛选/编辑场景里都加回了"选日"这一步——只精确到月，让修正一个具体购买日期变得很别扭（票16当时不得不专门写了个保留"日"不被重置的临时处理，现已删除）。之后又加了"选年份"这一步（可以直接跳到很久以前的某一年，跟第 14 节自己月份导航的修订一致），同时用于列表筛选和购买日期编辑。月度报告自己的月份浏览器（第 14 节）不受影响，仍然只精确到月，因为那个页面本来就是按月浏览的。
4. **商品详情页**：价格趋势图 + 多店铺比价模块 + 消耗速度/预计剩余天数 + 购买历史。
5. **月度报告页**：见第 14 节。
6. **通知中心**：价格异常 + 低库存提醒列表。
7. **圈子设置**：成员管理、邀请链接。**上线后修订**：邀请链接已放弃（见第 4 节）；"解散圈子"用开关隐藏了（代码保留），因为圈子合并现在是管理员专属操作（第 16 节），不应该由 owner 自己单方面做。

**导航**：底部 Tab Bar，五个等宽项——首页 / 小票 / 上传 / 报告 / 我的（拍照上传是普通 tab，**相对居中悬浮按钮有修订**）。通知单独做成一个固定在页面右上角的图标，不再放进 Tab Bar。

**双语切换**：圈子设置页里的语言切换开关，同时控制动态数据内容和界面固定文案（见第 7 节）——**相对"只影响数据内容"有修订**。

视觉样式（配色之外的字体、间距、组件设计）不在本文档范围内，留给实现阶段或后续 `/prototype` 环节。

## 16. 管理后台与按用户 AI 额度

一个独立于第 4 节 circle `owner`/`member` 角色的全局管理员身份——它跨越所有 circle，不只限于某一个。实际使用中只有一个全局管理员（app 的所有者本人）。

**访问安全（两层）**：真正起作用的是权限校验——前端路由和每一个管理接口都会检查调用者的全局管理员状态，不是管理员一律拒绝，不管 URL 是什么。在此之上，管理后台部署在一个不规律、猜不出来的路径上（不是 `/admin`），非管理员访问时返回 404 而不是跳转登录页，这样不会暴露这个路由的存在。更强的验证方式（二次验证、IP 白名单）推迟到以后的版本。

**按用户额度模型**（取代第 3.1 节里旧的全局总闸门）：每个用户有自己独立的美元上限和花费计数。"给额度"是**重置**，不是累加充值——把用户的花费计数清零，并设置一份新的上限，默认一键 $1，或者管理员自定义任意金额。这和用户之前的额度没有任何关系。

**新用户免费试用**：全新用户拿到的是**`FREE_TRIAL_LIMIT`（5 次）成功识别调用**的免费额度（按次数算，不按金额——单次 Haiku 4.5 调用远花不到 $1，按金额算的额度根本没法有效限制次数）。只有成功的调用才会消耗一次额度，失败/报错的尝试不算。5 次用完之后，后续请求全部被拒绝，直到管理员分配一份真正的（按金额算的）额度。**上线后追加**：注册流程现在会直接告诉用户这份额度——注册成功跳回首页后会出现一条一次性的欢迎提示，靠 `Auth.tsx` 登录后跳转时带的 `justSignedUp` 路由 state 驱动。

**被卡住时的提示**：用户被拒绝时（免费试用用完，或按金额算的额度用完），会看到一条提示信息和一个指向管理员邮箱的 `mailto:` 链接，点击后用自己的邮件客户端打开一封预填好的邮件草稿。不引入任何后端自动发信服务。

**账号禁用/启用**：用 Supabase Auth 自带的封禁机制实现（`auth.admin.updateUserById` 加 `ban_duration`），不是应用层的一个标记字段——被禁用的用户在认证层本身就会被拒绝，包括 session 刷新的时候。

**UI 位置**：管理后台不会出现在底部 Tab Bar 或任何普通用户能看到的菜单里，也不套用 app 正常的外壳/导航——是一个独立的控制台页面。全局管理员登录后会被立刻跳转过去一次；从那里有个明显的入口可以切回普通 App 界面，之后正常导航。**已修订**：因为这个一次性跳转只在登录那一刻触发，Circle Settings 页面也常驻显示一个"前往管理后台"的链接（同样靠 `isGlobalAdmin` 判断），方便已经有登录状态的全局管理员随时进去。

**老用户迁移**：所有已经存在账号的用户都直接迁移进按金额算的模型（默认 $1，或管理员逐个手动设置），完全跳过新用户的免费试用限制。

**UI 方向**：通过 `/prototype` 定下来——最上面是"需要处理"队列，直接标出谁被卡住了、为什么；下面是按圈子分组、可折叠的完整名单，每个用户都展示成一张卡片（而不是普通表格行），额度状态和操作（给$1/自定义金额/封禁-解封）都是一直可见的。

**上线后修订——圈子合并**：邀请链接放弃之后（见第 4 节修订），后台又加了第三个管理员操作：在名单里多选几个各自独立圈子的用户，把他们合并成一个全新的圈子。底层是 `merge_users_into_new_circle`，一个只有 service role 能调用的 Postgres 函数，原子性地把选中用户的商品/小票/提醒都搬到新圈子，第一个被选中的用户设为 owner，其余设为 member，然后删掉变空的旧圈子。如果被选中的用户当前所在的圈子已经有其他成员，这个函数会拒绝合并——因为 `Product` 是圈子级别的数据，不是按用户区分的，把一个成员从已经共用的圈子里单独拉走，会导致这个圈子剩下的数据没人能找回来。

### 16.1 数据模型

两张新表，都不给 `authenticated` 写权限（所有写入都经过后端的 service-role 客户端，跟 `ai_spend_limit` 现有的模式一样）——特意不在 `profiles` 上加字段，因为它现有的更新策略是按**行**限制的，不是按**列**限制的，会让用户能改掉自己那一行的任何列，包括假设加上去的管理员标记。

**`global_admins`**

| 字段 | 说明 |
|---|---|
| `user_id` | 主键，引用 `auth.users.id` |

有这一行 = 是全局管理员。通过 Supabase SQL 编辑器手动添加——只有一个管理员，没有自助升级流程。

**`user_ai_access`**（取代 `ai_spend_limit`）

| 字段 | 说明 |
|---|---|
| `user_id` | 主键，引用 `auth.users.id` |
| `free_trial_calls_used` | 已经用掉的免费识别次数（0–5） |
| `cap_usd` | 美元额度上限；`null` 表示还处于免费试用模式，还没被分配真正的额度 |
| `spent_usd` | 相对 `cap_usd` 累计的花费，默认 0 |
| `updated_at` | 最后写入时间 |

模式由 `cap_usd` 推导，不单独存一个枚举：`null` → 免费试用模式（`free_trial_calls_used >= FREE_TRIAL_LIMIT` 则拒绝）；不为 null → 按金额算模式（`spent_usd >= cap_usd` 则拒绝）。某个 `user_id` **没有**对应的行，这件事本身就有意义——全新注册、一次免费识别都还没用过。迁移老用户时，给 `profiles` 里现有的每个 `user_id` 插入一行，`free_trial_calls_used = 5, cap_usd = 1.00, spent_usd = 0`（直接落地成按金额算模式，试用次数对他们已经无意义）。**上线后追加**：试用额度从 1 次提高到 5 次（`free_trial_used boolean` → `free_trial_calls_used integer`，迁移文件 `20260809000001_user_ai_access_trial_count`）。
