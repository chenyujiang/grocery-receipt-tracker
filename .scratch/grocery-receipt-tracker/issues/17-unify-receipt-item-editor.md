Type: grilling
Status: resolved

## Question

`ReceiptReview.tsx` (the pre-confirm safety net, Section 6) and `ReceiptDetail.tsx`'s edit mode (issue 16) both edit the same ReceiptItem fields, and both grew their own copy of the plumbing:

- A **byte-identical** `updateItem<K extends keyof DraftItem>(index, field, value)` in each page.
- The **same 11-field hand-map** from `DraftItem` to `ConfirmReceiptItemUpdate`, written out longhand in each page's save handler.

Needs deciding:

- The hand-map exists only to drop one field (`category`). Where should that strip live?
- The two editors' rendered field sets are *not* identical — Review shows the weight/volume spec read-only, Detail makes it editable; Review shows the category, Detail doesn't. Is that asymmetry intentional, and does it survive unification?
- What is the seam — what new unit, if any, gets its own tests?

**Derived information** (from reading the code before asking):
- `DraftItem` has 12 fields; `ConfirmReceiptItemUpdate` has exactly those 12 minus `category`. The hand-map is `Omit<DraftItem, "category">` spelled out by hand, twice.
- The `category` strip is not incidental — it is spec.md Section 5.2 enforced in code: category lives on `Product`, read via `product_id`, and must never be written back through a ReceiptItem.
- The spec-editor asymmetry traces to issue 16, which deliberately scoped weight/volume editing to the post-confirm flow only. It was a scoping decision, not an argument that pre-confirm editing is wrong.
- Both pages already have full test suites (`ReceiptReview.test.tsx`, 5 cases; `ReceiptDetail.test.tsx`, 7 cases) covering load → edit → save, so they serve as the refactor's safety net.

## Answer

**1. The category strip gets one named home.** `ConfirmReceiptItemUpdate` is redefined as `Omit<DraftItem, "category">`, and a single exported `toItemUpdate(item: DraftItem)` in `src/lib/receipts.ts` performs the conversion. Both pages call it instead of hand-mapping.

Rejected: widening `confirmReceipt`/`editConfirmedReceipt` to accept `DraftItem[]` and ignoring `category` internally. That deletes the map but buries the Section 5.2 rule, and leaves a public API that accepts a field it silently discards — exactly the confusion 5.2 exists to prevent. The rule deserves a name, not an omission.

**2. The field sets converge upward — the weight/volume spec becomes editable in Review too.** This is a deliberate behavior change, not a refactor side effect. If a mis-OCR'd spec (`500g` read as `500kg`) is safe to correct after confirming, it is strictly safer to correct *before* confirming — otherwise the review step, whose whole job is catching OCR errors, hands a known-bad value to the price-trend and consumption-rate math and relies on the user noticing later. Converging also means the shared editor is genuinely one component rather than one component with a mode flag.

The unit remains the fixed `g`/`kg`/`ml`/`L` `<select>` from issue 16, and the spec controls still render only when `unitSpecUnit` is already non-null. Nothing gains a spec it didn't have.

**3. Category stays out of the shared component.** It is not a ReceiptItem field, so it does not belong in a component named for editing ReceiptItem fields — not even read-only. `ReceiptReview.tsx` keeps rendering its own category line at the page level; `ReceiptDetail.tsx`'s edit mode continues not to show one. The component's boundary then matches the domain rule instead of cutting across it.

**4. The seam is the component, not a hook.** `ReceiptItemFields` (props: the `DraftItem` and an `onChange(field, value)`) gets its own test file. `updateItem` itself stays inline in each page: four branchless lines whose extraction into a `useDraftItems` hook would produce a unit whose test asserts nothing but that React's `setState` works. The component, by contrast, has real conditional behavior (the spec controls appear only for a measured item) worth pinning down directly. The page suites keep covering the end-to-end edit-then-save path.

`toItemUpdate` is tested for the invariant that actually matters — that the result carries no `category` key — rather than by field-by-field comparison, which would pass even if the strip broke.

## Known defect, deliberately not fixed here

Editing `quantity` or `unitPrice` does **not** recompute `subtotal`; the stale value is passed straight through and written to the database. So correcting an OCR'd price leaves the line's subtotal disagreeing with `quantity × unitPrice`. This predates the unification — it is duplicated in both pages today and merely becomes a single-site bug afterwards.

Not fixed in this change because whether the recomputation is simply `quantity * unitPrice` depends on promotion-price semantics (when `originalPrice` participates), which is its own discussion. Folding a silent data correction into a structural change would also make the diff lie about what it does.

## Implementation

- **`src/lib/receipts.ts`**: `ConfirmReceiptItemUpdate` becomes `Omit<DraftItem, "category">`; new exported `toItemUpdate(item: DraftItem): ConfirmReceiptItemUpdate`.
- **`src/components/ReceiptItemFields.tsx`** (new): name EN/ZH, quantity, unit price, the conditional spec value + unit `<select>`, promotion checkbox. Controlled — holds no state, takes `item` and `onChange`.
- **`src/pages/ReceiptReview.tsx`**: renders `ReceiptItemFields`, keeps its own category line, drops the hand-map for `items.map(toItemUpdate)`. Gains spec editing (change 2).
- **`src/pages/ReceiptDetail.tsx`**: same substitution in its edit branch; read-only branch untouched.
- Tests: new `src/components/ReceiptItemFields.test.tsx`; a `toItemUpdate` case in `src/lib/receipts.test.ts`; a Review case for the newly editable spec.
