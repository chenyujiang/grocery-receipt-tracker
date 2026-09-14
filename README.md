# Grocery Receipt Tracker

A family-shared web app for photographing grocery receipts and tracking spending/unit-price trends. Full requirements are in `.scratch/grocery-receipt-tracker/spec.md` (or the formatted `spec.html`), which carries the English original followed by its Chinese translation in the same file. The planning history behind each decision is in `map.md` and `issues/` alongside it.

## Stack

React + TypeScript + Vite, deployed on Vercel. Backend logic lives in `/api` as Vercel Serverless Functions. Supabase provides the database, auth, and storage.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the server-side values (see below)
npm run dev
```

Other commands: `npm run build`, `npm run typecheck`, `npm test`.

## Environment

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are client-side and safe to expose. The rest are server-side only:

- `SUPABASE_SERVICE_ROLE_KEY` — used only inside `/api`, never sent to the client. Supabase dashboard → Settings → API.
- `CLAUDE_API_KEY` — from the Anthropic console.
- `CRON_SECRET` — any long random string of your own choosing. Add the same value to the Vercel project's env vars, where Vercel Cron reads it and sends it as `Authorization: Bearer $CRON_SECRET` to `api/cron/low-stock-check.ts`. That route sweeps every Circle with the service-role client, so the secret is its only access control — leaving it unset doesn't disable the check, it makes the route refuse every caller.

## Supabase

Project: **Eason's Project** (`xflabzrcowhqjvvwjrbt`, `ap-southeast-2`).

Schema (`supabase/migrations/`) mirrors spec.md Section 5: `circles`, `profiles`, `categories`, `products`, `receipts`, `receipt_items`, `edit_logs`, `alerts` (shared by price-spike and low-stock alerts), `global_admins`, and `user_ai_access` (Section 16). RLS is enabled on every table — members can see everything in their circle, but can only edit/delete rows they uploaded themselves (Sections 2, 4). The `receipts` storage bucket is private, path-scoped by `circle_id`.

## AI access control

`user_ai_access` tracks Claude API access **per user**, not globally: a brand-new user gets 5 free successful recognition calls (count-based), then needs a global admin to grant them a dollar-based credit (default $1, or custom) via the admin dashboard. Granting is always a reset (zeroes spend, sets a fresh cap), never a top-up, and nothing resets automatically. `api/receipts/recognize.ts` checks this before every OCR call and refuses with 402 once a user is over their allowance. The model is pinned to **Claude Haiku 4.5** (`claude-haiku-4-5`) for cost — structured extraction doesn't need Opus/Sonnet-tier pricing.

## Admin dashboard

Lives at the non-obvious path in `ADMIN_DASHBOARD_PATH` (`src/lib/adminApi.ts`), reachable only by accounts flagged in `global_admins` — everyone else gets a 404, not a login redirect. From there an admin can see every user across every circle, ban/unban accounts (Supabase Auth's own ban mechanism), grant AI credit, and merge several standalone-circle users into one shared circle (`merge_users_into_new_circle`, a Postgres function callable only by the service role).

## Status

Functionally complete against spec.md. Known gaps:

- **Email alerting is not implemented.** Price-spike and low-stock alerts are detected and shown in-app (Notifications page), but not sent anywhere — that needs an email service (Supabase's built-in option or Resend) the project hasn't configured.
- **CSV export is hidden** behind `SHOW_EXPORT_CSV` in `MonthlyReport.tsx`, pending a product decision. Code is intact.
- **Dissolve circle is hidden** behind `SHOW_DISSOLVE_CIRCLE` in `CircleSettings.tsx`, now that circle consolidation is admin-driven rather than something an owner does unilaterally.
- The old `ai_spend_limit` singleton table is still present but unused (superseded by `user_ai_access`), kept only for a possible later cleanup migration.

Deliberately dropped, not deferred: the invite-link "join an existing circle" flow (spec.md Section 4). The app is family-only/self-use, so circle consolidation became admin-driven instead — every signup still self-service-creates its own circle, and an admin merges standalone circles together from the dashboard, carrying products/receipts/alerts over atomically. The merge function refuses to merge a user out of an already-multi-member circle, since products are circle-level and that would strand the circle's other members without their data.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# Grocery Receipt Tracker（超市小票记账追踪工具）

一个面向家庭共享使用的网页应用：拍照上传超市小票，追踪消费和单价变化趋势。完整需求文档见 `.scratch/grocery-receipt-tracker/spec.md`（或排版好的 `spec.html`），英文原文和中文翻译在同一个文件里。每个决策背后的规划过程记录在同目录下的 `map.md` 和 `issues/` 里。

## 技术栈

React + TypeScript + Vite，部署在 Vercel 上。后端逻辑放在 `/api` 目录，以 Vercel Serverless Functions 的形式运行。Supabase 提供数据库、认证和存储。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入服务端配置（见下文）
npm run dev
```

