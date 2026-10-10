Type: bug
Status: ready-for-agent
GitHub: #38

## Problem

`recognizeReceipt` (`api/_lib/recognizeReceipt.ts`) passes Claude's `matched_product_id` through unchecked, and `saveDraftReceipt` writes it straight into `receipt_items.product_id` with the service-role client. The JSON schema only constrains it to `string | null`, not to one of the ids actually offered in the prompt.

If the model returns a mistyped or invented id, the insert fails on the foreign key. By then the Claude call has already happened and `recordSuccess` has already charged it, and the user sees a raw database error instead of their receipt.

## Fix

In `recognizeReceipt`, accept `matched_product_id` only if it's in the `existingProducts` id set the prompt was built from. Anything else becomes `null`, so the item is treated as a new product and the user can re-link it on the review page.

## Tests

- An id that is in `existingProducts` passes through.
- An id that isn't (including a malformed string) comes back as `null`.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`recognizeReceipt`（`api/_lib/recognizeReceipt.ts`）把 Claude 返回的 `matched_product_id` 原样往下传，不做校验。`saveDraftReceipt` 再用 service-role 客户端直接写进 `receipt_items.product_id`。JSON schema 只限制它是 `string | null`，并没有限制它必须是提示词里给出的某个 id。

如果模型返回一个写错或编造的 id，插入会因为外键报错而失败。这时 Claude 已经调用过，`recordSuccess` 也已经扣了费，用户看到的却是一条数据库原始报错，而不是自己的小票。

## 修复

在 `recognizeReceipt` 里，只接受出现在 `existingProducts`（也就是构造提示词用的那批商品）id 集合中的 `matched_product_id`。其他值一律改成 `null`，这一行就当作新商品处理，用户可以在核对页重新关联。

## 测试

- 在 `existingProducts` 里的 id 原样保留。
- 不在里面的 id（包括格式不对的字符串）返回 `null`。
