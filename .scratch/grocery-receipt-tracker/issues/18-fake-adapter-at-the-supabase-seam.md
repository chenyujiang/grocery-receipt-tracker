Type: grilling
Status: open
GitHub: #19

## Question

Every module under `src/lib` that reads data calls `supabase.from(...)` directly, so the seam between this app and supabase-js runs through sixteen separate files rather than one. The cost lands in the tests: each of them has to re-fake supabase-js's chainable query builder by hand.

Needs deciding:

- What is the interface of a fake adapter that sits at that seam — one module per table, one per feature, or one query-shaped thing?
- What fidelity does the fake owe the real client? Filtering? Ordering? Embeds? Or is it a fixture store that only replays prepared rows?
- Does the adapter belong in front of `supabaseAdmin` too, or does the service-role client stay where it is?
- What happens to the 22 existing chain factories — converted, or left coexisting?

**Derived information** (from reading the code, 2026-09-13):

- 22 test files carry **~180 `as never` casts**; `src/lib/receipts.test.ts` alone has 45. The cast is needed because a hand-rolled chain object is not structurally a `PostgrestFilterBuilder` — it is missing `url`, `headers`, `method` and dozens of methods.
- **This is not fixed by generated schema types.** Issue 18's predecessor work (see "Already done" below) added a `Database` generic, which deleted all 7 production casts and left every one of the ~180 test casts in place. Typing the schema makes `from()`'s return type *more* specific, not easier to fake. The two problems share an entry point but are not the same problem.
- **22 chain factories live across 13 test files**, in two different shapes:
  - `src/lib/receiptList.test.ts:18` builds one object whose every method returns itself and which is itself thenable. Assertions name the method (`expect(chain.gte).not.toHaveBeenCalled()`), so they do not depend on call order. **Used in exactly one file.**
  - The other 21 (`home.test.ts` ×3, `monthlyReport.test.ts` ×5, `receipts.test.ts` ×3, …) nest a different object per method, so the test encodes the exact call sequence. Reordering two filters in production code breaks them even though the query is unchanged.
- `fetchPurchaseHistories` is already the one module that takes its client as a parameter rather than importing it (CLAUDE.md documents why). Its test passes a plain `{ from }` object straight in, with no `vi.mock` — the cheapest test of the sixteen. That is the shape the rest of the codebase does not have.

## Answer

**No adapter — one shared fake client, test-side only.** The seam stays exactly where it is: every `src/lib` module keeps `import { supabase }` and keeps calling `.from(...)`. What gets built is a single fake in `src/test/fakeSupabase.ts` that the 22 hand-rolled chain factories are all replaced by.

The reasoning: the ~180 casts and the sequence-coupled nesting are *test-construction* costs, not production ones. A production adapter would mean re-expressing PostgREST's filter vocabulary in local types for no production benefit — the `src/lib` modules **already are** the repository layer. Note also that passing the client as a parameter (the `fetchPurchaseHistories` shape) does not by itself fix the casts: that test still writes `as unknown as SupabaseClient`. The cast count is a function of *how the fake is built*, not *how it is injected*.

The decisions, against the four questions above:

