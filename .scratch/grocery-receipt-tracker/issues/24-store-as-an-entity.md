Type: grilling
Status: resolved
GitHub: #28

## Question

Promote Store from a string on a Receipt to a real entity that carries its branch. What is its shape, and what makes two Receipts "the same Store"?

Today `CONTEXT.md` says a Store is nothing but the name printed on the Receipts that name it, and `receipts.store_name_en/_zh` is the whole of it. That definition has to change: a `stores` table, Circle-scoped, holding the chain and the branch bilingually, with `receipts.store_id` pointing at it.

Open within that:

- Exactly which columns — chain name (`_en`/`_zh`), branch name (`_en`/`_zh`), anything else? Does a "chain" deserve its own row, or is it just a text column on the Store?
- Is a Store Circle-scoped (each Circle builds its own list) or global across Circles? Circle-scoped matches how Products already work and keeps RLS simple; global would share correction work between families but crosses a privacy boundary.
- What is the uniqueness constraint that stops the same branch existing twice in one Circle?
- How is the "unknown branch" case represented — a null branch on a Store row, or a distinct Store row per chain meaning "chain, branch unknown"? Settled already: an unknown-branch Store is never merged with a named one for comparison purposes.
- What does `receipts.store_name_en/_zh` become — dropped, or kept as the raw OCR Source Text alongside the resolved `store_id` (the way `receipt_items` keeps its own name next to `product_id`)?
- Migration mechanics: `supabase/migrations/`, plus the same-commit update to `src/types/database.types.ts` (hand-derived, so a missed column silently degrades every query to `any`).
- The `CONTEXT.md` rewrite of **Store**, and whether **Branch** earns its own glossary entry or stays a part of Store.

This is the ticket every other one in this map hangs off.

## Answer

Answered by [spec 29](29-branch-level-store-identity.md) (its **[assumption → 24]** decisions), implemented in PR #43 (`feat/branch-level-stores`).

- **Shape**: a Circle-scoped `stores` table — `chain_name_en/_zh`, `branch_name_en/_zh`, plus the normalized match keys `chain_key`/`branch_key` (computed by `src/lib/storeKey.ts`). The chain is a column on the Store, not a table of its own.
- **Same Store**: `unique nulls not distinct (circle_id, chain_key, branch_key)` — one row per branch per Circle, matched on normalized keys rather than printed text.
- **Unknown branch**: a null branch, as its own Store row; it is never compared against a named branch.
- **`receipts.store_name_en/_zh`**: kept as the raw header text read off that receipt, beside the new `receipts.store_id` (a composite FK, so a receipt can only point at a Store in its own Circle).
- **Migration**: `supabase/migrations/20261010000001_stores.sql`, with `src/types/database.types.ts` updated in the same change.
- **Glossary**: `CONTEXT.md`'s **Store** is rewritten, and **Chain** and **Branch** have their own entries.
- **Amended after implementation**: a Store's names are shown in English only; the `_zh` columns stay but are left null (`20261010000003_clear_store_chinese_names.sql`).

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

把 Store 从"小票上的一串字"升级成真正的实体，并让它带上分店信息。它的形状是什么？两张小票在什么条件下算"同一家 Store"？

现在 `CONTEXT.md` 写的是：除了印在小票上的名字之外，应用不为 Store 保留任何记录——`receipts.store_name_en/_zh` 就是全部。这个定义必须改：新建 `stores` 表，按 Circle 隔离，双语保存连锁品牌与分店，`receipts.store_id` 指过去。

其中待定的：

- 具体哪些列——连锁名（`_en`/`_zh`）、分店名（`_en`/`_zh`）、还有别的吗？"连锁"值得单独一张表，还是只是 Store 上的一个文本列？
- Store 是按 Circle 隔离（每个圈子各自攒一份列表），还是跨 Circle 全局共享？按 Circle 隔离和 Product 现在的做法一致、RLS 也简单；全局共享能让各家复用彼此的纠错成果，但跨越了隐私边界。
- 用什么唯一约束防止同一个圈子里出现两条重复分店？
- "未知分店"怎么表示——Store 行上分店字段为 null，还是每个连锁一条"分店未知"的独立 Store 行？已定：未知分店的 Store 在比价上永远不与任何具名分店合并。
- `receipts.store_name_en/_zh` 何去何从——删掉，还是作为 OCR 原文保留在已解析的 `store_id` 旁边（就像 `receipt_items` 在 `product_id` 旁边保留自己那份名字）？
- 迁移机制：写进 `supabase/migrations/`，并在同一个 commit 里更新 `src/types/database.types.ts`（它是手工从迁移推导的，漏一列就会让所有查询悄悄退化成 `any`）。
- 改写 `CONTEXT.md` 里的 **Store** 词条；以及 **Branch（分店）** 是否值得单列一个词条，还是留在 Store 里面讲。

这是本地图里其他所有 ticket 都挂在上面的那一张。

## 答案

由 [spec 29](29-branch-level-store-identity.md) 回答（其中标为 **[assumption → 24]** 的决定），已在 PR #43（`feat/branch-level-stores`）实现。

- **形状**：按 Circle 隔离的 `stores` 表——`chain_name_en/_zh`、`branch_name_en/_zh`，加上规范化匹配键 `chain_key`/`branch_key`（由 `src/lib/storeKey.ts` 计算）。连锁是 Store 上的一列，不单独建表。
- **同一家 Store**：`unique nulls not distinct (circle_id, chain_key, branch_key)`——每个 Circle 每个分店一行，按规范化后的键匹配，而不是按印出来的文字。
- **未知分店**：分店为 null，自成一条 Store 行；永远不与具名分店比较。
- **`receipts.store_name_en/_zh`**：保留，存这张小票上读到的原始店名，旁边是新的 `receipts.store_id`（复合外键，保证小票只能指向本 Circle 的 Store）。
- **迁移**：`supabase/migrations/20261010000001_stores.sql`，`src/types/database.types.ts` 在同一次改动里更新。
- **词汇表**：`CONTEXT.md` 改写了 **Store**，并新增 **Chain**、**Branch** 词条。
- **实现后修订**：Store 名称只显示英文；`_zh` 列保留但留空（`20261010000003_clear_store_chinese_names.sql`）。
