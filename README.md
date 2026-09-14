# Grocery Receipt Tracker

A family-shared web app for photographing grocery receipts and tracking spending/unit-price trends. Full requirements are in `.scratch/grocery-receipt-tracker/spec.md` (or the formatted `spec.html`), which carries the English original followed by its Chinese translation in the same file.

## Stack

React + TypeScript + Vite, deployed on Vercel. Backend logic lives in `/api` as Vercel Serverless Functions. Supabase provides the database, auth, and storage.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Claude values (see below)
npm run dev
```

## Supabase

Project: **Eason's Project** (`xflabzrcowhqjvvwjrbt`, `ap-southeast-2`) in the `Eason Chen` org — reused from an existing paused project rather than a new one, since the free tier caps active projects at 2. `eason-crm-demo` was paused to make room; unpause it from the Supabase dashboard if you need it back (that'll require pausing this project or upgrading the org's plan first).

`.env.local` already has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` filled in (safe to expose client-side). You still need to fill in yourself, from the Supabase dashboard → Settings → API:

- `SUPABASE_SERVICE_ROLE_KEY` — used only inside `/api`, never sent to the client.
- `CLAUDE_API_KEY` — from the Anthropic console, also server-side only.
- `CRON_SECRET` — any long random string of your own choosing (not from a dashboard). Add the same value to the Vercel project's env vars, where Vercel Cron reads it and sends it as `Authorization: Bearer $CRON_SECRET` to `api/cron/low-stock-check.ts`. That route sweeps every Circle with the service-role client, so the secret is its only access control — leaving it unset doesn't disable the check, it makes the route refuse every caller.