- **Surface** — the fake covers `from()`, `auth` and `storage`, because `receipts.ts` alone uses all three in one module; a `from()`-only fake leaves the worst file (`receipts.test.ts`, 47 casts) still hand-rolling the other two. It covers `supabaseAdmin` too (`auth.admin.*`, `rpc`) — the same shape plus two properties, against another 53 casts across 7 `api/` test files.
- **Fidelity: replay and record, no semantics.** The fake is chainable and thenable, records every call, and on `await` returns a prepared `{ data, error }` verbatim. It does not filter, sort, or resolve embeds. A real query engine would have to parse PostgREST's select syntax — two-level nesting, `!inner`, and `.eq("receipts.status", …)` filtering *through* an embed all appear in production — and the rows a test wants are already in post-embed shape anyway. This line (**shape and bookkeeping, not semantics**) is what keeps the fake's behaviour predictable from its name.
- **Result routing: one queue per table.** `{ receipts: [r1, r2], alerts: r3 }`; same-table calls consume in order, cross-table order is free. This matches the code: cross-table order is an implementation detail (`confirmReceipt` writing `edit_logs` before `alerts` should not break a test), while same-table order is semantic (`fetchHomeSummary` reads `receipts` twice, for different things, and must be able to answer differently). A bare value is shorthand for "every call to this table gets this". Error injection uses the same slot — put a raw `PostgrestError` object in, which is the shape the `errorMessage()` convention actually needs covered.
- **Assertions: structured call records.** `expect(db.callsFor("receipts")).toContainEqual(["eq", "status", "confirmed"])`, not a shared bag of `vi.fn()` spies — results are routed per table, so assertions must be too. This also covers the write path for free: `insert`/`update` payloads are just args, which is what most of `receipts.test.ts`'s 19 `toHaveBeenCalledWith` are. `toContainEqual` over an array is where the call-order decoupling actually lands.
- **Terminators are not special.** `.single()`, `.maybeSingle()` and `{ count: "exact", head: true }` all return the queued value verbatim; the test supplies the right shape. Once `.single()` starts taking the first element or raising `PGRST116`, the question "then why doesn't `.eq()` filter?" has no good answer. Which branch ran is still visible through `callsFor()`.
- **Running dry throws.** An unprepared table, or a queue consumed past its end, raises with the table name and the call index — not an empty result. A silent `{ data: [], error: null }` turns "production issued a query you did not expect", usually a real regression, into a mystery failure downstream or no failure at all. The existing nested factories at least fail loudly on a missing rung; that property has to be deliberately kept.
- **The 22 factories all go, in one pass**, over two commits: the helper plus its own tests first, then the mechanical replacement of 20 test files. Coexistence is especially bad here, since the helper's whole value is that any test file can be read without re-learning its fake. The risk is low: replacement is test-only, and swapping order-encoding nesting for a recorder makes assertions *looser*, so nothing correct can start failing.

Success is checkable: every **Supabase-boundary** cast in `src` and `api` goes to zero, with the one survivor — `as unknown as SupabaseClient<Database>` — living inside `fakeSupabase.ts`. Note the repo-wide cast count (216 across 30 files) is a larger number than this change can move: `api/_lib/testHandler.ts` casts Vercel's request/response, `recognizeReceipt.test.ts` casts the Anthropic client, and much of `recognize.test.ts` casts app-internal module mocks. None of those are the Supabase seam, and none are in scope here. The `vi.mock` factory returns an empty object and `installFakeSupabase(client, options)` fills it — that indirection is what keeps the call sites cast-free, since the copy is `SupabaseClient<Database>` onto `SupabaseClient<Database>`. `vi.mock` itself stays at the top of each test file — hoisting aside, it is the line that declares why this test gets a fake at all, and hiding it makes that harder to trace.

Deliberately **not** in scope: the four follow-ups below, `CONTEXT.md` (no new domain term — a test fake is implementation), and an ADR (test-only, cheap to reverse, no future reader will wonder why).

## Already done (prerequisite, not this issue)

The schema-typing half shipped separately on 2026-09-13:

- `src/types/database.types.ts` — hand-derived from `supabase/migrations/` in the shape `supabase gen types typescript` emits, with FK `Relationships` populated so supabase-js can resolve the to-one embeds.
- `createClient<Database>` at both call sites; `fetchPurchaseHistories` takes `SupabaseClient<Database>`.
- All 7 production `as unknown as` casts deleted.
- `_zh` columns are nullable in Postgres but were typed `string` in `src/types/index.ts`; the casts had been hiding that. Resolved as **Bilingual Name** in `CONTEXT.md` — a missing Translation reads back as its Source Text — with a regression test per read boundary.

## Open follow-ups not covered above

- ~~`src/lib/exportCsv.ts`'s `fetchExportRows` has **no boundary test at all**.~~ **Closed**: `exportCsv.test.ts` now covers it against the fake — the row mapping, the confirmed-only/in-range/oldest-first query, the Bilingual Name fallbacks, an uploader who has left the circle, an empty range, and a raw `PostgrestError` rethrow. The last of those leaves `profiles` unprepared, so the fake enforces that a failed read never goes on to query members.
- ~~`src/lib/alerts.ts` still falls back to `""` rather than the Source Text when a Product has no Translation.~~ **Closed**: `fetchAlerts` now falls back to `canonical_name_en`, matching `productDetail.ts` and `exportCsv.ts`, with a regression test. The two sites in `src/lib/monthlyReport.ts` that broke the same rule are closed too, the second by deleting a cast that declared the nullable `canonical_name_zh` as `string`.