其他命令：`npm run build`、`npm run typecheck`、`npm test`。

## 环境变量

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 是客户端变量，可以安全暴露。其余的只用于服务端：

- `SUPABASE_SERVICE_ROLE_KEY` —— 只在 `/api` 内部使用，绝不发给客户端。在 Supabase 控制台 → Settings → API 获取。
- `CLAUDE_API_KEY` —— 从 Anthropic 控制台获取。
- `CRON_SECRET` —— 自己随便取一个足够长的随机字符串。同一个值也要加到 Vercel 项目的环境变量里，Vercel Cron 会从那里读取，并以 `Authorization: Bearer $CRON_SECRET` 的形式发给 `api/cron/low-stock-check.ts`。该路由用 service-role client 扫描所有 Circle，因此这个密钥就是它全部的访问控制——不设置它并不会关掉检查，而是会让该路由拒绝所有调用方。

## Supabase

项目：**Eason's Project**（`xflabzrcowhqjvvwjrbt`，`ap-southeast-2`）。

数据库结构（`supabase/migrations/`）对应 spec.md 第 5 节：`circles`、`profiles`、`categories`、`products`、`receipts`、`receipt_items`、`edit_logs`、`alerts`（价格异常和库存提醒共用一张表）、`global_admins`、以及 `user_ai_access`（第 16 节）。每张表都开启了 RLS——圈子成员可以看到圈内的所有数据，但只能修改/删除自己上传的记录（对应第 2、4 节）。`receipts` 存储 bucket 是私有的，按 `circle_id` 分路径隔离。

## AI 额度控制

`user_ai_access` 是**按用户**追踪 Claude API 访问权限的，不是全局的：全新用户有 5 次免费成功识别（按次数算），用完之后需要全局管理员通过管理后台分配一份按金额算的额度（默认 $1，或自定义）。分配额度永远是重置（清零已用、设新上限），不是累加充值，也不会自动重置。`api/receipts/recognize.ts` 在每次识别调用前都会检查，一旦超出额度就返回 402 拒绝。模型固定为 **Claude Haiku 4.5**（`claude-haiku-4-5`），出于成本考虑——结构化提取任务不需要 Opus/Sonnet 级别的定价。

## 管理后台

部署在 `ADMIN_DASHBOARD_PATH`（`src/lib/adminApi.ts`）里那个不规律的路径上，只有 `global_admins` 表里标记的账号能访问——其他人访问会看到 404，而不是跳转登录页。管理员可以在那里看到所有圈子的所有用户，禁用/启用账号（用 Supabase Auth 自带的封禁机制），分配 AI 额度，以及把几个各自独立圈子的用户合并成一个共用圈子（`merge_users_into_new_circle`，一个只有 service role 能调用的 Postgres 函数）。

## 状态

已按 spec.md 做完。已知的缺口：

- **邮件提醒尚未实现。** 价格异常和库存提醒已经会被检测到并显示在应用内（通知中心页面），但还没有发送渠道——这需要一个项目里还没配置的邮件服务（Supabase 内置的或 Resend）。
- **CSV 导出已隐藏**，开关是 `MonthlyReport.tsx` 里的 `SHOW_EXPORT_CSV`，等产品决定，代码保留。
- **解散圈子已隐藏**，开关是 `CircleSettings.tsx` 里的 `SHOW_DISSOLVE_CIRCLE`，因为圈子合并现在由管理员操作，不应该由某个成员单方面解散。
- 旧的 `ai_spend_limit` 单例表还在，但已经不用了（被 `user_ai_access` 取代），保留着只是为了以后可能的清理迁移。

主动放弃、不是延后：邀请链接"加入已有圈子"的流程（spec.md 第 4 节）。这个应用最终定位是只给自己家人用，所以圈子的合并改成了由管理员来操作——每个新账号注册时依然会自助创建自己的圈子，然后由全局管理员在后台把几个独立圈子合并到一起，他们的商品/小票/提醒记录会原子性地一起搬过去。这个合并函数会拒绝把一个用户从"已经有其他成员"的圈子里选出来合并，因为商品是圈子级别的数据，这么做会导致圈子里其他成员的数据被搬空。
