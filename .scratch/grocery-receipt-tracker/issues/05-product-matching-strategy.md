Type: grilling
Status: resolved
Blocked by: 03

## Question

How do we decide that a line item on two different receipts is "the same product," so we can do cross-month unit-price comparison and consumption-rate tracking?

Product names on supermarket receipts are often not identical (e.g. the same milk showing up as "Anchor Blue Milk 2L" on one receipt and "Anchor Milk Blue Top 2L" on another, or abbreviations and internal codes), and the same product may change its spec (2L becoming 1L).

A matching strategy needs to be decided:

- Whether to rely on AI semantic-similarity judgment.
- Whether to bring in product barcodes (not feasible if the receipt has no barcode).
- Whether the user needs to manually confirm/merge "this is the same product" after recognition.
- Whether a product whose spec has changed counts as "the same product with a new spec" or "a new product."

The output should be the product-matching/deduplication rules, plus any necessary user-interaction points.

**Derived information (from ticket 04, category-taxonomy)**: the category-memory mechanism currently keys off normalized `raw_name` text. Once this ticket settles the rules for a "standardized product," if it produces a standard-product ID that's more stable than raw text, category memory should switch to keying off that ID instead of continuing to match on the text name.

**Derived information (from ticket 09, bilingual-content-strategy)**: `raw_name` in ticket 03's data schema is now split into `raw_name_zh` / `raw_name_en`. Since receipt text is originally English (New Zealand supermarkets), the matching logic here should be based primarily on `raw_name_en` (the English source text); `raw_name_zh` is only a translation for display and doesn't participate in the matching decision.

## Answer

**Execution**: as the AI recognizes a receipt (or immediately after), it compares the newly recognized `raw_name_en` against the circle's existing list of standardized products via semantic similarity, producing a suggested match ("this might be the XX you bought before" or "this looks like a new product"); the user confirms or changes this suggestion right within the preview/confirm flow already established in ticket 03, with no extra steps added.

**Barcodes**: not handled. The user is in New Zealand, and New Zealand supermarket receipts typically don't print barcodes either, so no field needs to be reserved for this.

**Spec changes**: still counts as the same product — spec is just an attribute of each purchase record (ReceiptItem) and doesn't affect the product-matching decision; different purchase records under the same standardized product can have different `unit_spec_value`/`unit_spec_unit` values, which is exactly the data foundation ticket 06 (price-change calculation) needs for hidden price-hike detection.

**New data structure: Product (standardized product, scoped per circle)**

- `id`, `circle_id` (a standardized product is a per-circle concept; different circles don't affect each other).
- `canonical_name_en` / `canonical_name_zh` (the standardized product name once confirmed by the user, bilingual, following the bilingual field design from ticket 09).
- `category` (category, per ticket 04).
- `created_at`
- `low_stock_alert_active` (boolean, see ticket 11; flags whether this product is currently in an "already alerted, hasn't recovered yet" state, preventing the same low-stock episode from triggering a repeat reminder every day).

**New field on ReceiptItem**: `product_id`, linking to the Product above; `raw_name_en`/`raw_name_zh` are still kept as "the raw text recognized this time," while `product_id` is "which standardized product this line item is judged to belong to." Ticket 06 (price-change calculation) and ticket 07 (consumption-rate calculation) will both group and aggregate by `product_id`, not by text name.

**Follow-up update (for reference by ticket 04, category-taxonomy)**: the category-memory mechanism's key should migrate from `raw_name` to `product_id`, since `product_id` is the stable standardized-product identifier; different wordings of `raw_name_en` under the same standardized product (like the two Anchor milk examples above) will all resolve to the same `product_id`, so category memory is naturally unified without depending on text matching anymore.