- **New**: that cast was a Supabase-boundary `as` in *production* code, which the `as never`/`as unknown as` sweep missed. Three more of the same shape survive and are **open**: `src/lib/circleMembers.ts:23`, `src/lib/monthlyReport.ts:57`, `src/lib/receiptList.ts:57` — each re-declares a row shape the typed client already knows. (`src/lib/adminApi.ts` and the `api/` route bodies also cast, but those parse JSON responses, not Supabase rows, and are legitimate.)
- ~~`npm run typecheck` covers `src` only.~~ **Closed**: a third project, `tsconfig.api.json` (`"include": ["api"]`), is referenced from the root `tsconfig.json`, so `tsc -b` — and therefore both `npm run typecheck` and `npm run build` — now covers `api/` too. It matches `tsconfig.app.json`'s strictness (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) with Node libs instead of DOM. Turning it on surfaced six real errors, all in `api/` test files: four `it.each([404, 401])` calls widening to `number` where `requireGlobalAdmin` returns `401 | 404` (fixed with `as const`), one malformed-query array that inferred `{ userId?: undefined }`, and one unused import.
- `src/types/index.ts`'s hand-written row interfaces (`Circle`, `Profile`, `Receipt`, `ReceiptItem`, `Product`, `EditLog`, `ReceiptStatus`) are now **entirely unused** — only `Role` and `CATEGORIES` are imported anywhere — and they still declare the `_zh` columns non-nullable, which the database contradicts. They are a second, wrong source of truth for row shapes. Left in place rather than deleted, to keep this change scoped to the casts.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`src/lib` 下每个读数据的模块都直接调用 `supabase.from(...)`，因此本应用与 supabase-js 之间的那道缝分散在十六个文件里，而不是收在一处。代价落在测试上：每个测试都得手工再伪造一遍 supabase-js 的链式 query builder。

待决定：

- 坐落在那道缝上的 fake adapter，接口应该长什么样——一张表一个模块、一个功能一个模块，还是一个以查询为形状的东西？
- 这个 fake 对真实 client 要保多少真？过滤？排序？嵌套查询？还是只做一个回放预置行的 fixture store？
- 这个 adapter 要不要也罩住 `supabaseAdmin`，还是 service-role client 维持现状？
- 现存的 22 个 chain 工厂怎么办——全部改造，还是两种形状并存？

**已查明的事实**（读代码得出，2026-09-13）：

- 22 个测试文件共有 **约 180 处 `as never`**；仅 `src/lib/receipts.test.ts` 就有 45 处。之所以需要这个 cast，是因为手搓的 chain 对象在结构上并不是 `PostgrestFilterBuilder`——它缺 `url`、`headers`、`method` 以及几十个方法。
- **生成 schema 类型解决不了这个问题。** 本 issue 的前置工作（见下方「已完成」）加上了 `Database` 泛型，删掉了全部 7 处 production cast，而那约 180 处测试 cast 一处未减。给 schema 加类型只会让 `from()` 的返回类型**更**具体，不会更容易伪造。这两个问题共用一个入口，但不是同一个问题。
- **22 个 chain 工厂散布在 13 个测试文件里**，分两种形状：
  - `src/lib/receiptList.test.ts:18` 构造的对象每个方法都返回自身，且对象本身是 thenable。断言直接指名方法（`expect(chain.gte).not.toHaveBeenCalled()`），因此不依赖调用顺序。**全仓库只此一处在用。**
  - 另外 21 个（`home.test.ts` ×3、`monthlyReport.test.ts` ×5、`receipts.test.ts` ×3……）每个方法都嵌套返回一个不同的对象，于是测试把精确的调用序列固化了下来。production 代码里两个过滤条件换个顺序，查询没变，测试却会挂。
- `fetchPurchaseHistories` 已经是唯一一个把 client 作为参数、而非 import 进来的模块（CLAUDE.md 记录了原因）。它的测试直接传进一个普通的 `{ from }` 对象，完全不需要 `vi.mock`——是这十六个里最便宜的测试。那正是其余代码所缺的形状。

## 结论

**不做 adapter——只在测试侧做一个共享的 fake client。** seam 原地不动：`src/lib` 每个模块照旧 `import { supabase }`、照旧调 `.from(...)`。要造的是 `src/test/fakeSupabase.ts` 里的一个 fake，用它替掉现存 22 个手写 chain factory。

