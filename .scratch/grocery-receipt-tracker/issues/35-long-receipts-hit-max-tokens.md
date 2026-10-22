Type: bug
Status: resolved
GitHub: #39

## Problem

`recognizeReceipt` calls Claude with `max_tokens: 4096` and never checks `stop_reason`. Every line item is emitted with its English name, a Chinese translation and nine more fields, so a long supermarket shop (several dozen lines) can run past the limit.

When it does, the JSON is cut off mid-object, `JSON.parse` throws, and the user gets a generic 500 with a parse error. The call's cost is also never recorded against the user, because `recordSuccess` runs only after a successful parse.

## Fix

- Raise `max_tokens` with headroom for a realistic long receipt. The model stays pinned to `claude-haiku-4-5`; this changes the output ceiling, not the model, and you only pay for tokens actually generated.
- Check `stop_reason === "max_tokens"` before parsing, and throw a clear, user-facing message (e.g. "This receipt is too long to read in one go — try photographing it in two halves").

## Tests

- A response with `stop_reason: "max_tokens"` produces the clear message, not a JSON parse error.

## Answer

Done as proposed. `max_tokens` goes from 4096 to 16000 (`MAX_OUTPUT_TOKENS` in `api/_lib/recognizeReceipt.ts`); the model stays `claude-haiku-4-5`. Only generated tokens are billed, so a normal receipt costs the same; the worst case per call rises from about $0.02 to about $0.08 in output ($5/MTok). Before parsing, a response with `stop_reason === "max_tokens"` throws "This receipt is too long to read in one go — try photographing it in two halves." — an `Error`, so the route shows it to the user as-is.

That throw happens before the route marks Claude as having answered, so, like any other failed call or parse, the trial reservation is handed back and no spend is recorded. The user isn't charged for a receipt they couldn't use; the app absorbs that one call's cost. Test: a `max_tokens` response produces the message, not a JSON parse error.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`recognizeReceipt` 调 Claude 时 `max_tokens: 4096`，而且从不检查 `stop_reason`。每行明细都要输出英文名、中文翻译和另外九个字段，一次大采购（几十行）的小票可能超出上限。

一旦超出，JSON 会在中途被截断，`JSON.parse` 抛错，用户只看到一个带解析错误的笼统 500。这次调用的花费也不会记到用户头上，因为 `recordSuccess` 只在解析成功后才执行。

## 修复

- 调大 `max_tokens`，给真实的长小票留足余量。模型仍固定为 `claude-haiku-4-5`；这里改的只是输出上限，不是模型，而且只按实际生成的 token 计费。
- 解析前检查 `stop_reason === "max_tokens"`，抛出一条用户看得懂的提示（比如"这张小票太长，一次读不完——试试分成上下两半拍"）。

## 测试

- `stop_reason` 为 `"max_tokens"` 的响应给出明确的提示，而不是 JSON 解析错误。

## 答案

按方案做完了。`max_tokens` 从 4096 调到 16000（`api/_lib/recognizeReceipt.ts` 里的 `MAX_OUTPUT_TOKENS`）；模型仍是 `claude-haiku-4-5`。只按实际生成的 token 计费，所以普通小票花费不变；单次调用的最坏输出花费从约 $0.02 升到约 $0.08（$5/MTok）。解析前，`stop_reason === "max_tokens"` 的响应会抛出 "This receipt is too long to read in one go — try photographing it in two halves."——这是一个 `Error`，所以路由会原样显示给用户。

这次抛错发生在路由把 Claude 标记为已返回之前，所以和其他调用或解析失败一样，试用预占会被归还，也不记花费。用户不会为一张用不了的小票付费；这一次调用的花费由应用承担。测试：`max_tokens` 响应给出这条提示，而不是 JSON 解析错误。
