Type: bug
Status: ready-for-agent
GitHub: #34

## Problem

`fetchPurchaseHistories` (`src/lib/purchaseHistory.ts`) issues one `.in("product_id", ids)` select with no pagination. PostgREST caps every response at its `max-rows` setting (Supabase default: **1000**) and drops the rest **without an error**. Once the requested products' confirmed `receipt_items` exceed that, every consumer computes from a partial history: price change (S10), price trend, store comparison (S11), consumption rate (S12), price-spike alerts (S13), and the monthly report's leaderboard (S14). The numbers come out wrong and nothing on screen says so.

The cron path is exposed first: it passes `supabaseAdmin` and sweeps every circle in one call, so its row count grows fastest.

A second, related limit: all ids are encoded into the request URL. With a few hundred product ids the URL can exceed the gateway's length limit, and the request fails outright.

At family scale (a few thousand receipt lines a year) this isn't hypothetical.

## Fix

Keep it inside `fetchPurchaseHistories` — that's what the single-entry-point rule exists for; no caller changes.

- Chunk `productIds` into batches small enough to keep the URL safely short.
- Page each batch with `.range()` until a short page comes back, so `max-rows` never truncates.
- Preserve the existing contract: one `PurchaseHistory` per requested id, in request order, each oldest-first, with a stable order for same-date rows.

## Tests (TDD — confirm the seam with the user first)

- More than 1000 matching rows → all of them come back.
- More ids than one batch holds → every id gets its history, still in request order.
- Same-date ordering stays stable across page boundaries.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`fetchPurchaseHistories`（`src/lib/purchaseHistory.ts`）只发一次 `.in("product_id", ids)` 查询，没有分页。PostgREST 每次响应最多返回 `max-rows` 行（Supabase 默认 **1000**），多出的部分直接丢掉，**不报错**。一旦所请求商品的已确认 `receipt_items` 超过这个数，所有下游都会基于不完整的历史计算：价格变化（S10）、价格趋势、多店比价（S11）、消耗速度（S12）、涨价提醒（S13）、月报排行榜（S14）。数字是错的，界面上却看不出来。

最先出问题的是定时任务：它传入 `supabaseAdmin`，一次扫所有圈子，行数增长最快。

另一个相关限制：所有 id 都会编进请求 URL。商品 id 达到几百个时，URL 可能超过网关的长度限制，请求直接失败。

按家庭的规模（一年几千行小票明细），这不是假设的情况。

## 修复

只改 `fetchPurchaseHistories` 内部——"唯一入口"规则就是为此存在的；调用方不需要改。

- 把 `productIds` 分批，每批小到能保证 URL 足够短。
- 每批用 `.range()` 翻页，直到某一页不满为止，这样 `max-rows` 不会截断结果。
- 保持现有约定：每个请求的 id 对应一个 `PurchaseHistory`，按请求顺序返回，每个内部从旧到新排序，同一天的行顺序稳定。

## 测试（TDD——先和用户确认测试接口）

- 匹配行超过 1000 → 全部返回。
- id 数量超过一批 → 每个 id 都拿到自己的历史，仍按请求顺序。
- 跨页时同一天的行顺序保持稳定。
