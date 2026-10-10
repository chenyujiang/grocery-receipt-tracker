Type: task
Status: ready-for-agent
GitHub: #36

## Problem

`src/App.tsx` imports every page statically, so the whole app ships as one bundle. That includes `AdminDashboard` and `ADMIN_DASHBOARD_PATH`, which every signed-in user downloads. Security isn't affected — every `api/admin/` route re-checks `global_admins` server-side — but the "non-obvious path" from issue 15 is readable by anyone who opens the bundle, which weakens the point of hiding it.

## Fix

Load `AdminDashboard` with `React.lazy` + `Suspense`, so it gets its own chunk and is fetched only after `RequireGlobalAdmin` passes. Optionally lazy-load the other heavier pages too (`MonthlyReport`, `ReceiptReview`).

Note: the path constant itself still lives in `src/lib/adminApi.ts`, which the main bundle imports for routing and the post-login redirect. Fully hiding it would mean moving the redirect target server-side. Decide whether that's worth it; if it isn't, say so here.

## Related, lower priority (no separate ticket)

- `src/index.css` is a single ~840-line global stylesheet. Class-name collisions and dead rules get harder to spot as it grows. Revisit (CSS Modules or per-component files) if it keeps growing.
- Error fallback strings are still English in Chinese mode — already tracked in CLAUDE.md as an open follow-up.

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
