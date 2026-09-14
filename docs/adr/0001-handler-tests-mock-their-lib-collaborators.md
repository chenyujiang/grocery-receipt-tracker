# Route handler tests mock their `_lib` collaborators, not just Supabase

CLAUDE.md's testing rule is "mock the Supabase client, never Supabase internals" — that's the boundary for `src/lib` and `api/_lib` modules, which talk to Supabase directly. Route handlers in `api/` are a different layer: their job is HTTP translation and wiring, and their collaborators are the already-tested `api/_lib` modules (`requireGlobalAdmin`, `getAccessStatus`, `recognizeReceipt`, `listAdminUsers`, …). So **a handler test mocks those modules**, and drops to mocking `supabaseAdmin` only where a handler queries Supabase with no `_lib` in between (`recognize.ts`'s profile/storage/products reads, all of `low-stock-check.ts`).

## Considered options

Mocking only `supabaseAdmin` and letting the real `_lib` code run would make each handler test an integration test. Reaching `recognize.ts`'s 402 branch that way needs ~5 chained Supabase stubs plus a stubbed Anthropic client, and it re-asserts `getAccessStatus`'s trial-vs-cap logic, which `userAiAccess.test.ts` already covers exhaustively. The handler's own contribution — "a refusal becomes HTTP 402 with this body" — would be buried in setup.

## Consequences

A handler test can't catch a contract drift between a handler and its `_lib` collaborator (wrong argument order, a renamed field) — nothing in the suite exercises the two together. That's accepted: TypeScript catches the shape errors, and the alternative costs more than it detects.

`vi.mock` paths must match the handler's import specifier exactly, including the `.js` extension the handlers use for their `.ts` collaborators (`vi.mock("../_lib/userAiAccess.js", …)`). Mocking `"../_lib/userAiAccess"` silently does nothing.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# 路由 handler 的测试 mock 它的 `_lib` 协作者，而不只是 Supabase

CLAUDE.md 的测试规则是「mock Supabase 客户端，绝不 mock Supabase 内部」——那是 `src/lib` 和 `api/_lib` 这些直接与 Supabase 对话的模块的边界。`api/` 下的路由 handler 属于另一层：它的职责是 HTTP 转换和接线，它的协作者是那些已有测试覆盖的 `api/_lib` 模块（`requireGlobalAdmin`、`getAccessStatus`、`recognizeReceipt`、`listAdminUsers` 等）。因此 **handler 的测试 mock 的是这些模块**，只有在 handler 中间没有隔着任何 `_lib`、直接查询 Supabase 的地方（`recognize.ts` 的 profile/storage/products 读取，以及 `low-stock-check.ts` 全部），才下沉到 mock `supabaseAdmin`。

## 权衡过的选项

只 mock `supabaseAdmin`、让真实的 `_lib` 代码跑起来，会把每个 handler 测试变成集成测试。以那种方式走到 `recognize.ts` 的 402 分支，需要约 5 层链式 Supabase 桩加上一个 Anthropic 客户端桩，而且会重复断言 `getAccessStatus` 的 trial/cap 判定逻辑——那部分 `userAiAccess.test.ts` 已经覆盖得很彻底。handler 自身真正的贡献（「一次拒绝要变成 HTTP 402 和这样一个响应体」）反而会被淹没在准备代码里。

## 后果

handler 的测试无法发现 handler 与其 `_lib` 协作者之间的契约漂移（参数顺序写反、字段被改名）——整个测试套件里没有任何地方把两者放在一起跑。这是可接受的：形状层面的错误由 TypeScript 拦下，而另一个方案的代价高于它能发现的问题。

`vi.mock` 的路径必须和 handler 的 import specifier 完全一致，包括 handler 为其 `.ts` 协作者所写的 `.js` 后缀（`vi.mock("../_lib/userAiAccess.js", …)`）。写成 `"../_lib/userAiAccess"` 会静默失效。
