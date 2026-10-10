Type: task
Status: ready-for-agent
GitHub: #42

## Problem

Three smaller issues in `api/receipts/recognize.ts`, none urgent:

1. **Orphaned images.** The image is uploaded to Storage *before* Claude is called. If recognition or the draft save fails, the image stays in the `receipts` bucket with no receipt pointing at it.
2. **Prompt grows with the circle.** Every call sends the circle's full product list (`id: name` per line) so Claude can suggest matches. Input tokens, and so cost per receipt, grow linearly with the number of products.
3. **Raw database errors reach the client.** `extractErrorMessage` returns a `PostgrestError`'s own message as the 500 body, which can expose table, column and constraint names. Low risk for a family-only app, but untidy.

## Fix

1. On any failure after the upload, delete the uploaded object (best effort, logged). Or upload only after recognition succeeds, if the review page doesn't need the image earlier.
2. No action yet. Revisit when a circle reaches a few hundred products: pre-filter candidates (e.g. by name similarity) before sending, rather than relaxing the Haiku 4.5 pin.
3. Log the raw error server-side (already done via `console.error`) and return a generic message for database errors, keeping the specific messages that were written for users (bad photo, long receipt, access refusal). If this changes `extractErrorMessage`, change `src/lib/errorMessage.ts` to match, per CLAUDE.md.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`api/receipts/recognize.ts` 里有三个较小的问题，都不紧急：

1. **孤立图片。** 图片在调用 Claude *之前*就上传到了 Storage。如果识别或草稿保存失败，图片会留在 `receipts` bucket 里，没有任何小票指向它。
2. **提示词随圈子变大。** 每次调用都会把圈子里所有商品（每行一个 `id: 名称`）发给 Claude，用来建议匹配。输入 token 以及每张小票的花费都随商品数量线性增长。
3. **数据库原始报错会返回给客户端。** `extractErrorMessage` 把 `PostgrestError` 自己的报错文字当作 500 响应体返回，可能暴露表名、列名和约束名。对家庭自用的应用风险很低，但不够整洁。

## 修复

1. 上传之后任何一步失败，都删掉已上传的文件（尽力而为，并记日志）。或者，如果核对页不需要提前拿到图片，改成识别成功后再上传。
2. 暂不处理。等某个圈子的商品到几百个时再看：先筛选候选商品（比如按名称相似度）再发送，而不是放宽 Haiku 4.5 这一固定选择。
3. 原始报错在服务端记日志（`console.error` 已经在做），数据库错误返回通用提示；专门写给用户看的提示（照片不清、小票太长、额度不足）保留原样。如果因此改动 `extractErrorMessage`，按 CLAUDE.md 的要求同步修改 `src/lib/errorMessage.ts`。
