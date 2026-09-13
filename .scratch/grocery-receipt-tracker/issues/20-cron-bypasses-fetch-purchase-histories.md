Type: bug
Status: needs-triage

## Problem

`api/cron/low-stock-check.ts` builds its purchase histories with a `for` loop that issues **one `receipt_items` query per Product**, across every Circle in the database:

```ts
for (const product of products ?? []) {
  const { data: rows, error } = await supabaseAdmin
    .from("receipt_items")
    .select("quantity, unit_spec_value, unit_spec_unit, receipts!inner(purchase_date, status)")
    .eq("product_id", product.id)
    …
}
```

That is exactly the N+1 that `fetchPurchaseHistories(client, productIds)` in `src/lib/purchaseHistory.ts` exists to prevent, per CLAUDE.md:

> It issues **one** `.in("product_id", ids)` query, never one per product — if you find yourself writing a `for` loop around a `receipt_items` select, that's the bug this module exists to prevent.

`fetchPurchaseHistories` already takes the client as a parameter specifically so `/api` can pass `supabaseAdmin` and sweep every Circle, which is what this route wants.

The module also drops rows with no unit spec and sorts oldest-first, both of which this loop re-implements inline — so the duplication is behavioural, not just structural.

## Uncertainty (hence needs-triage, not ready-for-agent)

At the time of writing, `src/lib/purchaseHistory.ts` exists untracked in the working tree and this handler is at its committed HEAD state, with no import of it. It's unclear whether:

- the refactor was in progress and this file simply hadn't been converted yet, or
- it was converted and the change was lost.

Worth confirming before acting — the fix itself is small (delete the loop, call `fetchPurchaseHistories(supabaseAdmin, ids)`), but it should land with whoever owns that in-flight work rather than conflicting with it.

## Fix

Replace the loop with a single `fetchPurchaseHistories(supabaseAdmin, productRows.map(p => p.id))` call, map the results back onto the `ProductConsumptionCheck` list, and delete the now-dead `ReceiptItemHistoryRow` interface. Then replace `low-stock-check.test.ts`'s `"currently issues one purchase-history query per Product"` characterization test — and the inline normalization tests that go with it — with a single assertion that the module was called once with every Product id.
