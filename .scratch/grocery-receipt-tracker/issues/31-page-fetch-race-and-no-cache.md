Type: bug
Status: resolved
GitHub: #35

## Problem

Every page loads its data with a bare `useEffect` + `.then(setState)`, e.g. `src/pages/ProductDetail.tsx`:

```ts
useEffect(() => {
  if (!productId) return;
  fetchProductDetail(productId)
    .then(setDetail)
    .catch((err) => setError(errorMessage(err, "Failed to load product")));
}, [productId]);
```

No page cancels a stale request. That causes these problems:

- **Race**: navigate from product A to product B quickly, and if A's response lands after B's, the page shows A's data under B's URL.
- **Set-after-unmount**: a response arriving after the user has left the page still calls `setState`.
- **No cache**: every navigation refetches; going back to a page shows the spinner again.
- **No invalidation**: after a mutation (e.g. confirming a receipt on the review page), other pages only update when they're re-entered.
- Loading/error state is hand-rolled per page.

## Fix

Minimum (fixes the correctness bug): give every data-loading `useEffect` in `src/pages/` a cancelled flag in its cleanup, so a stale response is discarded.

Later, if the page count keeps growing: consider TanStack Query for caching, retries and mutation invalidation. That's a separate decision — record it as an ADR if taken.

## Tests

For at least one page: render with id A, rerender with id B, resolve B before A → the page shows B.

## Resolution

New hook `src/lib/useLatestRequest.ts`: each data-loading effect gets a "still current?" check, and a response that arrives after a newer request started (or after unmount) is dropped instead of written to state. All nine pages use it — ProductDetail, ReceiptReview, ReceiptDetail, MonthlyReport, Home, Notifications, CircleSettings, ReceiptList, AdminDashboard — including ReceiptList's filter submit, so two quick submits can't land out of order. Covered by a route-change race test in `src/pages/ProductDetail.test.tsx` and a double-submit test in `src/pages/ReceiptList.test.tsx`. No cache was added: TanStack Query stays the ticket's "later" option, not taken, so no ADR.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

每个页面都用裸的 `useEffect` + `.then(setState)` 加载数据，例如 `src/pages/ProductDetail.tsx`（代码见上方英文部分）。

没有任何页面会取消过期的请求。这会导致以下问题：

- **竞态**：从商品 A 快速切到商品 B，如果 A 的响应比 B 晚到，页面会在 B 的 URL 下显示 A 的数据。
- **卸载后仍 setState**：用户已经离开页面，迟到的响应仍然会调用 `setState`。
- **没有缓存**：每次切换页面都重新请求，返回上一页也会重新转圈。
- **修改后不刷新**：执行修改操作后（比如在核对页确认小票），其他页面要重新进入才会更新。
- 加载和错误状态每个页面各写一遍。

## 修复

最小改法（修复正确性问题）：给 `src/pages/` 里每个加载数据的 `useEffect` 在清理函数中加一个 cancelled 标记，丢弃过期响应。

以后如果页面越来越多：可以考虑引入 TanStack Query，解决缓存、重试和修改后失效刷新。这是另一个决定——如果采纳，记成一份 ADR。

## 测试

至少一个页面：先用 id A 渲染，再用 id B 重新渲染，让 B 先于 A 返回 → 页面显示 B。

## 解决方案

新增 hook `src/lib/useLatestRequest.ts`：每个加载数据的 effect 都能检查"自己还是不是最新请求"，如果更新的请求已经发出（或组件已卸载），迟到的响应直接丢弃，不写入 state。九个页面都用上了——ProductDetail、ReceiptReview、ReceiptDetail、MonthlyReport、Home、Notifications、CircleSettings、ReceiptList、AdminDashboard——包括 ReceiptList 的筛选提交，连续两次提交不会乱序落地。测试：`src/pages/ProductDetail.test.tsx` 的路由切换竞态测试，`src/pages/ReceiptList.test.tsx` 的连续提交测试。没有加缓存：TanStack Query 仍是 ticket 里"以后再说"的选项，这次没采用，所以没有 ADR。
