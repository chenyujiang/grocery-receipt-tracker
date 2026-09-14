Type: bug
Status: resolved
GitHub: #22

## 问题

`api/admin/users/[userId]/grant-credit.ts` 会把无法使用的 `capUsd` 静默降级为「使用默认值」：

```ts
const resolvedCapUsd =
  typeof capUsd === "number" && Number.isFinite(capUsd) && capUsd > 0 ? capUsd : undefined;
```

于是 `"5"`（字符串，比如直接来自未解析的表单字段）、`0`、`-5`、`NaN`、`Infinity` 全都会得到一个**成功**的 200 响应，实际发放的却是默认的 $1。管理员看到成功提示，以为自己发放的是输入的金额。

这比一般的校验缺失更要紧，因为发放永远是**重置**而非叠加充值（issue 15 决策 4）：一次输错的发放不只是没加上预期金额，还会把该用户已有的消费清零、并把上限替换成 $1。而且事后没有任何自动纠正机制——只有再做一次手动发放。

已在 `api/admin/users/[userId]/grant-credit.test.ts` 中作特征化（而非认可）记录：

```ts
it.each([…])("currently falls back to the default cap on %s instead of 400ing", …)
```

## 修法

区分「缺失」与「非法」：

- `capUsd` 缺失（没有 body，或没有该键）→ `undefined`，含义是「重置为默认值」。这是预期内且已写入文档的路径，必须继续可用。
- `capUsd` 存在但不是大于 0 的有限数 → 返回 `400 { error: … }`，不发起发放。

把那条特征化测试翻转为断言 400，保留两条「defers to the default cap」用例不变，并删掉 `CHARACTERIZATION` 注释。

顺带检查 `AdminDashboard.tsx` 的发放表单——如果它把输入框的原始值当字符串发出，那么每一次自定义发放都会落进静默默认值这条路径，那样这就是一个线上实发的 bug，而不只是潜在隐患。

## 解决方案

`api/admin/users/[userId]/grant-credit.ts` 现在区分「缺失」与「非法」：

- `capUsd` 缺失（没有 body，或没有该键）仍然解析为 `undefined`，即「重置为默认的 $1」。两条 `defers to the default cap` 用例保持不变。
- `capUsd` 存在但不是大于 0 的有限数 → 返回 `400 { error: "capUsd must be a positive number" }`，且不会调用 `grantCredit`，用户已有的消费与上限原封不动。

特征化测试被翻转为其反面：`"5"`、`0`、`-5`、`NaN`、`Infinity`、`null` 每一条都断言 400、断言错误体、并断言 `grantCredit` 未被调用。`CHARACTERIZATION` 注释已删除。

按 ticket 要求检查了 `AdminDashboard.tsx`：自定义发放按钮本就先做 `parseFloat(customAmount)`，并在 `NaN`/`<= 0` 时直接返回，因此它从未发送过字符串——这是潜在隐患而非线上实发的 bug。唯一会被放行并触发 400 的输入是字面文本 `Infinity`（`parseFloat` 会接受它）。此处未改动：该表单对非法输入的处理（静默 `return`、无任何提示）是另一个独立的缺口，`withBusy` 也本来就不捕获 API 失败，这两点都早于本次改动。
