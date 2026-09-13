# 路由 handler 的测试 mock 它的 `_lib` 协作者，而不只是 Supabase

CLAUDE.md 的测试规则是「mock Supabase 客户端，绝不 mock Supabase 内部」——那是 `src/lib` 和 `api/_lib` 这些直接与 Supabase 对话的模块的边界。`api/` 下的路由 handler 属于另一层：它的职责是 HTTP 转换和接线，它的协作者是那些已有测试覆盖的 `api/_lib` 模块（`requireGlobalAdmin`、`getAccessStatus`、`recognizeReceipt`、`listAdminUsers` 等）。因此 **handler 的测试 mock 的是这些模块**，只有在 handler 中间没有隔着任何 `_lib`、直接查询 Supabase 的地方（`recognize.ts` 的 profile/storage/products 读取，以及 `low-stock-check.ts` 全部），才下沉到 mock `supabaseAdmin`。

## 权衡过的选项

只 mock `supabaseAdmin`、让真实的 `_lib` 代码跑起来，会把每个 handler 测试变成集成测试。以那种方式走到 `recognize.ts` 的 402 分支，需要约 5 层链式 Supabase 桩加上一个 Anthropic 客户端桩，而且会重复断言 `getAccessStatus` 的 trial/cap 判定逻辑——那部分 `userAiAccess.test.ts` 已经覆盖得很彻底。handler 自身真正的贡献（「一次拒绝要变成 HTTP 402 和这样一个响应体」）反而会被淹没在准备代码里。

## 后果

handler 的测试无法发现 handler 与其 `_lib` 协作者之间的契约漂移（参数顺序写反、字段被改名）——整个测试套件里没有任何地方把两者放在一起跑。这是可接受的：形状层面的错误由 TypeScript 拦下，而另一个方案的代价高于它能发现的问题。

`vi.mock` 的路径必须和 handler 的 import specifier 完全一致，包括 handler 为其 `.ts` 协作者所写的 `.js` 后缀（`vi.mock("../_lib/userAiAccess.js", …)`）。写成 `"../_lib/userAiAccess"` 会静默失效。
