Type: grilling
Status: resolved
GitHub: #18

## Question

`ReceiptReview.tsx` (the pre-confirm safety net, Section 6) and `ReceiptDetail.tsx`'s edit mode (issue 16) both edit the same ReceiptItem fields, and both grew their own copy of the plumbing:

- A **byte-identical** `updateItem<K extends keyof DraftItem>(index, field, value)` in each page.
- The **same 11-field hand-map** from `DraftItem` to `ConfirmReceiptItemUpdate`, written out longhand in each page's save handler.

Needs deciding:

- The hand-map exists only to drop one field (`category`). Where should that strip live?
- The two editors' rendered field sets are *not* identical — Review shows the weight/volume spec read-only, Detail makes it editable; Review shows the category, Detail doesn't. Is that asymmetry intentional, and does it survive unification?
- What is the seam — what new unit, if any, gets its own tests?

**Derived information** (from reading the code before asking):
- `DraftItem` has 12 fields; `ConfirmReceiptItemUpdate` has exactly those 12 minus `category`. The hand-map is `Omit<DraftItem, "category">` spelled out by hand, twice.
- The `category` strip is not incidental — it is spec.md Section 5.2 enforced in code: category lives on `Product`, read via `product_id`, and must never be written back through a ReceiptItem.
- The spec-editor asymmetry traces to issue 16, which deliberately scoped weight/volume editing to the post-confirm flow only. It was a scoping decision, not an argument that pre-confirm editing is wrong.
- Both pages already have full test suites (`ReceiptReview.test.tsx`, 5 cases; `ReceiptDetail.test.tsx`, 7 cases) covering load → edit → save, so they serve as the refactor's safety net.

## Answer

**1. The category strip gets one named home.** `ConfirmReceiptItemUpdate` is redefined as `Omit<DraftItem, "category">`, and a single exported `toItemUpdate(item: DraftItem)` in `src/lib/receipts.ts` performs the conversion. Both pages call it instead of hand-mapping.

Rejected: widening `confirmReceipt`/`editConfirmedReceipt` to accept `DraftItem[]` and ignoring `category` internally. That deletes the map but buries the Section 5.2 rule, and leaves a public API that accepts a field it silently discards — exactly the confusion 5.2 exists to prevent. The rule deserves a name, not an omission.

**2. The field sets converge upward — the weight/volume spec becomes editable in Review too.** This is a deliberate behavior change, not a refactor side effect. If a mis-OCR'd spec (`500g` read as `500kg`) is safe to correct after confirming, it is strictly safer to correct *before* confirming — otherwise the review step, whose whole job is catching OCR errors, hands a known-bad value to the price-trend and consumption-rate math and relies on the user noticing later. Converging also means the shared editor is genuinely one component rather than one component with a mode flag.

The unit remains the fixed `g`/`kg`/`ml`/`L` `<select>` from issue 16, and the spec controls still render only when `unitSpecUnit` is already non-null. Nothing gains a spec it didn't have.

**3. Category stays out of the shared component.** It is not a ReceiptItem field, so it does not belong in a component named for editing ReceiptItem fields — not even read-only. `ReceiptReview.tsx` keeps rendering its own category line at the page level; `ReceiptDetail.tsx`'s edit mode continues not to show one. The component's boundary then matches the domain rule instead of cutting across it.

**4. The seam is the component, not a hook.** `ReceiptItemFields` (props: the `DraftItem` and an `onChange(field, value)`) gets its own test file. `updateItem` itself stays inline in each page: four branchless lines whose extraction into a `useDraftItems` hook would produce a unit whose test asserts nothing but that React's `setState` works. The component, by contrast, has real conditional behavior (the spec controls appear only for a measured item) worth pinning down directly. The page suites keep covering the end-to-end edit-then-save path.

`toItemUpdate` is tested for the invariant that actually matters — that the result carries no `category` key — rather than by field-by-field comparison, which would pass even if the strip broke.

## Known defect, deliberately not fixed here

Editing `quantity` or `unitPrice` does **not** recompute `subtotal`; the stale value is passed straight through and written to the database. So correcting an OCR'd price leaves the line's subtotal disagreeing with `quantity × unitPrice`. This predates the unification — it is duplicated in both pages today and merely becomes a single-site bug afterwards.

Not fixed in this change because whether the recomputation is simply `quantity * unitPrice` depends on promotion-price semantics (when `originalPrice` participates), which is its own discussion. Folding a silent data correction into a structural change would also make the diff lie about what it does.

## Implementation

- **`src/lib/receipts.ts`**: `ConfirmReceiptItemUpdate` becomes `Omit<DraftItem, "category">`; new exported `toItemUpdate(item: DraftItem): ConfirmReceiptItemUpdate`.
- **`src/components/ReceiptItemFields.tsx`** (new): name EN/ZH, quantity, unit price, the conditional spec value + unit `<select>`, promotion checkbox. Controlled — holds no state, takes `item` and `onChange`.
- **`src/pages/ReceiptReview.tsx`**: renders `ReceiptItemFields`, keeps its own category line, drops the hand-map for `items.map(toItemUpdate)`. Gains spec editing (change 2).
- **`src/pages/ReceiptDetail.tsx`**: same substitution in its edit branch; read-only branch untouched.
- Tests: new `src/components/ReceiptItemFields.test.tsx`; a `toItemUpdate` case in `src/lib/receipts.test.ts`; a Review case for the newly editable spec.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`ReceiptReview.tsx`（确认前的纠错关口，见 Section 6）和 `ReceiptDetail.tsx` 的编辑态（issue 16）编辑的是同一批 ReceiptItem 字段，两边各自长出了一套同样的管道代码：

