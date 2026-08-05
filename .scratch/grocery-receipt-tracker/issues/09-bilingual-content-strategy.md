Type: grilling
Status: resolved
Blocked by: 03

## Question

The app needs to support Chinese/English bilingual content. The user is based in New Zealand, so receipts are originally in English (from supermarkets like Countdown, New World, PAK'nSAVE); the English text the AI recognizes is the authentic source text. That English needs to be auto-translated into Chinese and saved, so the corresponding version shows up when the language is switched; if a translation is inaccurate, the user can correct the Chinese translation themselves. Which fields need to be bilingual, when translation happens, and how it's stored all need to be decided, with knock-on effects on the already-resolved tickets 03 (data schema) and 04 (category taxonomy).

Needs to cover:

- Whether the bilingual scope covers only dynamic data content, or also fixed UI chrome.
- When translation happens and who performs it (whether it reuses the already-decided multimodal-LLM OCR call).
- The storage structure for bilingual fields in the database.
- How a user's correction to a translation is recorded.

## Answer

- **Bilingual scope**: limited to **dynamic data content** the user enters or that gets recognized (product names, store names, category labels). Fixed UI chrome (menus, buttons, etc.) is **English-only** — no Chinese/English switch, no separate i18n framework needed, minimizing the work involved.
- **Translation direction and timing**: receipt text is originally English (New Zealand supermarkets); when the AI recognizes the receipt (reusing the multimodal-LLM OCR call already decided in ticket 03), that same call also translates the recognized English text into Chinese, with no separate translation API needed, keeping cost and latency to a minimum.
- **Storage structure**: bilingual fields are split into two columns, such as `name_zh` / `name_en`, rather than packed into a single JSON field. `name_en` is the authentic text as recognized by OCR; `name_zh` is the AI-translated version.
- **User correction mechanism**: `name_en` is the source text, so OCR errors in it go through the review/EditLog flow already established in ticket 03; if a user finds the **Chinese translation** inaccurate, they can manually edit the `name_zh` field, and that change is likewise recorded in the EditLog defined in ticket 03 (field name, old value, new value, editor, timestamp).

**Knock-on updates to already-resolved tickets:**

1. **Ticket 03 (data schema)** needs to be extended:
   - `Receipt.store_name` is split into `store_name_zh` / `store_name_en`, with `store_name_en` being the OCR-recognized source text.
   - `ReceiptItem.raw_name` is split into `raw_name_zh` / `raw_name_en`, with `raw_name_en` being the OCR-recognized source text.
   - Corrections to both field pairs go through EditLog.

2. **Ticket 04 (category taxonomy)** needs English names added to the existing 9 top-level categories (subcategories to be added later during development); the English names are the taxonomy's original definition, with Chinese as the translation:
   - Food - Grains & Oil
   - Food - Fresh Produce
   - Food - Dairy & Bakery
   - Food - Snacks & Beverages
   - Household - Cleaning
   - Household - Personal Care
   - Baby & Maternity
   - Pet Supplies
   - Other / Uncategorized

**A note for ticket 05 ("product matching strategy")**: receipt text is originally English, so the matching logic should be based primarily on `raw_name_en` (the English source text); `raw_name_zh` is a translation for display only and shouldn't factor into the matching decision.

## Post-launch amendment

Once real screens existed with translated data content next to an English-only shell, the English-only-chrome scope call above stopped feeling right — the user asked to widen it to full-chrome translation. Fixed UI chrome is now translated too, via a hand-written EN/ZH dictionary (`src/lib/i18n.ts`, `translate(language, key, params?)`), wired through `LanguageProvider`'s `t()` alongside the existing `language`/`setLanguage`. The single toggle on the circle settings page now drives both dynamic content and chrome language together — see spec.md Section 7 for current behavior.
