Type: bug
Status: ready-for-agent
GitHub: #39

## Problem

`recognizeReceipt` calls Claude with `max_tokens: 4096` and never checks `stop_reason`. Every line item is emitted with its English name, a Chinese translation and nine more fields, so a long supermarket shop (several dozen lines) can run past the limit.

When it does, the JSON is cut off mid-object, `JSON.parse` throws, and the user gets a generic 500 with a parse error. The call's cost is also never recorded against the user, because `recordSuccess` runs only after a successful parse.

## Fix

- Raise `max_tokens` with headroom for a realistic long receipt. The model stays pinned to `claude-haiku-4-5`; this changes the output ceiling, not the model, and you only pay for tokens actually generated.
- Check `stop_reason === "max_tokens"` before parsing, and throw a clear, user-facing message (e.g. "This receipt is too long to read in one go — try photographing it in two halves").

## Tests

- A response with `stop_reason: "max_tokens"` produces the clear message, not a JSON parse error.

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