- 两个页面里**逐字节相同**的 `updateItem<K extends keyof DraftItem>(index, field, value)`。
- 两个保存函数里**同样的 11 字段手写映射**，把 `DraftItem` 转成 `ConfirmReceiptItemUpdate`。

需要决定：

- 这个手写映射的存在意义只是丢掉一个字段（`category`）。这个「剥离」应该放在哪？
- 两个编辑器渲染的字段集其实**并不相同**——Review 把重量/容量规格显示为只读，Detail 可编辑；Review 显示分类，Detail 不显示。这种不对称是有意为之吗？统一之后还保留吗？
- seam 是什么——哪个新单元需要自己的测试？

**推导信息**（提问前先读代码得到的）：
- `DraftItem` 有 12 个字段；`ConfirmReceiptItemUpdate` 正好是这 12 个减去 `category`。手写映射就是把 `Omit<DraftItem, "category">` 用手抄了两遍。
- `category` 的剥离不是顺手为之，而是 spec.md Section 5.2 在代码里的落实：分类属于 `Product`，通过 `product_id` 读取，绝不允许经由 ReceiptItem 写回。
- 规格编辑器的不对称源自 issue 16——它有意把重量/容量编辑的范围限定在确认后的流程里。那是一个范围裁剪决定，并不是在论证「确认前不该能编辑规格」。
- 两个页面都已有完整测试套件（`ReceiptReview.test.tsx` 5 例、`ReceiptDetail.test.tsx` 7 例），覆盖加载 → 编辑 → 保存，足以充当这次重构的安全网。

## 结论

**1. 分类剥离获得唯一一个具名归属。** `ConfirmReceiptItemUpdate` 重新定义为 `Omit<DraftItem, "category">`，并在 `src/lib/receipts.ts` 中新增导出的 `toItemUpdate(item: DraftItem)` 负责转换。两个页面改为调用它，不再手写映射。

已否决的方案：把 `confirmReceipt`/`editConfirmedReceipt` 的入参放宽成 `DraftItem[]`，在内部忽略 `category`。那样确实能删掉映射，但把 Section 5.2 这条规则藏了起来，还留下一个「接受某字段却悄悄丢弃」的公开接口——恰恰是 5.2 想避免的那类混淆。这条规则值得一个名字，而不是一次省略。

**2. 字段集向上对齐——重量/容量规格在 Review 里也变为可编辑。** 这是一次刻意的行为变更，不是重构的副产品。如果一个被 OCR 认错的规格（`500g` 读成 `500kg`）在确认之后修正是安全的，那么在确认**之前**修正只会更安全；否则，以「捕捉 OCR 错误」为全部职责的复核步骤，会把一个已知错误的值直接交给价格趋势和消耗速率的计算，然后指望用户日后自己发现。对齐之后，共享编辑器才真正是「一个组件」，而不是「一个带模式开关的组件」。

单位仍然是 issue 16 定下的 `g`/`kg`/`ml`/`L` 固定 `<select>`，规格控件依然只在 `unitSpecUnit` 已非 null 时渲染。不会有任何条目凭空多出一个规格。

**3. 分类不进共享组件。** 它不是 ReceiptItem 的字段，所以不该出现在一个以「编辑 ReceiptItem 字段」命名的组件里——哪怕只是只读展示。`ReceiptReview.tsx` 继续在页面层渲染自己的分类行；`ReceiptDetail.tsx` 的编辑态继续不显示分类。这样组件的边界就与领域规则重合，而不是横切过它。

**4. seam 是组件，不是 hook。** `ReceiptItemFields`（props：`DraftItem` 与 `onChange(field, value)`）拥有独立测试文件。`updateItem` 本身保留在各自页面内：四行、无分支，把它抽成 `useDraftItems` hook 得到的单元，其测试断言的无非是「React 的 `setState` 能用」。组件则相反——它有真实的条件行为（规格控件只对计量类条目出现），值得被直接钉住。端到端的「编辑后保存」路径继续由两个页面的测试覆盖。

`toItemUpdate` 的测试锁的是真正要紧的不变量——结果里不含 `category` 键——而不是逐字段比对；后者即使剥离失效也照样通过。

## 已知缺陷，本次有意不修

编辑 `quantity` 或 `unitPrice` **不会**重算 `subtotal`；陈旧值被原样透传并写入数据库。于是修正一个被 OCR 认错的价格之后，该行的小计会与 `quantity × unitPrice` 对不上。这个问题早于本次统一——今天它在两个页面里各存在一份，统一之后只是变成单点缺陷。

本次不修，是因为「重算是否就等于 `quantity * unitPrice`」取决于促销价语义（`originalPrice` 何时参与），那是另一场讨论。把一次静默的数据修正夹带进一次结构调整，也会让 diff 对自己的内容撒谎。

## 实现

- **`src/lib/receipts.ts`**：`ConfirmReceiptItemUpdate` 改为 `Omit<DraftItem, "category">`；新增导出 `toItemUpdate(item: DraftItem): ConfirmReceiptItemUpdate`。
- **`src/components/ReceiptItemFields.tsx`**（新增）：商品名中英、数量、单价、条件渲染的规格数值 + 单位 `<select>`、促销价复选框。受控组件——不持有 state，接收 `item` 与 `onChange`。
- **`src/pages/ReceiptReview.tsx`**：改用 `ReceiptItemFields`，保留自己的分类行，手写映射替换为 `items.map(toItemUpdate)`。新增规格编辑能力（变更 2）。
- **`src/pages/ReceiptDetail.tsx`**：编辑分支同样替换；只读分支不动。
- 测试：新增 `src/components/ReceiptItemFields.test.tsx`；在 `src/lib/receipts.test.ts` 增加 `toItemUpdate` 用例；为 Review 新获得的规格编辑能力增加一条用例。
