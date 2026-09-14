Type: bug
Status: resolved
GitHub: #21

## Problem

`api/cron/low-stock-check.ts` built its purchase histories with a `for` loop that issued **one `receipt_items` query per Product**, across every Circle in the database — exactly the N+1 that `fetchPurchaseHistories(client, productIds)` in `src/lib/purchaseHistory.ts` exists to prevent, per CLAUDE.md:

> It issues **one** `.in("product_id", ids)` query, never one per product — if you find yourself writing a `for` loop around a `receipt_items` select, that's the bug this module exists to prevent.

The loop also re-implemented inline the two behaviours that module already owns: dropping rows with no unit spec, and sorting oldest-first.

## Resolution

Fixed by `61176b0` ("Fetch purchase history in one batched query, not one per product"), which routed this handler — along with `receipts.ts`, `monthlyReport.ts` and `productDetail.ts` — through `fetchPurchaseHistories`, and collapsed the duplicate `ProductPriceHistory` type that had been declared twice with different bodies.

## What actually happened (worth keeping)

This was never a bug that got written; it was a bug that got **un-fixed**. The batched integration already existed and was reverted mid-flight across all four call sites, leaving `src/lib/purchaseHistory.ts` sitting untracked in the working tree with nothing importing it. This issue was filed from that intermediate state by a session that could see the N+1 in the handler but not the in-flight work that had removed it — hence the original `needs-triage`, and the note that it was unclear whether the refactor "hadn't happened yet or was lost."

The lesson is about the filing, not the code: when a working tree contains an untracked module that nothing imports, and a handler that looks like it should import it, prefer asking over filing. `api/cron/low-stock-check.test.ts` was written against the reverted per-product shape for the same reason, and had to be re-adapted to the batched query afterwards.

`CHARACTERIZATION, NOT ENDORSEMENT` is gone from that test; `"currently issues one purchase-history query per Product"` is now `"loads every Product's purchase history in one batched query"`, asserting a single batched call rather than pinning the N+1.
