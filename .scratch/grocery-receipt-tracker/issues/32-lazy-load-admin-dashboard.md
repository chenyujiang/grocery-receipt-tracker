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

## Answer

- **Done**: `src/App.tsx` now loads `AdminDashboard` via `React.lazy(() => import("@/pages/AdminDashboard"))`, wrapped in `<Suspense fallback={null}>` *inside* `<RequireGlobalAdmin>`, so the chunk is requested only after the global-admin check passes. The `null` fallback matches the guard's own blank render while it checks. `npm run build` now emits a separate `AdminDashboard-<hash>.js` chunk (~5 kB) alongside the main `index-<hash>.js`.
- **Scope**: only `AdminDashboard`. The optional lazy-loading of `MonthlyReport` / `ReceiptReview` was not done — this ticket is about not shipping admin code to non-admins, not general bundle size.
- **Test**: new `src/App.test.tsx` renders `App` under `MemoryRouter` with `@/lib/supabaseClient` mocked — a global admin visiting `ADMIN_DASHBOARD_PATH` sees the dashboard once Suspense resolves; a non-admin gets the 404. Chunk splitting is verified by the build output, not a unit test.
- **`ADMIN_DASHBOARD_PATH` stays in the main bundle** (`src/lib/adminApi.ts`). Moving the post-login redirect target server-side isn't worth it: every `api/admin/` route re-checks `global_admins` server-side, so knowing the path grants nothing, and hiding it would add an API round trip on every login for a purely cosmetic gain. The path remains an obscurity bonus layer, as issue 15 always framed it, not a security boundary.

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

## Answer

- **已完成**：`src/App.tsx` 现在用 `React.lazy(() => import("@/pages/AdminDashboard"))` 加载 `AdminDashboard`，外面包一层放在 `<RequireGlobalAdmin>` *里面*的 `<Suspense fallback={null}>`，所以只有全局管理员检查通过后才会请求这个 chunk。`null` 兜底和守卫自己检查期间的空白渲染一致。`npm run build` 现在会在主包 `index-<hash>.js` 之外单独产出一个 `AdminDashboard-<hash>.js` chunk（约 5 kB）。
- **范围**：只改了 `AdminDashboard`。可选的 `MonthlyReport` / `ReceiptReview` 懒加载没做——这张票的目的是不把管理员代码发给非管理员，不是整体包体积优化。
- **测试**：新增 `src/App.test.tsx`，在 `MemoryRouter` 下渲染 `App`，mock `@/lib/supabaseClient`——全局管理员访问 `ADMIN_DASHBOARD_PATH`，Suspense 加载完后能看到后台；非管理员看到 404。chunk 拆分靠构建输出验证，不写单元测试。
- **`ADMIN_DASHBOARD_PATH` 留在主包里**（`src/lib/adminApi.ts`）。把登录后跳转目标挪到服务端不值得：`api/admin/` 下每个接口都会在服务端重新检查 `global_admins`，知道路径本身拿不到任何权限；要藏住它，每次登录都要多一次 API 往返，换来的只是表面上的好处。这个路径仍只是 issue 15 一直定位的"隐蔽性附加层"，不是安全边界。
