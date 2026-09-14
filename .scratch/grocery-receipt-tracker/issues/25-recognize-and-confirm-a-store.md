Type: grilling
Status: open
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
