Type: bug
Status: resolved
GitHub: #40
Related: 30

## Problem

`api/cron/low-stock-check.ts` has two problems, both of which get worse as data grows.

**Silent truncation.** It loads every circle's products with one unpaginated `.from("products").select(...)`. PostgREST's `max-rows` (default 1000) caps that response just as it caps the purchase-history query in ticket 30, so once the whole database has more than 1000 products, the rest are **never checked** and no error is raised. It then passes every id at once to `fetchPurchaseHistories`, which hits both of ticket 30's limits (row cap and URL length) at their worst.

**Not safe to re-run.** The run inserts `alerts` rows, then sets `low_stock_alert_active = true` as a separate statement. If the second step fails, the alerts exist but the flag doesn't, so the next day's run raises the same alerts again.

## Fix

- Process circle by circle (or in fixed-size batches of products), paginating the products query.
- Make "insert alert + set flag" one transaction (a Postgres function via RPC), so a failure leaves neither behind.
- Ticket 30's fix to `fetchPurchaseHistories` is a prerequisite for the history side; this ticket covers the cron's own products query and its write path.

## Tests

- More than 1000 products → all of them are checked.
- A failure between the alert insert and the flag update leaves no alert behind, so a re-run doesn't duplicate it.

## Resolution

`api/cron/low-stock-check.ts` now pages through products by keyset (`order("id")`, `.limit(POSTGREST_PAGE_SIZE)`, `.gt("id", lastId)`), so it no longer stops at PostgREST's row cap. Flagging and alerting moved into one Postgres function, `record_low_stock_alerts(p_product_ids uuid[])` (`supabase/migrations/20261022000001_record_low_stock_alerts.sql`, applied live): one statement flags only Products not already flagged and inserts an Alert for each, reading `circle_id` from the Product. A failure leaves neither half behind, and a re-run or overlapping run can't duplicate an Alert. The cron's `newAlerts` count sums the function's return values, so it reports rows actually written; a test covers a re-run writing fewer. Service-role-only EXECUTE.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`api/cron/low-stock-check.ts` 有两个问题，数据越多越严重。

**悄悄截断。** 它用一次没有分页的 `.from("products").select(...)` 读出所有圈子的商品。PostgREST 的 `max-rows`（默认 1000）会截断这次响应，和 ticket 30 里购买历史查询被截断是同一个原因。所以整个数据库的商品超过 1000 个后，多出的商品**根本不会被检查**，也不会报错。随后它把所有 id 一次性交给 `fetchPurchaseHistories`，正好在最糟糕的情况下同时撞上 ticket 30 的两个限制（行数上限和 URL 长度）。

**不能安全重跑。** 任务先插入 `alerts` 行，再用另一条语句把 `low_stock_alert_active` 设为 `true`。如果第二步失败，提醒已经存在但标记没写上，第二天运行时会把同样的提醒再发一遍。

## 修复

- 按圈子逐个处理（或按固定大小分批处理商品），商品查询要分页。
- 把"插入提醒 + 设置标记"放进同一个事务（通过 RPC 调用的 Postgres 函数），失败时两者都不留下。
- 购买历史那一侧依赖 ticket 30 对 `fetchPurchaseHistories` 的修复；本 ticket 负责定时任务自己的商品查询和写入路径。

## 测试

- 商品超过 1000 个 → 全部被检查。
- 在插入提醒和更新标记之间失败时，不留下提醒，重跑不会重复。

## 解决方案

`api/cron/low-stock-check.ts` 现在按 keyset 分页遍历 products（`order("id")`、`.limit(POSTGREST_PAGE_SIZE)`、`.gt("id", lastId)`），不会再停在 PostgREST 的行数上限。打标记和写提醒合进一个 Postgres 函数 `record_low_stock_alerts(p_product_ids uuid[])`（`supabase/migrations/20261022000001_record_low_stock_alerts.sql`，已在线上应用）：一条语句只给还没打标记的 Product 打标记，并为每个插入一条 Alert，`circle_id` 从 Product 本身读。失败时两半都不会留下；重跑或并发运行也不会产生重复 Alert。cron 的 `newAlerts` 计数累加函数返回值，报的是真正写入的行数；有测试覆盖重跑时写入更少。EXECUTE 只授予 service_role。
