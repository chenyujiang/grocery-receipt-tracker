Type: grilling
Status: open
GitHub: #19

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

_尚未决定。_

## 已完成（前置工作，不属于本 issue）

加 schema 类型的那一半已于 2026-09-13 单独落地：

- `src/types/database.types.ts`——从 `supabase/migrations/` 手工推导，采用 `supabase gen types typescript` 的输出形状，并填好了外键 `Relationships`，使 supabase-js 能正确解析 to-one 嵌套查询。
- 两个调用点都改为 `createClient<Database>`；`fetchPurchaseHistories` 接收 `SupabaseClient<Database>`。
- 7 处 production `as unknown as` 全部删除。
- `_zh` 列在 Postgres 里可为 null，却在 `src/types/index.ts` 里被标成 `string`——此前正是那些 cast 把这件事盖住了。已在 `CONTEXT.md` 中以 **Bilingual Name（双语名称）** 定名解决：缺失的 Translation 读回来就是它的 Source Text，并为每个读取边界补了回归测试。

## 上面未覆盖的遗留项

- `src/lib/exportCsv.ts` 的 `fetchExportRows` **完全没有边界测试**（`exportCsv.test.ts` 只覆盖了 `rowsToCsv`）。因此它的 Bilingual Name 兜底只过了编译器，没过行为验证。
- `src/lib/alerts.ts` 在 Product 没有 Translation 时仍然兜底成 `""` 而非 Source Text，与现已写入 `CONTEXT.md` 的规则不一致；因编译器未报错而暂未改动。
- `npm run typecheck` 只覆盖 `src`：`tsconfig.app.json` 写的是 `"include": ["src"]`，没有任何配置纳入 `api/`。也就是说 `/api` 的 serverless function 并不在仓库自带命令的类型检查范围内，`supabaseAdmin` 上的 `Database` 泛型带来的收益不如看上去那么大。
- `src/types/index.ts` 里手写的行接口（`Circle`、`Profile`、`Receipt`、`ReceiptItem`、`Product`、`EditLog`、`ReceiptStatus`）现在**完全没有人用**——全仓库只 import 了 `Role` 和 `CATEGORIES`——而且它们仍把 `_zh` 列声明为非空，与数据库矛盾。它们是行形状的第二个、且错误的事实来源。为了把本次改动限制在 cast 范围内，暂未删除。