理由：那约 180 个 cast 和"把调用顺序编码进嵌套"的写法，是**测试构造**的成本，不是生产代码的成本。做生产 adapter 等于用本地类型重新表达一遍 PostgREST 的过滤词汇，而生产侧一无所得——`src/lib` 这些模块**本来就是** repository 层。另外注意：把 client 改成参数传入（`fetchPurchaseHistories` 那种形状）本身并不解决 cast 问题，那个测试照样写着 `as unknown as SupabaseClient`。cast 的数量取决于 **fake 怎么造**，不是 **fake 怎么注入**。

对应上面四个待定问题：

- **覆盖面**——fake 覆盖 `from()`、`auth`、`storage`，因为光 `receipts.ts` 一个模块就三者全用；只覆盖 `from()` 的话，最糟的那个文件（`receipts.test.ts`，47 个 cast）还得自己手搓另外两个。也覆盖 `supabaseAdmin`（`auth.admin.*`、`rpc`）——形状一样，只多两个属性，换掉 `api/` 侧 7 个测试文件里另外 53 个 cast。
- **保真度：回放 + 记录，不做语义。** fake 可链式、本身 thenable，记录每一次调用，`await` 时原样返回预置的 `{ data, error }`。不过滤、不排序、不解析 embed。真做查询引擎就得解析 PostgREST 的 select 语法——两层嵌套、`!inner`、以及穿过 embed 的 `.eq("receipts.status", …)` 在生产代码里全都有——而测试想要的行本来就是 embed 之后的形状。这条界线（**只管形状和记账，不管语义**）正是让 fake 的行为可以从名字推断出来的东西。
- **结果分流：每张表一个队列。** `{ receipts: [r1, r2], alerts: r3 }`；同表按序消费，跨表无序。这匹配代码的真实形状：跨表顺序是实现细节（`confirmReceipt` 先写 `edit_logs` 还是先写 `alerts` 不该弄挂测试），同表顺序才是语义（`fetchHomeSummary` 两次读 `receipts`，读的是不同东西，必须能给不同答案）。直接给一个值是简写，意思是"这张表每次调用都返回它"。错误注入走同一个口子：放一个裸的 `PostgrestError` 对象进去——那正是 `errorMessage()` 那条约定真正需要被覆盖的形状。
- **断言：结构化的调用记录。** `expect(db.callsFor("receipts")).toContainEqual(["eq", "status", "confirmed"])`，而不是一堆混在一起的 `vi.fn()` spy——结果已经按表分流了，断言也必须分表。写路径顺带覆盖：`insert`/`update` 的 payload 就是 args，`receipts.test.ts` 里 19 处 `toHaveBeenCalledWith` 大半是这个。对数组用 `toContainEqual`（"包含"而非"等于"），顺序解耦就落在这里。
- **终结方法不特殊对待。** `.single()`、`.maybeSingle()`、`{ count: "exact", head: true }` 一律原样返回队列里的值，形状由测试自己写对。一旦 `.single()` 开始取首元素或抛 `PGRST116`，"那 `.eq()` 为什么不过滤"就没有好答案了。走了哪条分支，仍然可以从 `callsFor()` 看到。
- **取空即抛错。** 没准备过的表、或队列被消费超界，抛错并带上表名和第几次调用，而不是返回空结果。静默的 `{ data: [], error: null }` 会把"生产代码发了一个你没预料到的查询"——通常是真回归——变成下游某处莫名其妙的失败，或者干脆不失败。现存的嵌套式 factory 至少在缺一环时会响亮地挂掉，这个性质必须刻意保留。
- **22 个 factory 一次性全换**，分两个 commit：先加 helper 和它自己的测试，再机械替换 20 个测试文件。这里共存尤其糟，因为 helper 的全部价值就在于"读任何一个测试文件都不用重新理解它的 fake"。风险很低：替换是纯测试改动，而且把"编码顺序的嵌套"换成 recorder 之后断言变得**更松**，本来对的东西不会开始挂。

成功与否可直接验收：`src` 和 `api` 里每一处 **Supabase 边界**的 cast 归零，唯一幸存的那个 `as unknown as SupabaseClient<Database>` 住在 `fakeSupabase.ts` 里面。注意仓库里 cast 的总数（30 个文件、216 处）比本次改动能撼动的要大：`api/_lib/testHandler.ts` 转的是 Vercel 的 request/response，`recognizeReceipt.test.ts` 转的是 Anthropic client，`recognize.test.ts` 里大半转的是应用内模块的 mock。这些都不是 Supabase 那道缝，也都不在本次范围内。`vi.mock` 的工厂返回一个空对象，由 `installFakeSupabase(client, options)` 把它填满——这层间接正是调用处不需要 cast 的原因，因为拷贝发生在 `SupabaseClient<Database>` 到 `SupabaseClient<Database>` 之间。`vi.mock` 本身保留在各测试文件顶部——除了 hoisting 的限制之外，它本来就是声明"这个测试为什么拿到的是 fake"的那一行，藏起来只会让这件事更难追。

