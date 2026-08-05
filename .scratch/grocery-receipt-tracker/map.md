# Grocery Receipt Tracking & Price Monitoring App — Requirements Planning Map

## Destination

Produce a complete product requirements document (spec): a family-shared "photograph grocery receipts to track spending and unit prices" web app that supports bilingual (Chinese/English) data content.

The document must clearly define the feature scope, core data structures, the AI recognition (multimodal LLM OCR) approach, product matching and categorization logic, monthly price-change comparison, consumption-rate analysis, the bilingual translation mechanism, and the additional features: price-spike alerts, low-stock alerts, hidden price-hike detection, multi-store price comparison, and data export/monthly reports.

Once the document is complete, it will be handed off to the development phase for implementation (implementation itself is out of scope for this planning effort).

## Notes

- Domain: personal/family expense tracking + product price monitoring.
- Decided: receipt text recognition uses a multimodal LLM (e.g. the Claude / GPT-4V family), not a dedicated OCR API or a self-trained model.
- Decided: built for family sharing (multiple people recording together), not a single-user scenario; the project is also planned to open up to friends after completion, so it needs a proper account/registration system that supports multiple independent users/groups, not just a single family's invite-code model.
- Decided: build the web app first; a native/cross-platform app is deferred to a future roadmap and is not part of this round.
- Decided: the tech stack direction is React.js + TypeScript + Node.js, deployed on Vercel (frontend/API) + Supabase (database/auth), with GitHub for version control.
- Decided: the user is based in New Zealand, so receipts are originally in English (from supermarkets like Countdown, New World, PAK'nSAVE), not Chinese.
- Decided: the product must support Chinese/English bilingual content — dynamic data (product names, store names, category labels) is stored bilingually, with `_en` being the OCR-recognized English source text and `_zh` the Chinese translation produced by that same multimodal-LLM call; fixed UI chrome (menus, buttons) is English-only, with no language switch.
- Communication is in Chinese throughout; the map and ticket documents are bilingual with sentence-by-sentence pairing (Chinese above, English below), mirroring the product's own bilingual requirement.
- Each ticket is preferentially resolved via `/grilling` (paired with `/domain-modeling` to capture terminology and data structures); `/research` may be borrowed temporarily when comparing external technology options.

## Decisions so far

- [Platform choice (01-platform-choice)](issues/01-platform-choice.md) — Build the web app first, native app deferred to a future roadmap; tech stack direction is React+TS+Node.js / Vercel+Supabase / GitHub.
- [Account & sharing model (02-family-sharing-model)](issues/02-family-sharing-model.md) — Supabase Auth email login; one account per circle (default cap 10 members); owner/member roles, members can only edit/delete their own records; email invite links; duplicate detection by store+date+amount; buyer field = login email.
- [Receipt data schema (03-receipt-data-schema)](issues/03-receipt-data-schema.md) — Photo upload → AI draft → user reviews and confirms before it's saved; a Receipt/ReceiptItem/EditLog three-table structure, spec split into value+unit, promotions flagged with original price kept; original photos kept 12 months in Supabase Storage; upload uses a standard file input, covering both camera capture and gallery selection.
- [Category taxonomy (04-category-taxonomy)](issues/04-category-taxonomy.md) — A two-level, system-fixed category list (9 top-level categories such as food/household); AI must pick from the preset list, never invent categories; user corrections are remembered and auto-applied to the same product name.
- [Bilingual content strategy (09-bilingual-content-strategy)](issues/09-bilingual-content-strategy.md) — Only dynamic data content is bilingual (product names/store names/categories), stored as `_zh`/`_en` columns, with `_en` as the OCR English source text and `_zh` as the translation produced by that same LLM call; this required updating the field design of tickets 03 and 04. **Amended post-launch**: fixed UI chrome is fully translated too (not English-only), via a hand-written string dictionary, driven by the same toggle as the data content.
- [Product matching strategy (05-product-matching-strategy)](issues/05-product-matching-strategy.md) — AI suggests a match candidate, the user confirms/changes it in the existing preview flow; barcodes are not handled; spec changes still count as the same product, with spec as a per-purchase-record attribute; adds a Product table (`product_id`) that tickets 06/07 will group by, and category memory's key also migrates to `product_id`.
- [Price-change calculation (06-price-change-calculation)](issues/06-price-change-calculation.md) — Compares against the last purchase price, excluding promotional rows; weight/volume units are normalized to a per-100g/100ml basis before comparing, count-based units are not normalized; the page shows a price-change leaderboard, a per-product trend chart, and red/green color coding for increases/decreases.
- [Consumption-rate calculation (07-consumption-rate-calculation)](issues/07-consumption-rate-calculation.md) — A sliding window of the last 5 purchases (total quantity ÷ total days) gives the average daily consumption rate; fewer than 3 purchases means no estimate is shown; a reminder triggers when estimated days remaining drops below 5; fully automatic, with no manual "used up / not used up" marking required.
- [Tech stack & storage (08-tech-stack-storage)](issues/08-tech-stack-storage.md) — OCR + translation uses **Claude Haiku 4.5** via the Anthropic Claude API; calls must be proxied through a Vercel Serverless Function backend, keeping the API key out of the frontend; the quota is a **global hard $1 cap** (not per-call-count or per-user) — calls are refused once hit, requiring a manual raise; receipt images live in a private Supabase Storage bucket, accessed via signed URLs.
- [Price-spike alert rules (10-price-spike-alert-rules)](issues/10-price-spike-alert-rules.md) — A fixed 15% increase triggers an alert; checked immediately after each receipt is confirmed; visible to all circle members; an in-app notification list plus a single email batched per receipt; per-product muting not built for now.
- [Low-stock alert rules (11-low-stock-alert-rules)](issues/11-low-stock-alert-rules.md) — A daily scheduled job scans all products; a `low_stock_alert_active` flag ensures only one reminder per episode until it recovers above the threshold; reuses ticket 10's in-app list and email template, also visible to all members.
- [Multi-store price comparison (13-multi-store-price-comparison)](issues/13-multi-store-price-comparison.md) — Confirmed in scope; reuses ticket 06's promotion-filtering and unit-conversion rules, comparing each store's latest normal price; shown as a module on the per-product page next to the price trend chart, not a standalone page; no comparison is shown if the product has only been bought at one store.
- [UI structure & language toggle (14-ui-structure-and-language-toggle)](issues/14-ui-structure-and-language-toggle.md) — Page list (home/photo upload/receipt list/product detail/monthly report/notification center/circle settings); bottom tab-bar navigation plus a floating photo-upload button; bilingual content is shown via a language toggle displaying one language at a time; pixel-level visual design is left for implementation/prototyping. **Amended post-launch**: upload became a normal fifth tab (five even items), Notifications moved to a pinned top-right icon, the receipt list gained per-row delete and a read-only detail page for confirmed receipts, and every date-range picker unified on a year-then-month popover (month-level, not day-precise).
- [Data export & report format (12-data-export-report-format)](issues/12-data-export-report-format.md) — CSV line-by-line export, whole-circle data with a selectable time range; a standalone monthly report page rolls up total spend vs. last month, category breakdown, the price-change leaderboard (reusing ticket 06), alert counts, and per-uploader spending, with the export button living on that same page. **Amended post-launch**: the exportable range is a from-month/to-month picker, not an arbitrary custom start/end date.

## Not yet specified

(None yet.)

## Out of scope

- Pixel-level visual design (fonts, spacing, component styling beyond the color-coding already decided) — ticket 14 settled the page list and information architecture, but exact visual presentation is left for implementation or a later `/prototype` pass; it's not the depth this requirements document is meant to deliver.
