Type: task
Status: resolved
GitHub: #36

## Problem

`src/App.tsx` imports every page statically, so the whole app ships as one bundle. That includes `AdminDashboard` and `ADMIN_DASHBOARD_PATH`, which every signed-in user downloads. Security isn't affected — every `api/admin/` route re-checks `global_admins` server-side — but the "non-obvious path" from issue 15 is readable by anyone who opens the bundle, which weakens the point of hiding it.

## Fix

Load `AdminDashboard` with `React.lazy` + `Suspense`, so it gets its own chunk and is fetched only after `RequireGlobalAdmin` passes. Optionally lazy-load the other heavier pages too (`MonthlyReport`, `ReceiptReview`).

Note: the path constant itself still lives in `src/lib/adminApi.ts`, which the main bundle imports for routing and the post-login redirect. Fully hiding it would mean moving the redirect target server-side. Decide whether that's worth it; if it isn't, say so here.

## Related, lower priority (no separate ticket)

- `src/index.css` is a single ~840-line global stylesheet. Class-name collisions and dead rules get harder to spot as it grows. Revisit (CSS Modules or per-component files) if it keeps growing.
- Error fallback strings are still English in Chinese mode — already tracked in CLAUDE.md as an open follow-up.

## Resolution

`src/App.tsx` now lazy-loads `AdminDashboard`, `MonthlyReport` and `ReceiptReview` with `React.lazy` + `Suspense fallback={null}`. The admin route's `Suspense` sits inside `RequireGlobalAdmin`, so a non-admin gets the 404 and never fetches the chunk. `npm run build` emits `AdminDashboard-*.js` (~5 kB) separately. Covered by `src/App.test.tsx`.

**Decision: the path constant stays client-side.** Moving `ADMIN_DASHBOARD_PATH` and the post-login redirect server-side isn't worth it. The path was never a security boundary — every `api/admin/` route re-checks `global_admins` server-side, and a non-admin who finds the path gets a 404 and no dashboard code. Hiding the string would only add a server round-trip to every login for a one-admin, family-only app.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

`src/App.tsx` 静态导入所有页面，整个应用打成一个包。这个包也包括 `AdminDashboard` 和 `ADMIN_DASHBOARD_PATH`，每个已登录用户都会下载。安全上没影响——`api/admin/` 下每个接口都会在服务端重新检查 `global_admins`——但 issue 15 里"不显眼的路径"在包里谁都能读到，藏起来的意义就打了折扣。

## 修复

用 `React.lazy` + `Suspense` 加载 `AdminDashboard`，让它单独成一个 chunk，只在 `RequireGlobalAdmin` 通过后才下载。也可以顺便把其他较重的页面改成懒加载（`MonthlyReport`、`ReceiptReview`）。

注意：路径常量本身仍在 `src/lib/adminApi.ts` 里，主包要用它做路由和登录后跳转。要彻底藏住，需要把跳转目标挪到服务端。先判断值不值得；如果不值得，在这里写明原因。

## 相关但优先级更低（不单独开 ticket）

- `src/index.css` 是一个约 840 行的全局样式文件。文件越大，类名冲突和无用规则越难发现。如果继续增长，再考虑改用 CSS Modules 或按组件拆分。
- 中文模式下错误提示的兜底文字仍是英文——CLAUDE.md 里已记为待办。

## 解决方案

`src/App.tsx` 现在用 `React.lazy` + `Suspense fallback={null}` 懒加载 `AdminDashboard`、`MonthlyReport` 和 `ReceiptReview`。管理后台路由的 `Suspense` 放在 `RequireGlobalAdmin` 里面，非管理员拿到 404，根本不会下载那个 chunk。`npm run build` 单独产出 `AdminDashboard-*.js`（约 5 kB）。测试见 `src/App.test.tsx`。

**决定：路径常量留在前端。** 把 `ADMIN_DASHBOARD_PATH` 和登录后跳转挪到服务端不值得。这个路径从来不是安全边界——`api/admin/` 下每个接口都在服务端重新检查 `global_admins`，非管理员就算找到路径也只得到 404，拿不到后台代码。藏住这个字符串只会让每次登录多一次服务端往返，对一个只有一个管理员、只给家人用的应用没有意义。
