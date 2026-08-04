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

数据库结构（`supabase/migrations/`）对应 spec.md 第 5 节：`circles`、`profiles`、`categories`（已预置 9 个固定分类）、`products`、`receipts`、`receipt_items`、`edit_logs`。每张表都开启了 RLS——圈子成员可以看到圈内的所有数据，但只能修改/删除自己上传的记录（对应第 2、4 节）。`receipts` 存储 bucket 是私有的，按 `circle_id` 分路径隔离。

还有一张 `ai_spend_limit` 表——一个单例行，记录 Claude API 的累计花费，对照一个**全局硬性上限（默认 $1）**。这不是按用户或按调用次数限制：一旦 `spent_usd` 达到 `cap_usd`，后端应当拒绝后续的识别调用（见 `api/receipts/recognize.ts` 里的 `TODO`），直到圈子 owner 手动调高 `cap_usd`——不会自动重置。模型选用 **Claude Haiku 4.5**（`claude-haiku-4-5`），出于成本考虑——结构化提取任务不需要 Opus/Sonnet 级别的定价。

尚未处理：邀请链接"加入已有圈子"的流程（02 号 ticket 把具体机制留给开发阶段决定）——目前的数据库结构只支持"注册 → 成为新圈子的 owner"这条自助路径（靠 RLS 实现）。加入邀请需要在 token 机制设计完之后，用一个 service-role 的服务端函数来实现。

## 状态

脚手架和 Supabase 数据库结构已就绪——路由、类型定义和页面骨架对应 spec 的结构（第 15 节），数据库/RLS 对应第 5 节。实际的 OCR/翻译调用、商品匹配、价格/消耗计算、提醒逻辑尚未实现（见 `api/` 目录里的 `TODO`）。
