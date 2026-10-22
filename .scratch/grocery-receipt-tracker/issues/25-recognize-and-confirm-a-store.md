Type: grilling
Status: resolved
GitHub: #29
Blocked by: 23, 24

## Question

How does a scanned Receipt end up pointing at the right Store row?

Settled in charting: the AI recognition call splits the header into chain and branch, the user confirms or corrects it in the existing preview flow, and the result is matched against the Circle's existing Stores — the same "AI suggests, human confirms" shape that Product matching already uses (ticket 05).

Open within that:

- The `api/_lib/recognizeReceipt.ts` prompt and response schema change — two new fields, and what the model should return when the header is ambiguous or the branch simply isn't printed.
- Matching: when the AI returns "Woolworths Hornby" and the Circle already has a Woolworths Hornby Store, what makes that a match? Exact string, normalized string, or a candidate list the user picks from?
- The preview UI: a store picker that offers existing Stores of this Circle plus "create a new branch" plus "branch unknown". Where does it sit relative to the existing store-name field?
- Creating a Store is a side effect of confirming a Draft — what happens if the Draft is never confirmed, or is deleted afterwards? Orphan Store rows, or create-on-confirm only?
- Duplicate detection (`src/lib/duplicateCheck.ts`) currently keys on store name + date + amount. Does it key on `store_id` now?
- Does editing a confirmed Receipt (ticket 16) let you change its Store? If so, every price comparison that Receipt participated in shifts underneath — including alerts already raised.
- Whether a Correction to a Store name is recorded in `EditLog` like the other corrections are.

## Answer

Answered by [spec 29](29-branch-level-store-identity.md) (its **[assumption → 25]** decisions), implemented in PR #43.

- **Recognition**: `recognizeReceipt` returns the chain and the branch as separate fields (an empty branch when the header names none), saved on the draft as `receipts.recognized_*`; the raw store-name fields stay.
- **Matching**: exact, on normalized keys within the Circle — case, whitespace, macrons, street-type abbreviations, separators, and chain aliases such as Countdown → Woolworths (`src/lib/storeKey.ts`).
- **Confirmation**: a store picker on the preview screen pre-fills what was read; a branch that matches no Store offers the same chain's Stores to pick from (no closer guess), or creates a new branch.
- **When a Store is created**: on confirm, not on draft save, so an abandoned draft leaves no junk branch; a confirm that fails afterwards takes back the Store it created.
- **Editing**: a confirmed Receipt's Store can be changed with the same picker, logged in `EditLog`; alerts are not re-raised or withdrawn. Editing a receipt that has no Store attaches one.
- **Duplicate detection**: unchanged — raw store name + date + total.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

一张扫进来的小票，怎么最终指向正确的那条 Store 记录？

绘制地图时已定：AI 识别那一步把抬头拆成连锁品牌与分店，用户在现有的预览确认界面里确认或改正，结果再与该 Circle 已有的 Store 列表做匹配——和商品匹配（ticket 05）已经在用的"AI 建议 + 人确认"是同一个形状。

其中待定的：

- `api/_lib/recognizeReceipt.ts` 的 prompt 与返回结构改动——新增两个字段；抬头含糊、或者压根没印分店时，模型应该返回什么。
- 匹配：AI 返回 "Woolworths Hornby"，而圈子里已经有一条 Woolworths Hornby，凭什么判定为同一条？精确字符串、归一化后字符串，还是给出候选列表让用户挑？
- 预览界面：一个门店选择器，列出本圈子已有 Store，外加"新建分店"和"分店未知"。它和现有的店名输入框是什么关系？
- 创建 Store 是"确认 Draft"的副作用——如果 Draft 一直没被确认、或者事后被删了会怎样？会留下孤儿 Store 行吗，还是只在确认时创建？
- 查重（`src/lib/duplicateCheck.ts`）目前按 店名 + 日期 + 金额 判定，现在改成按 `store_id` 吗？
- 编辑已确认的小票（ticket 16）允许改它的 Store 吗？如果允许，这张小票参与过的所有比价都会随之变动——包括已经发出去的提醒。
- 对店名的更正要不要像其他更正那样记进 `EditLog`。

## 答案

由 [spec 29](29-branch-level-store-identity.md) 回答（其中标为 **[assumption → 25]** 的决定），已在 PR #43 实现。

- **识别**：`recognizeReceipt` 把连锁和分店作为分开的字段返回（小票没印分店时分店为空），随草稿存进 `receipts.recognized_*`；原始店名字段保留。
- **匹配**：在 Circle 内按规范化键精确匹配——大小写、空白、长音符号、街道类型缩写、分隔符，以及 Countdown → Woolworths 这类连锁别名（`src/lib/storeKey.ts`）。
- **确认**：预览页的门店选择器预填识别结果；分店匹配不上任何 Store 时，列出同一连锁的 Store 供选择（不做更近的猜测），或新建分店。
- **何时创建 Store**：确认时创建，不在保存草稿时创建，所以放弃的草稿不会留下垃圾分店；确认在之后失败的话，会撤回它刚创建的 Store。
- **编辑**：已确认小票可以用同一个选择器改 Store，记入 `EditLog`；不重新触发也不撤回提醒。编辑一张没有 Store 的小票会给它挂上 Store。
- **查重**：不变——原始店名 + 日期 + 总额。
