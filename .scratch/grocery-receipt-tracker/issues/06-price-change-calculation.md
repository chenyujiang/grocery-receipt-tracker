Type: grilling
Status: resolved
Blocked by: 05

## Question

How should the monthly price comparison and percentage change be calculated and displayed? (This also underpins the "hidden price-hike detection" feature.)

Needs deciding:

- Whether the change is measured "against the last purchase price" or "against a historical average (e.g. the trailing 3-month average)."
- When a product's spec changes (e.g. 500g to 400g), how to convert it into a common unit price (e.g. price per 100g) to judge the real change.
- Exactly what the page displays (a leaderboard of price changes, a per-product price trend chart, color rules for positive/negative changes, etc.).
- Whether promotions/temporary discounts could distort the change calculation (e.g. buying at a promotional price, then the price reverting next time — would that be misread as a "spike"?).

The output should be the price-change formula and the information structure of the monthly comparison page.

## Answer

**Comparison baseline**: compare against the last purchase price rather than a historical average — the most intuitive approach, and it matches the original requirement description.

**Handling promotions**: rows with `is_promotion = true` are excluded from the calculation — both the baseline and the current price are taken only from normal-price (`is_promotion = false`) records. If the most recent purchase happens to be a promotional one, the calculation looks further back for the nearest non-promotional record to use as the baseline, avoiding a false "spike" reading when a promo price reverts to normal.

**Unit conversion**: normalized to a common base unit based on the type of `unit_spec_unit` before comparing:

- Weight units (g / kg) are normalized to a "price per 100g" basis.
- Volume units (ml / L) are normalized to a "price per 100ml" basis.
- Count-based units (each/pack, and other units that can't be subdivided) are not normalized — `unit_price` itself is compared directly, since "per item" is already the smallest comparable unit.
- The conversion table (a static mapping of unit type/ratio, e.g. kg→1000g, L→1000ml) is maintained during development; it doesn't need to be exhaustively enumerated in this ticket — that's an implementation detail.

**Price-change formula**: `change % = (this purchase's normalized unit price − baseline's normalized unit price) / baseline's normalized unit price × 100%`, with both values selected using the promotion-filtering and unit-conversion rules above.

**What the monthly comparison page shows**:

- **Price-change leaderboard**: a ranking of products with the largest price increases this month (confirmed records whose `purchase_date` falls in the current month), grouped by `product_id`, one row per standardized product.
- **Per-product price trend chart**: clicking into a standardized product shows a line chart of its normalized unit price across all historical purchase records over time; promotional records are marked with a different point style (e.g. hollow dots) so they aren't misread as genuine price movement.
- **Color coding**: price increases are shown in red, decreases in green, for quick visual distinction.
