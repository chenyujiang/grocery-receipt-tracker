Type: grilling
Status: resolved
Blocked by: 06

## Question

Multi-store price comparison (the same product's price across different supermarkets) is confirmed in scope — how exactly should it be designed?

Background: the `Product` (standardized product) defined in ticket 05 is scoped per circle, not per store, and `ReceiptItem` links to `Receipt.store_name_en` via `receipt_id` — so a single `product_id` can naturally span purchases from multiple stores. The underlying data structure already supports cross-store comparison; this ticket is mainly about how it's presented and calculated.

Needs to cover:

- Comparison basis — the latest purchase price at each store, the lowest historical price, or an average.
- Whether to reuse the promotion-filtering and unit-conversion rules from ticket 06.
- Where it's shown — a module on the per-product page (alongside ticket 06's price trend chart), or a standalone page.
- What happens when there isn't enough data (the product has only ever been bought at one store).

## Answer

**Comparison basis**: reuses the rules already established in ticket 06 — promotional rows are excluded, and only each store's "latest normal price" is compared, keeping the same basis as the price-change calculation rather than introducing new concepts like "lowest price" or "average price," which would add cognitive overhead.

**Unit conversion**: also reuses ticket 06's unit-conversion rules (weight/volume normalized to per-100g/100ml, count-based units compared directly by `unit_price`), ensuring cross-store comparisons use the same basis.

**Where it's shown**: as a module on the per-product page, right next to ticket 06's price trend chart — when a user opens a standardized product, the same page shows both "has this gone up in price" and "which store is currently cheapest," without needing to navigate to a separate page.

**Handling insufficient data**: if a product has so far only been bought at one store, this module doesn't show a "comparison" — it shows "no purchase records from other stores yet," and the comparison appears once the same product is bought at a different store.
