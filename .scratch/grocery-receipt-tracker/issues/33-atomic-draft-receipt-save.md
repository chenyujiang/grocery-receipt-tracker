Type: bug
Status: ready-for-agent
GitHub: #37

## Problem

`saveDraftReceipt` (`api/_lib/saveDraftReceipt.ts`) writes a recognized receipt as three separate, non-transactional steps: insert the `receipts` row, create a `products` row for each unmatched item, then insert the `receipt_items`. A failure partway leaves debris:

- a `pending_review` receipt with no items,
- products that no receipt item points at,
- the uploaded image in Storage (see also ticket 38).

The unmatched-item products are created inside `Promise.all`, so two lines on one receipt for the same new product (e.g. the same item scanned twice) create **two duplicate Products** in the circle.

## Fix

Move the whole write into one Postgres function called via RPC, the same pattern as `merge_users_into_new_circle`: insert the receipt, create each distinct new product once, and insert the items, all in one transaction. Lock it down to the service role like the merge function. Save the migration under `supabase/migrations/` and update `src/types/database.types.ts` in the same commit.

Within one receipt, dedupe new products by name before creating them.

## Tests

- A failure on the items insert leaves no receipt and no new products behind.
- Two unmatched items with the same English name produce one Product, and both items point at it.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`saveDraftReceipt`（`api/_lib/saveDraftReceipt.ts`）把识别结果分三步写入，中间没有事务：插入 `receipts` 行，为每个没匹配到的明细新建 `products` 行，再插入 `receipt_items`。中途任何一步失败都会留下垃圾数据：

- 一张没有明细的 `pending_review` 小票；
- 没有任何明细指向的商品；
- 已经上传到 Storage 的图片（另见 ticket 38）。

没匹配到的商品是在 `Promise.all` 里并发创建的。所以同一张小票上如果有两行是同一个新商品（比如同一件商品扫了两次），圈子里会建出**两个重复的 Product**。

## 修复

把整个写入挪进一个通过 RPC 调用的 Postgres 函数，做法和 `merge_users_into_new_circle` 一样：在同一个事务里插入小票、每个不同的新商品只建一次、插入明细。像合并函数一样，限制为只有 service role 能调用。迁移文件存到 `supabase/migrations/`，并在同一个 commit 里更新 `src/types/database.types.ts`。

同一张小票内，新建商品前先按名称去重。

## 测试

- 插入明细失败时，不留下小票，也不留下新商品。
- 两行英文名相同、都没匹配到的明细只产生一个 Product，两行都指向它。
