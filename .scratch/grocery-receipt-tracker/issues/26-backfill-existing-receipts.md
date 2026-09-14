Type: task
Status: open
GitHub: #30
Blocked by: 24

## Question

Every Receipt already in the live database carries a store name and no branch. What do they become once Stores exist?

This is manual work that a decision waits on: ticket 27's comparison rules can't be judged fair until we know what the existing rows look like under the new model.

- The obvious backfill is one Store per distinct `store_name_en` per Circle, branch unknown. That is safe — nothing gets falsely merged — but it means most Products lose their price history for comparison purposes on day one, because their past Purchases all sit in an "unknown branch" bucket.
- The alternative is asking the user to assign the real branch to their existing Receipts, which is only tractable if the row count is small. **Find out the actual count first** (Receipts per Circle, distinct store names) before proposing either.
- If some historical store names already embed the branch ("Countdown Hornby"), can the backfill split them? What is the failure mode if it splits one wrong?
- Are original receipt photos still in Storage for the older Receipts (12-month retention, per ticket 03), so a branch could be re-read from the image?
- Whatever runs must be a migration in `supabase/migrations/` with a local copy, applied through the Supabase MCP tools.

Record in the answer what was actually run and the resulting counts — ticket 27 depends on those numbers.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

线上数据库里已有的每一张小票都只有店名、没有分店。Store 实体建好之后，它们变成什么？

这是一张"有决定在等它"的手工活 ticket：不知道存量数据在新模型下长什么样，ticket 27 的比价规则就没法判断是否合理。

- 最直白的回填方式是：每个 Circle 里每个不同的 `store_name_en` 建一条 Store，分店未知。这是安全的——不会把不该合并的合并掉——但代价是绝大多数 Product 在上线第一天就失去了可用于比价的价格历史，因为它们过去的 Purchase 全落在"未知分店"这个桶里。
- 另一条路是请用户给已有小票逐一指定真实分店，这只有在行数不多时才可行。**先查清实际数量**（每个 Circle 的小票数、不同店名数），再来提方案。
- 如果部分历史店名本身就含了分店（"Countdown Hornby"），回填能不能把它拆开？拆错一条的后果是什么？
- 较早那批小票的原始照片是否还在 Storage 里（ticket 03 定的保留 12 个月），从而可以从图上重新读出分店？
- 无论跑什么，都必须是 `supabase/migrations/` 里的一支迁移、本地留底、通过 Supabase MCP 工具应用。

在答案里记下实际执行了什么以及结果行数——ticket 27 要用这些数字。