刻意**不**在范围内：下面那四条遗留项、`CONTEXT.md`（没有新的领域术语——测试 fake 属于实现层）、以及 ADR（纯测试代码，推翻成本很低，未来读者不会困惑）。

## 已完成（前置工作，不属于本 issue）

加 schema 类型的那一半已于 2026-09-13 单独落地：

- `src/types/database.types.ts`——从 `supabase/migrations/` 手工推导，采用 `supabase gen types typescript` 的输出形状，并填好了外键 `Relationships`，使 supabase-js 能正确解析 to-one 嵌套查询。
- 两个调用点都改为 `createClient<Database>`；`fetchPurchaseHistories` 接收 `SupabaseClient<Database>`。
- 7 处 production `as unknown as` 全部删除。
- `_zh` 列在 Postgres 里可为 null，却在 `src/types/index.ts` 里被标成 `string`——此前正是那些 cast 把这件事盖住了。已在 `CONTEXT.md` 中以 **Bilingual Name（双语名称）** 定名解决：缺失的 Translation 读回来就是它的 Source Text，并为每个读取边界补了回归测试。

## 上面未覆盖的遗留项

- ~~`src/lib/exportCsv.ts` 的 `fetchExportRows` **完全没有边界测试**。~~ **已关闭**：`exportCsv.test.ts` 现已用 fake 覆盖了它——行映射、"仅 confirmed + 在区间内 + 按购买日期升序"的查询、Bilingual Name 的各级兜底、已退出 Circle 的上传者、空区间，以及原样抛出的 `PostgrestError`。最后一条刻意不准备 `profiles`，于是由 fake 强制保证读取失败后不会再去查成员。
- ~~`src/lib/alerts.ts` 在 Product 没有 Translation 时仍然兜底成 `""` 而非 Source Text。~~ **已关闭**：`fetchAlerts` 现已兜底到 `canonical_name_en`，与 `productDetail.ts`、`exportCsv.ts` 一致，并补了回归测试。`src/lib/monthlyReport.ts` 中违反同一规则的两处也已关闭，其中第二处是通过删掉那个把可空的 `canonical_name_zh` 声明为 `string` 的 cast 修好的。

- **新增**：上述 cast 是一处**生产代码**里的 Supabase 边界 `as`，此前只 grep `as never` / `as unknown as` 时漏掉了。同形状的还剩三处，**仍未关闭**：`src/lib/circleMembers.ts:23`、`src/lib/monthlyReport.ts:57`、`src/lib/receiptList.ts:57`——它们都在重新声明一份带类型的 client 本来就知道的行形状。（`src/lib/adminApi.ts` 和 `api/` 路由里的 body 解析也用了 `as`，但那些解析的是 JSON 响应而非 Supabase 行，属于合理用法。）
- ~~`npm run typecheck` 只覆盖 `src`。~~ **已关闭**：新增第三个 project `tsconfig.api.json`（`"include": ["api"]`），并从根 `tsconfig.json` 引用，因此 `tsc -b`——也就是 `npm run typecheck` 和 `npm run build`——现在同样覆盖 `api/`。它与 `tsconfig.app.json` 的严格度一致（`strict`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`），只是用 Node 的 lib 而非 DOM。打开后立刻暴露出 6 个真实错误，全在 `api/` 的测试文件里：4 处 `it.each([404, 401])` 把类型放宽成 `number`，而 `requireGlobalAdmin` 返回的是 `401 | 404`（用 `as const` 修正）；1 处畸形 query 数组被推断成 `{ userId?: undefined }`；以及 1 个未使用的 import。
- `src/types/index.ts` 里手写的行接口（`Circle`、`Profile`、`Receipt`、`ReceiptItem`、`Product`、`EditLog`、`ReceiptStatus`）现在**完全没有人用**——全仓库只 import 了 `Role` 和 `CATEGORIES`——而且它们仍把 `_zh` 列声明为非空，与数据库矛盾。它们是行形状的第二个、且错误的事实来源。为了把本次改动限制在 cast 范围内，暂未删除。
