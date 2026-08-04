Type: grilling
Status: resolved

## Question

How should the product category taxonomy be designed?

Needs deciding:

- How many levels the preset taxonomy has (e.g. a two-level structure like "Food-Grains&Oil / Food-Fresh Produce / Household-Cleaning / Household-Personal Care," or a simpler single level).
- Who maintains this category list (a system-fixed preset, or does each circle get to add its own custom categories).
- The granularity and basis for AI auto-categorization (based on the semantics of the product name).
- Whether users can manually correct the AI's categorization, and whether that correction affects future auto-categorization of the same product name (i.e. whether a "memory" mechanism is needed).

The output should be the category list's initial structure and the basic rules for auto-categorization.

## Answer

- **Levels**: two (top-level category + subcategory).
- **Source of the list**: a system-fixed preset shared by all circles; circles cannot add their own custom categories.
- **Scope of AI categorization**: it can only pick the best-matching subcategory from the preset list, and is never allowed to invent a new category.
- **Category-memory mechanism**: once a user manually corrects a product's category, that correction is remembered; the same product name is auto-assigned the corrected category the next time it appears, so it doesn't need to be corrected by hand every time.

**Initial category list (top-level - subcategory; the exact subcategories can be fine-tuned later during development without reopening this ticket):**

- Food - Grains & Oil (rice/grains, cooking oil, flour/dry goods, seasonings/sauces).
- Food - Fresh Produce (meat/poultry/eggs, fruits & vegetables, seafood).
- Food - Dairy & Bakery (milk/dairy, bread/baked goods).
- Food - Snacks & Beverages (snacks, drinks, alcohol).
- Household - Cleaning (laundry detergent, cleaning products, tissues).
- Household - Personal Care (toiletries, cosmetics).
- Baby & Maternity.
- Pet Supplies.
- Other / Uncategorized (the fallback category when AI can't classify or can't recognize the product name).

**Follow-up update (from ticket 09, bilingual-content-strategy)**: the category list itself is a fixed preset, and the Chinese/English pairing is already listed above; the category labels shown in the UI use this bilingual table directly, with no extra translation step needed.

**Updated per ticket 05 ("product matching strategy")**: ticket 05 has now settled the rules for identifying a "standardized product" (the Product table, `product_id`), so the category-memory mechanism's key has migrated from `raw_name` to `product_id` — different wordings of the raw text under the same standardized product all resolve to the same `product_id`, so category memory is naturally unified and no longer depends on text matching.
