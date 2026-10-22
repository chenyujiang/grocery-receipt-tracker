Type: task
Status: resolved
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

## Answer

1. **Orphaned images: done, by deleting.** Uploading after recognition would need the image held in memory across the Claude call for no gain, so the upload stays where it is. Once it succeeds, the route remembers the path, and `fail()` (the single exit for every failure response) deletes it from the `receipts` bucket (`storage.remove([path])`) after handing back the reservation and **before** writing the response, for the same Vercel-freeze reason. That covers a failed products lookup, a failed Claude call or parse, and a failed Draft save. A failed upload deletes nothing. The delete is best effort: an error or rejection is logged (`failed to delete the stored image`) and the user still gets the original error. Deleting after a failed Draft save assumes the save is all-or-nothing, which it is once `save_draft_receipt` (ticket 33) is in; before that, a save that failed after inserting the receipt row would leave that row without its image.
2. **Prompt size: no action**, as planned.
3. **Database errors: done.** `extractErrorMessage` now returns an `Error`'s own message (the ones on this path were written for users: unreadable photo, too-long receipt) and the generic "Failed to recognize receipt" for anything else, which includes every `PostgrestError`. The raw error is still logged by the catch's `console.error`. Access refusals are 402s written before the `try`, so they're unaffected.

   `src/lib/errorMessage.ts` is **deliberately not changed to match**: CLAUDE.md requires the frontend to show a `PostgrestError`'s message, since there it's the user's own RLS or constraint failure (already visible in their network tab) and the only clue to what went wrong. Both files' comments now name this one difference; the `Error` handling is still the same in both.

Tests in `api/receipts/recognize.test.ts`: the image is deleted, before responding, when the products lookup, the Claude call, or the Draft save fails; it's kept on success and not touched when the upload itself failed; a failed delete (error or rejection) still returns the original error; and a database error's message is replaced by the generic one and logged.

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

## 答案

1. **孤立图片：已做，方式是删除。** 改成识别成功后再上传，就得在 Claude 调用期间一直把图片留在内存里，没有好处，所以上传位置不变。上传成功后，路由记下路径；`fail()` 是所有失败响应的唯一出口，它在归还预占之后、**写响应之前**把图片从 `receipts` bucket 删掉（`storage.remove([path])`），原因同样是 Vercel 可能冻结函数。覆盖的情况有：商品查询失败、Claude 调用或解析失败、保存草稿失败。上传本身失败时不删任何东西。删除是尽力而为：报错或 reject 只记日志（`failed to delete the stored image`），用户收到的仍是原始错误。保存草稿失败后删除图片，前提是保存要么全成要么全不成；`save_draft_receipt`（ticket 33）合入后就是这样。在那之前，如果插入小票行之后才失败，那一行会没有图片。
2. **提示词大小：不处理**，按原计划。
3. **数据库报错：已做。** `extractErrorMessage` 现在对 `Error` 返回它自己的信息（这条路径上的 `Error` 都是写给用户看的：照片读不了、小票太长），其他情况一律返回通用的 "Failed to recognize receipt"，所有 `PostgrestError` 都在其中。原始错误仍由 catch 里的 `console.error` 记日志。额度不足是在 `try` 之前写出的 402，不受影响。

   `src/lib/errorMessage.ts` **有意没有跟着改**：CLAUDE.md 要求前端显示 `PostgrestError` 的信息，因为在前端那是用户自己的 RLS 或约束失败（在浏览器 network 面板里本来就看得到），也是唯一能看出哪里出错的线索。两个文件的注释现在都写明了这一处差别；对 `Error` 的处理两边仍然一样。

测试在 `api/receipts/recognize.test.ts`：商品查询、Claude 调用或保存草稿失败时，图片会在响应之前被删除；成功时保留；上传本身失败时不碰；删除失败（报错或 reject）时仍返回原始错误；数据库错误的信息被换成通用提示，并记日志。
