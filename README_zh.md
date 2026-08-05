# Grocery Receipt Tracker（超市小票记账追踪工具）

一个面向家庭共享使用的网页应用：拍照上传超市小票，追踪消费和单价变化趋势。完整需求文档见 `.scratch/grocery-receipt-tracker/spec.md`（或排版好的 `spec.html`）；中文版是 `spec_zh.md`。

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

数据库结构（`supabase/migrations/`）对应 spec.md 第 5 节：`circles`、`profiles`（含 `display_name`，用于小票列表的上传人筛选和圈子设置页）、`categories`（已预置 9 个固定分类）、`products`、`receipts`、`receipt_items`、`edit_logs`、`alerts`（价格异常和库存提醒共用的一张表）、以及 `ai_spend_limit`。每张表都开启了 RLS——圈子成员可以看到圈内的所有数据，但只能修改/删除自己上传的记录（对应第 2、4 节）。`receipts` 存储 bucket 是私有的，按 `circle_id` 分路径隔离。

`ai_spend_limit` 是一个单例行，记录 Claude API 的累计花费，对照一个**全局硬性上限（默认 $1）**。这不是按用户或按调用次数限制：`api/receipts/recognize.ts` 在每次识别调用前都会检查，一旦 `spent_usd` 达到 `cap_usd` 就拒绝（返回 402），直到圈子 owner 手动调高 `cap_usd`——不会自动重置。模型选用 **Claude Haiku 4.5**（`claude-haiku-4-5`），出于成本考虑——结构化提取任务不需要 Opus/Sonnet 级别的定价。

尚未处理——以下两项都需要一个邮件发送服务（Supabase 内置的或 Resend），项目里还没配置：

- 邀请链接"加入已有圈子"的流程（spec.md 第 4 节）——目前的数据库结构只支持"注册 → 成为新圈子的 owner"这条自助路径（靠 RLS 实现）。加入邀请需要在 token 机制设计完之后，用一个 service-role 的服务端函数来实现。
- 把价格异常/库存提醒发邮件出去——目前这些提醒已经会被检测到并显示在应用内（通知中心页面），只是还没有发送渠道。

## 状态

除了上面两项依赖邮件服务的功能外，这个应用已经按 spec.md 做完了。已实现：完整的"拍照上传 → AI 识别/翻译/分类 → 查重 → 预览确认"流程（每个被修正的字段都记录到 EditLog）；第 15 节列出的 7 个页面都接了真实数据（首页、小票列表、商品详情页含价格趋势图/多店比价/消耗速度估算、月度报告含 CSV 导出、通知中心、圈子设置的成员管理、以及上传/确认流程）；价格异常和库存提醒（后者通过每日运行的 Vercel Cron 任务）；以及第 7 节的双语显示切换开关。原本没有样式的脚手架界面也已经换成了一版真正的视觉设计（配色、字体、底部导航）。
