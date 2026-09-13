Type: bug
Status: needs-triage

## 问题

`api/cron/low-stock-check.ts` 用一个 `for` 循环来构建购入历史，对数据库中所有 Circle 的**每一个 Product 各发一次 `receipt_items` 查询**：

```ts
for (const product of products ?? []) {
  const { data: rows, error } = await supabaseAdmin
    .from("receipt_items")
    .select("quantity, unit_spec_value, unit_spec_unit, receipts!inner(purchase_date, status)")
    .eq("product_id", product.id)
    …
}
```

这正是 `src/lib/purchaseHistory.ts` 中 `fetchPurchaseHistories(client, productIds)` 要防止的 N+1，CLAUDE.md 明确写着：

> 它只发**一次** `.in("product_id", ids)` 查询，绝不每个商品发一次——如果你发现自己在给 `receipt_items` 的 select 套 `for` 循环，那正是这个模块存在的意义所在。

`fetchPurchaseHistories` 之所以把 client 作为参数，正是为了让 `/api` 能传入 `supabaseAdmin` 来横扫所有 Circle——恰恰是这条路由想要的。

该模块还会丢弃没有单位规格的行，并按时间从旧到新排序，而这个循环把两者都内联重写了一遍——所以重复的是行为，而不只是结构。

## 不确定之处（因此是 needs-triage 而非 ready-for-agent）

写下本条目时，`src/lib/purchaseHistory.ts` 以未跟踪文件的形式存在于工作区，而这个 handler 处于已提交的 HEAD 状态，并没有 import 它。目前无法确定是：

- 重构正在进行中，这个文件只是还没来得及改造；还是
- 已经改造过，但改动丢失了。

动手前值得先确认——修复本身很小（删掉循环，调用 `fetchPurchaseHistories(supabaseAdmin, ids)`），但它应当和那份进行中的工作一起落地，而不是与之冲突。

## 修法

把循环换成一次 `fetchPurchaseHistories(supabaseAdmin, productRows.map(p => p.id))` 调用，将结果映射回 `ProductConsumptionCheck` 列表，并删除已成为死代码的 `ReceiptItemHistoryRow` 接口。然后把 `low-stock-check.test.ts` 中 `"currently issues one purchase-history query per Product"` 这条特征化测试——以及随之而来的内联归一化测试——替换为一条断言：该模块被调用了一次，且带上了全部 Product id。