Schema (`supabase/migrations/`) mirrors spec.md Section 5: `circles`, `profiles` (including `display_name`, shown for the receipt list's uploader filter and Circle Settings), `categories` (seeded with the fixed category list, refined post-launch into finer food subcategories — see spec.md Section 9), `products`, `receipts`, `receipt_items`, `edit_logs`, `alerts` (shared table for price-spike and low-stock alerts), `global_admins`, and `user_ai_access` (Section 16). RLS is enabled on every table — members can see everything in their circle, but can only edit/delete rows they uploaded themselves (Sections 2, 4). The `receipts` storage bucket is private, path-scoped by `circle_id`. The old `ai_spend_limit` singleton table is still present but unused (superseded by `user_ai_access`), kept only for a possible later cleanup migration.

`user_ai_access` tracks Claude API access **per user**, not globally: a brand-new user gets exactly one free successful recognition call (count-based), then needs a global admin to grant them a real dollar-based credit (default $1, or custom) via the admin dashboard — granting is always a reset (zeroes spend, sets a fresh cap), never a top-up. `api/receipts/recognize.ts` checks this before every OCR call and refuses (402) once a user is over their allowance; nothing resets it automatically. Model choice is **Claude Haiku 4.5** (`claude-haiku-4-5`), picked for cost — structured extraction doesn't need Opus/Sonnet-tier pricing.

The admin dashboard (Section 16) lives at the non-obvious path in `ADMIN_DASHBOARD_PATH` (`src/lib/adminApi.ts`), reachable only by the account flagged in `global_admins` (currently just `nz.eason.chen@gmail.com`) — everyone else gets a 404, not a login redirect. From there, the admin can see every user across every circle, ban/unban accounts (Supabase Auth's own ban mechanism), grant AI credit, and merge several standalone-circle users into one shared circle (`merge_users_into_new_circle`, a Postgres function callable only by the service role — see below for why this replaced invite links).

Not yet handled — needs an email-sending service (Supabase's built-in option or Resend) the project doesn't have configured yet:

- Emailing price-spike/low-stock alerts — they're already detected and shown in-app (Notifications page), just not sent anywhere.

Deliberately dropped, not deferred: the invite-link "join an existing circle" flow (spec.md Section 4). The app turned out to be family-only/self-use, so instead of building an invite-token mechanism, circle consolidation became admin-driven — every signup still self-service-creates its own circle via RLS, and a global admin merges standalone circles together from the dashboard (multi-select users → one new circle, their products/receipts/alerts carried over atomically). The merge function guards against merging a user out of an already-multi-member circle, since products are circle-level and that would strand the circle's other member(s) without their data.

## Status

The app is functionally complete against spec.md, short of the email-alerting item above. In place: the full receipt upload → AI OCR/translation/categorization → duplicate check → preview/confirm flow (with EditLog tracking every corrected field, and the recognition prompt telling Claude a promotional item is still the same product as its regular-price counterpart, so it matches the same standardized Product/category instead of splitting off); all pages from Section 15 wired to real data (Home, Receipts — sorted newest-first with an upload-time tiebreak for same-day receipts, with per-row delete that also cleans up the stored image, and a detail view for `confirmed` receipts that its own uploader can also edit inline (name/quantity/unit price/promotion/purchase date/weight-volume spec, ticket 16) — both the detail and review screens now also show an item's weight/volume spec (e.g. "2L") next to its price, not just in the edit form — Product Detail with its price-trend chart/store comparison/consumption estimate, Monthly Report, Notifications, Circle Settings' member management (Dissolve circle is hidden behind a flag now that circle consolidation is admin-driven, see above), and the upload/review flow); price-spike and low-stock alerts (the latter via a daily Vercel Cron job); and the Section 7 bilingual toggle, amended post-launch to translate fixed UI chrome as well as dynamic content. Every date-range picker (receipt list filters, CSV export range, and the confirmed-receipt purchase-date editor) uses the same custom year→month→day popover, day-precise — briefly month-only for consistency, then amended post-launch back to day precision once that proved awkward for editing an exact purchase date, gaining a year-grid step (jump straight to a distant year) along the way. The monthly report's own month nav stays month-only (browsing "which month" is inherently monthly) but got the same icon-only redesign — no Previous/Next text buttons, just the calendar icon and its popover, which also gained the year-grid plus a "Today" button that appears whenever viewing a past month. The report's category breakdown expands into a per-product list (boxed in a fieldset when open, the category button itself highlighted), each product showing a red "Saved $X" badge summing its promotional savings that month — informational only, since spend totals already reflect what was actually paid, never a separate negative line. CSV export itself is currently hidden behind a flag (`SHOW_EXPORT_CSV` in `MonthlyReport.tsx`) pending a product decision, code kept intact. The Section 9 category taxonomy was refined post-launch into finer food subcategories (see Supabase section above). A real visual design pass (palette, type, card-based lists, the bottom nav, green "price pill" highlights on Home) replaced the original unstyled scaffolding. The Section 16 admin dashboard (per-user AI credit, ban/unban, circle merge) is also built and live.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# Grocery Receipt Tracker（超市小票记账追踪工具）

一个面向家庭共享使用的网页应用：拍照上传超市小票，追踪消费和单价变化趋势。完整需求文档见 `.scratch/grocery-receipt-tracker/spec.md`（或排版好的 `spec.html`），英文原文和中文翻译在同一个文件里。

## 技术栈

React + TypeScript + Vite，部署在 Vercel 上。后端逻辑放在 `/api` 目录，以 Vercel Serverless Functions 的形式运行。Supabase 提供数据库、认证和存储。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入 Supabase 和 Claude 相关配置（见下文）
npm run dev
```

## Supabase

项目：**Eason's Project**（`xflabzrcowhqjvvwjrbt`，`ap-southeast-2`），位于 `Eason Chen` 组织下——复用了一个已有的暂停项目，而不是新建，因为免费套餐最多只能有 2 个活跃项目。`eason-crm-demo` 已被暂停以腾出名额；如果需要恢复它，请去 Supabase 控制台手动恢复（这会需要先暂停本项目或升级组织套餐）。

`.env.local` 里已经填好了 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（可以安全地暴露给客户端）。你还需要自己从 Supabase 控制台 → Settings → API 里填入：

- `SUPABASE_SERVICE_ROLE_KEY` —— 只在 `/api` 内部使用，绝不发给客户端。
- `CLAUDE_API_KEY` —— 从 Anthropic 控制台获取，同样只用于服务端。
- `CRON_SECRET` —— 自己随便取一个足够长的随机字符串（不是从某个控制台拿的）。同一个值也要加到 Vercel 项目的环境变量里，Vercel Cron 会从那里读取，并以 `Authorization: Bearer $CRON_SECRET` 的形式发给 `api/cron/low-stock-check.ts`。该路由用 service-role client 扫描所有 Circle，因此这个密钥就是它全部的访问控制——不设置它并不会关掉检查，而是会让该路由拒绝所有调用方。

数据库结构（`supabase/migrations/`）对应 spec.md 第 5 节：`circles`、`profiles`（含 `display_name`，用于小票列表的上传人筛选和圈子设置页）、`categories`（已预置固定分类目录，上线后又把食品类进一步细分——见 spec.md 第 9 节）、`products`、`receipts`、`receipt_items`、`edit_logs`、`alerts`（价格异常和库存提醒共用的一张表）、`global_admins`、以及 `user_ai_access`（第 16 节）。每张表都开启了 RLS——圈子成员可以看到圈内的所有数据，但只能修改/删除自己上传的记录（对应第 2、4 节）。`receipts` 存储 bucket 是私有的，按 `circle_id` 分路径隔离。旧的 `ai_spend_limit` 单例表还在，但已经不用了（被 `user_ai_access` 取代），保留着只是为了以后可能的清理迁移。

`user_ai_access` 是**按用户**追踪 Claude API 访问权限的，不是全局的：全新用户拿到恰好 1 次免费成功识别（按次数算），用完之后需要全局管理员通过管理后台给他分配一份真正的按金额算的额度（默认 $1，或自定义）——分配额度永远是重置（清零已用、设新上限），不是累加充值。`api/receipts/recognize.ts` 在每次识别调用前都会检查，一旦某个用户超出自己的额度就拒绝（返回 402）；不会自动重置。模型选用 **Claude Haiku 4.5**（`claude-haiku-4-5`），出于成本考虑——结构化提取任务不需要 Opus/Sonnet 级别的定价。

管理后台（第 16 节）部署在 `ADMIN_DASHBOARD_PATH`（`src/lib/adminApi.ts`）里那个不规律的路径上，只有 `global_admins` 表里标记的账号（目前只有 `nz.eason.chen@gmail.com`）能访问——其他人访问会看到 404，而不是跳转登录页。管理员可以在那里看到所有圈子的所有用户，禁用/启用账号（用 Supabase Auth 自带的封禁机制），分配 AI 额度，以及把几个各自独立圈子的用户合并成一个共用圈子（`merge_users_into_new_circle`，一个只有 service role 能调用的 Postgres 函数——下面会讲为什么这个功能取代了邀请链接）。

尚未处理——需要一个邮件发送服务（Supabase 内置的或 Resend），项目里还没配置：

- 把价格异常/库存提醒发邮件出去——目前这些提醒已经会被检测到并显示在应用内（通知中心页面），只是还没有发送渠道。

主动放弃、不是延后：邀请链接"加入已有圈子"的流程（spec.md 第 4 节）。这个应用最终定位是只给自己家人用，所以没有去做邀请 token 机制，圈子的合并改成了由管理员来操作——每个新账号注册时依然会像原来一样自助创建自己的圈子（靠 RLS 实现），然后由全局管理员在后台把几个独立圈子的用户合并到一起（多选几个用户 → 合并成一个新圈子，他们的商品/小票/提醒记录会原子性地一起搬过去）。这个合并函数会拒绝把一个用户从"已经有其他成员"的圈子里选出来合并，因为商品是圈子级别的数据，这么做会导致圈子里其他成员的数据被搬空。

## 状态

除了上面邮件相关的功能外，这个应用已经按 spec.md 做完了。已实现：完整的"拍照上传 → AI 识别/翻译/分类 → 查重 → 预览确认"流程（每个被修正的字段都记录到 EditLog；识别用的 prompt 也告诉 AI，促销商品本质上还是跟正常价商品同一个产品，匹配时要落到同一个标准化 Product/分类上，不要拆成新商品）；第 15 节列出的页面都接了真实数据（首页、小票列表——按时间倒序排列，同一天上传的小票按上传时间再排一次，每条记录可删除且会同时清掉 Storage 里的原图，已 `confirmed` 的小票有详情页，上传人本人还能在页面上内联编辑（商品名/数量/单价/促销/购买日期/重量体积规格，票16）——详情页和确认页现在也会在价格旁边显示商品的重量/体积规格（比如"2L"），不再只有编辑模式才看得到、商品详情页含价格趋势图/多店比价/消耗速度估算、月度报告、通知中心、圈子设置的成员管理（"解散圈子"功能目前用开关隐藏了，因为圈子合并现在是管理员在操作，见上文）、以及上传/确认流程）；价格异常和库存提醒（后者通过每日运行的 Vercel Cron 任务）；以及第 7 节的双语切换开关（上线后修订为连界面固定文案一起翻译，不只是数据内容）。所有需要选日期范围的地方（小票列表筛选、CSV 导出范围、已确认小票的购买日期编辑）都用同一个"先选年再选月再选日"的自定义弹出选择器，精确到日——曾经短暂改成只精确到月以保持一致，上线后又因为不便于修正具体购买日期而改了回来，之后又加了"选年份"这一步（可以直接跳到很久以前的某一年）。月度报告自己的月份导航不受影响，仍然只精确到月（浏览"看哪个月"这件事本来就是按月的概念），但也做了同样的图标化改造——去掉了"上一月/下一月"文字按钮，只留日历图标，弹出的选择器也加了年份网格，以及一个"回到本月"按钮（查看的不是本月时才会出现）。报告页的分类明细现在能展开成具体商品列表（展开时包在一个框里，分类按钮本身会高亮），每个商品价格旁边如果这个月有促销购买，会多一个红底白字的"Saved $X"标签，汇总这个月促销省了多少钱——纯展示用，因为总价本来就已经是实际付的钱，不会另外记一笔负数。CSV 导出功能目前因产品决定暂时用一个开关（`MonthlyReport.tsx` 里的 `SHOW_EXPORT_CSV`）隐藏，代码保留。第 9 节的分类目录上线后又做了细化，拆出了更细的食品子类（见上面 Supabase 部分）。原本没有样式的脚手架界面也已经换成了一版真正的视觉设计（配色、字体、卡片式列表、底部导航，首页还加了绿底白字的价格高亮）。第 16 节的管理后台（按用户 AI 额度、禁用/启用账号、合并圈子）也已经做完并上线。
