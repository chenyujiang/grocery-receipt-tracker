Type: bug
Status: ready-for-agent

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
