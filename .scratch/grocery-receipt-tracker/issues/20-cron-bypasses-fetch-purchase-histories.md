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

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`api/cron/low-stock-check.ts` 曾用一个 `for` 循环构建购入历史，对数据库中所有 Circle 的**每一个 Product 各发一次 `receipt_items` 查询**——这正是 `src/lib/purchaseHistory.ts` 中 `fetchPurchaseHistories(client, productIds)` 要防止的 N+1，CLAUDE.md 明确写着：

> 它只发**一次** `.in("product_id", ids)` 查询，绝不每个商品发一次——如果你发现自己在给 `receipt_items` 的 select 套 `for` 循环，那正是这个模块存在的意义所在。

该循环还把这个模块本就负责的两项行为内联重写了一遍：丢弃没有单位规格的行，以及按时间从旧到新排序。

## 解决

由 `61176b0`（"Fetch purchase history in one batched query, not one per product"）修复：该提交把这个 handler——连同 `receipts.ts`、`monthlyReport.ts` 和 `productDetail.ts`——统一改为经由 `fetchPurchaseHistories`，并合并了此前被声明过两次、且两处内容不一致的重复 `ProductPriceHistory` 类型。

## 实际经过（值得留存）

这从来不是一个被写出来的 bug，而是一个被**反做掉**的修复。批量化的整合原本已经存在，却在进行途中于全部四个调用点被回退，只留下 `src/lib/purchaseHistory.ts` 以未跟踪文件的形式躺在工作区，没有任何地方 import 它。本条目正是在那个中间状态下被提出的——提出者能看到 handler 里的 N+1，却看不到那份已经消除了它的进行中工作，所以当初标为 `needs-triage`，并注明无法确定重构是「还没做」还是「做了但丢了」。

这里的教训关乎提单方式，而非代码本身：当工作区里出现一个未跟踪、且无人 import 的模块，同时又有一个看上去本该 import 它的 handler 时，应当先问，而不是先提单。`api/cron/low-stock-check.test.ts` 也是出于同样的原因，按回退后的「每个商品一次查询」的形态写成，事后不得不重新适配为批量查询。

那个测试中的 `CHARACTERIZATION, NOT ENDORSEMENT` 已经移除；`"currently issues one purchase-history query per Product"` 现已改为 `"loads every Product's purchase history in one batched query"`，断言的是一次批量调用，而不再是把 N+1 钉死。
