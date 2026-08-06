Type: grilling
Status: resolved

## Question

The AI-scanned data is sometimes wrong (name/quantity/price misread, wrong month, wrong weight), but once a receipt is `confirmed`, `ReceiptDetail.tsx` is 100% read-only — there's no way to fix a mistake short of deleting and re-uploading the whole receipt. Needs deciding:

- How much of a confirmed receipt should become editable (which fields)?
- How does date editing fit the app's existing month-only `MonthPickerField`, given `purchase_date` needs day precision?
- How should the weight/volume spec (for items sold by weight, e.g. loose produce) be edited, given only 4 units (`g`/`kg`/`ml`/`l`) are actually recognized by the unit-normalization logic (`src/lib/units.ts`)?
- Who's allowed to edit — same permission model as delete (uploader-only), or looser?
- Does editing need to interact with price-spike alerts, which are computed once at confirm-time and never re-checked?

**Derived information** (from exploring the existing code before asking):
- RLS on `receipts`/`receipt_items` already has **no status check at all** — updating a `confirmed` row is already technically permitted by the database today. The read-only-after-confirm behavior is purely a frontend convention (`ReceiptDetail.tsx`'s own comment says confirming "locks the line items against further edits," but nothing enforces that beyond not building an edit UI).
- `confirmReceipt()`'s per-item update loop (`src/lib/receipts.ts:150-244`) — diff via `diffReceiptItemFields`, log each changed field to `edit_logs`, then write — is generic and not conditioned on receipt status, so it's directly reusable for post-confirmation edits.
- `edit_logs` already has a nullable `receipt_id` alongside `receipt_item_id`, so a receipt-level field (like `purchase_date`) can be logged the same way as an item field, just with `receipt_item_id` null.
- All downstream consumers (price trend, consumption rate, monthly report) compute live from `receipts`/`receipt_items` on every read — none cache derived results, so editing historical data doesn't require any recomputation/invalidation step for those. The one exception is price-spike alerts (see below), which are written once and never revisited.

## Answer

**1. Editable fields**: the same subset already editable pre-confirm (product name EN/ZH, quantity, unit price, promotion flag), **plus**:
- **Purchase date** — receipt-level, editable via `MonthPickerField` (the same component already used for the receipt-list filter and report export range). Month-only editing is intentional and sufficient — the real-world mistake this addresses is a misread month, not a misread day. **Important implementation detail**: `MonthPickerField`'s `onChange` always resets the day-of-month to `1`; naively wiring it up would silently corrupt an already-correct day when the user only meant to fix the month. The edit flow must preserve the existing day-of-month, combining the picker's year/month with the receipt's current day — not defaulting to the 1st.
- **Weight/volume spec** (`unit_spec_value` + `unit_spec_unit`) — but **only shown for items that already have a unit set** (i.e. `unit_spec_unit` is non-null — a weighed/measured item like loose produce). Plain count-based items (`unit_spec_unit` null, e.g. a boxed item) don't show this control at all; only their quantity is editable, same as today.
- The unit itself is a **fixed 4-option dropdown** — `g` / `kg` / `ml` / `L` — not free text. This matches exactly the set `src/lib/units.ts` actually normalizes (`GRAMS_PER_UNIT`/`ML_PER_UNIT`); anything else silently falls through to "each" basis in price-trend/consumption-rate math with no error, so a typo'd unit would quietly corrupt those calculations without anyone noticing. Same "AI can't invent a value outside the fixed list" spirit as the category field (ticket 04).
- Still **not** in scope: `original_price`, `subtotal`, `category`, product match (`matched_product_id`/`product_id`), store name. Left for a future round if it turns out to matter in practice.

**2. UI**: inline editing directly on `ReceiptDetail.tsx` (the confirmed-receipt page itself) — an "Edit" toggle that swaps the read-only display for editable inputs (mirroring `ReceiptReview.tsx`'s field styling), with Save/Cancel. Not a separate route, not a reuse of `ReceiptReview`'s screen.

**3. Permission**: uploader-only, matching the existing delete-receipt permission model exactly. No RLS change needed — `receipts`/`receipt_items`'s existing `uploaded_by = auth.uid()` UPDATE policies already enforce this; the frontend just needs to only show the Edit control to the uploader (same pattern `ReceiptList.tsx` already uses to gate the delete button).

**4. Price-spike alerts are not re-triggered on edit.** Alerts already recorded at confirm-time stay exactly as they are, right or wrong — editing a price afterward doesn't retroactively fix a false alert or backfill a missed one. Kept simple deliberately; only future receipts get checked going forward. (Low-stock's `low_stock_alert_active` flag has the same kind of go-stale-until-next-cron-tick property from editing past quantities, but that's an existing property of the daily cron, not something this ticket needs to address.)

**Consequences for other tickets**: none — this only adds capability to an existing page and reuses existing infrastructure (`diffReceiptItemFields`, `edit_logs`, `MonthPickerField`, the RLS policies) rather than changing any of it. Ticket 14's "confirming locks the line items" line (in its own body, not the map's gist) is now superseded by this ticket.

## Implementation

Built and shipped, TDD throughout (210 tests green, typecheck clean):

- **`src/lib/receipts.ts`**: extracted the per-item diff-then-log-then-update loop out of `confirmReceipt` into a shared `updateReceiptItemsWithLog`, and added `editConfirmedReceipt(receiptId, purchaseDate, items)` on top of it — reuses that loop for items, does its own diff/log/update for `purchase_date`, and deliberately skips status and `recordPriceSpikeAlerts`. `ReceiptDraft` gained an `uploadedBy` field (and `fetchReceiptDraft` now selects `uploaded_by`) so the frontend can gate the Edit control.
- **`src/pages/ReceiptDetail.tsx`**: an `editing` toggle swaps the read-only view for the same per-item field set as `ReceiptReview.tsx` (name EN/ZH, quantity, unit price, promotion), plus a `MonthPickerField` for the purchase month and a conditional weight/volume spec editor (value + a fixed `g`/`kg`/`ml`/`L` `<select>`) shown only when `unitSpecUnit` is already non-null. The Edit button itself only renders when `draft.uploadedBy === session.userId`. Month changes preserve the existing day-of-month via `withMonthKeepingDay` (clamped to the new month's actual last day) rather than resetting to the 1st.
- Not verified against the real deployed app with the real account (no test credentials available to this session) — verification is the test suite above; worth a manual pass next time there's browser access with real login.

