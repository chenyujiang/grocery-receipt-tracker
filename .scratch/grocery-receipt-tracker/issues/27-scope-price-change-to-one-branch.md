Type: grilling
Status: open
GitHub: #31
Blocked by: 24, 26

## Question

Narrow every price-change calculation to one branch, and decide what gets lost in the narrowing.

The current `calculatePriceChange()` in `src/lib/priceChange.ts` takes a Product's last two normal-price Purchases **regardless of Store** — so it already compares across chains, not just across branches. That is the behaviour being fixed, and it is what `CONTEXT.md`'s **Same-Store Price Change** entry already describes but the code does not yet do.

In scope: the product-detail price-change figure (`productDetail.ts`), the 15% Price Spike alerts (`priceSpikeAlerts.ts`), and the monthly report's price-change leaderboard (`priceChangeLeaderboard.ts`) — all three go through the same function.

Open within that:

- Where does the grouping happen? `fetchPurchaseHistories()` is deliberately the single place Purchase History is read; does it start returning `storeId` on each Purchase and leave grouping to callers, or does a new "group by Store" step sit above it? Whatever the shape, it must not reintroduce the N+1 that module exists to prevent.
- With comparison narrowed to one branch, "two normal-price Purchases" becomes much rarer. Fewer alerts is the point — but is the 15% threshold still right when the two Purchases it compares may now be many months apart? Does a staleness cut-off belong here?
- A Product bought at three branches now has three Same-Store Price Changes. What does the product-detail page show — the one for the most recent Purchase's branch, or all of them?
- Same question for the leaderboard: does one Product occupy three rows, or is it ranked by its worst branch?
- Price Spike alerts are raised per Receipt, so the branch is unambiguous there — confirm that, and confirm existing unresolved alerts raised under the old cross-store rule are left standing rather than retro-corrected (ticket 16 set that precedent for edits).
- `compareStores()` in `src/lib/storeComparison.ts` keys on `storeNameEn`; it moves to `store_id`, which is mostly mechanical but changes what "fewer than 2 entries" means.
- The `CONTEXT.md` entries for Same-Store Price Change and Store Comparison get finalized here, alongside the code that finally matches them.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

把所有涨幅计算收窄到单一分店，并想清楚收窄之后会失去什么。

`src/lib/priceChange.ts` 里现在的 `calculatePriceChange()` 取的是某商品最近两次正常价 Purchase，**完全不看是哪家店**——也就是说它不只跨区，连跨连锁都在比。这正是要修的行为，也正是 `CONTEXT.md` 里 **Same-Store Price Change** 词条已经描述、但代码还没做到的事。

范围内：商品详情页的涨幅数字（`productDetail.ts`）、15% 的价格异常提醒（`priceSpikeAlerts.ts`）、月报的涨幅排行榜（`priceChangeLeaderboard.ts`）——这三处走的是同一个函数。

其中待定的：

- 分组在哪一层做？`fetchPurchaseHistories()` 是特意设成"读取 Purchase History 的唯一入口"的；是让它在每条 Purchase 上多返回一个 `storeId`、由调用方自己分组，还是在它之上加一层"按 Store 分组"？无论哪种形状，都不能把那个模块存在的意义——避免 N+1——重新引回来。
- 收窄到单一分店之后，"有两次正常价 Purchase"会稀有得多。提醒变少正是目的——但当被比较的两次购买可能相隔好几个月时，15% 这个阈值还合适吗？要不要在这里加一个"太旧就不比"的时效上限？
- 一个在三家分店都买过的 Product，现在有三个 Same-Store Price Change。商品详情页显示哪一个——最近一次购买所在分店的那个，还是全部列出？
- 排行榜同理：一个 Product 占三行，还是按它最糟的那家分店来排名？
- 价格异常提醒是按小票触发的，所以那里的分店是明确的——确认这一点；并确认在旧的跨店规则下已发出的未读提醒**保持原样**，不做追溯修正（ticket 16 在编辑场景已经立下了这个先例）。
- `src/lib/storeComparison.ts` 的 `compareStores()` 目前按 `storeNameEn` 归组，改成按 `store_id`；这基本是机械改动，但"少于 2 条就不比"的含义会随之变化。
- `CONTEXT.md` 里 Same-Store Price Change 与 Store Comparison 两条词条在这里定稿，和终于与之相符的代码一起。
