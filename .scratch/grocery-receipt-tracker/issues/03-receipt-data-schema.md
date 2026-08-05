Type: grilling
Status: resolved

## Question

After calling a multimodal LLM to recognize a receipt, exactly which structured fields should be extracted, and how should low-confidence or incorrect recognition be handled?

Must cover at least:

- Store name, purchase date.
- Each product's name, quantity, spec/unit (e.g. 500g, 1L, 1 piece), unit price, and subtotal.
- The receipt's total amount, and whether there are any discount/promotion lines.

Also needs deciding:

- Whether a manual-correction interface is provided when recognition fails or the user thinks it's wrong; how corrected data overrides the original AI output, and whether a change history is kept.
- Whether the original receipt photo is kept, and for how long.

The output should be the app's standardized product-record data structure (fields, types, required or optional).

## Answer

**Flow**: photo upload → AI produces a draft (status = pending_review) → the user reviews and corrects each line on a preview screen → once confirmed, status = confirmed and it counts toward statistics; there's no separate "low confidence" flag — the review step is the safety net for everything. Any edit made along the way is written to the change history.

**How photo upload is implemented (added later)**: the web version can just use the standard `<input type="file" accept="image/*">` file-picker control; mobile browsers (iOS Safari / Android Chrome) automatically pop up a system menu offering both "take photo" and "choose from library," so there's no need to build a custom camera viewfinder UI with `getUserMedia` — less development effort and better compatibility.

**Correction (found in production)**: the `capture="environment"` attribute mentioned in the original plan above turned out to be a mistake — on most mobile browsers, setting `capture` skips the "take photo / choose from library" chooser entirely and jumps straight into the camera, which is exactly what hides the library option this ticket wanted preserved. It's been removed from the actual `<input>`.

**Receipt**

- `id`
- `circle_id` (which circle it belongs to, see ticket 02).
- `uploaded_by` (the login email, i.e. "who uploaded it," per the buyer-field decision in ticket 02).
- `store_name_zh` / `store_name_en` (store name, bilingual, see ticket 09; `store_name_en` is the OCR-recognized English source text, `store_name_zh` is the translated version).
- `purchase_date` (purchase date).
- `total_amount` (the receipt's total amount).
- `original_image_url` (the original image's address, cleared after the retention period — see "Original photo policy" below).
- `uploaded_at`
- `status` (pending_review / confirmed).

**ReceiptItem**

- `id`, `receipt_id`.
- `raw_name_zh` / `raw_name_en` (the AI-recognized product name, bilingual, see ticket 09; `raw_name_en` is the OCR-recognized English source text, `raw_name_zh` is the translated version; ticket 05's product-matching decision is based primarily on `raw_name_en`).
- `quantity` (quantity).
- `unit_spec_value` + `unit_spec_unit` (the spec split into a numeric value and a unit, e.g. 500 / g, to make later unit conversion easier).
- `unit_price` (the actual transacted unit price).
- `original_price` (the original price, nullable; only filled when a struck-through price or promotion marker is recognized).
- `is_promotion` (boolean, whether it's a promotional price).
- `subtotal` (line subtotal).
- ~~`category` (category, detailed in ticket 04)~~ — **superseded by ticket 05's `Product` table**: category is stored solely on `Product.category` and read via `product_id`; `ReceiptItem` no longer keeps its own copy of this field (otherwise the same product's category would be duplicated across records and drift out of sync when corrected). This inconsistency was caught and fixed while assembling spec.md.

**EditLog**

- `id`, the associated `receipt_id`/`receipt_item_id`.
- `field_name`, `old_value`, `new_value`.
- `edited_by` (login email), `edited_at`.

**Original photo policy**: images are stored in Supabase Storage and auto-cleaned after 12 months by default (only the images are cleared; structured data is kept forever); the retention period can be adjusted later in settings.

**Follow-up update (from ticket 09, bilingual-content-strategy)**: both `store_name` and `raw_name` are split into `_zh` / `_en` columns. Since receipts are originally in English (New Zealand supermarkets), it's the `_en` value that is the authentic OCR source text, while `_zh` is the Chinese translation produced by that same multimodal-LLM call; user corrections to the **Chinese translation** (the `_zh` field) go through the same EditLog mechanism described above.
