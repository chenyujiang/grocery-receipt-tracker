# 家庭超市小票记账与价格追踪 App — 需求规划地图
# Grocery Receipt Tracking & Price Monitoring App — Requirements Planning Map

## Destination

产出一份完整的产品需求文档（spec）：面向家庭共享使用的"超市小票拍照记账 + 单价追踪"应用，支持中英双语数据内容。
Produce a complete product requirements document (spec): a family-shared "photograph grocery receipts to track spending and unit prices" web app that supports bilingual (Chinese/English) data content.

文档需定义清楚功能范围、核心数据结构、AI 识别（多模态大模型 OCR）方案、商品匹配与分类逻辑、月度涨幅对比、消耗速度分析、中英双语翻译机制，以及价格异常提醒、库存快用完提醒、隐性涨价识别、多店铺比价、数据导出/月度报告这几项附加功能。
The document must clearly define the feature scope, core data structures, the AI recognition (multimodal LLM OCR) approach, product matching and categorization logic, monthly price-change comparison, consumption-rate analysis, the bilingual translation mechanism, and the additional features: price-spike alerts, low-stock alerts, hidden price-hike detection, multi-store price comparison, and data export/monthly reports.

文档完成后交给开发阶段实现（不在本次规划范围内）。
Once the document is complete, it will be handed off to the development phase for implementation (implementation itself is out of scope for this planning effort).

## Notes

- 领域：个人/家庭消费记账 + 商品价格追踪。
  Domain: personal/family expense tracking + product price monitoring.
- 已定：小票文字识别方案使用多模态大模型（如 Claude / GPT-4V 一类），不走专用 OCR API 或自训练模型。
  Decided: receipt text recognition uses a multimodal LLM (e.g. the Claude / GPT-4V family), not a dedicated OCR API or a self-trained model.
- 已定：面向家庭共享使用（多人共同记录），非单人场景；且项目做完后计划开放给朋友使用，因此需要正式的账号注册体系，能支持多个互不相关的用户/群组各自使用（不只是单一家庭的邀请码模式）。
  Decided: built for family sharing (multiple people recording together), not a single-user scenario; the project is also planned to open up to friends after completion, so it needs a proper account/registration system that supports multiple independent users/groups, not just a single family's invite-code model.
- 已定：先做网页版（Web App），原生/跨平台 App 列入后续路线图，本轮不做。
  Decided: build the web app first; a native/cross-platform app is deferred to a future roadmap and is not part of this round.
- 已定：技术栈方向为 React.js + TypeScript + Node.js，部署 Vercel（前端/接口）+ Supabase（数据库/认证），GitHub 做版本控制。
  Decided: the tech stack direction is React.js + TypeScript + Node.js, deployed on Vercel (frontend/API) + Supabase (database/auth), with GitHub for version control.
- 已定：用户在新西兰，小票原文是英文（Countdown/New World/PAK'nSAVE 等新西兰超市），不是中文。
  Decided: the user is based in New Zealand, so receipts are originally in English (from supermarkets like Countdown, New World, PAK'nSAVE), not Chinese.
- 已定：产品需支持中英双语——动态数据内容（商品名、店铺名、分类标签）中英双语存储，`_en` 是 OCR 识别的英文原文，`_zh` 是同一次多模态大模型调用顺带翻译出的中文版本；界面固定文案（菜单、按钮）只做英文，不做切换。
  Decided: the product must support Chinese/English bilingual content — dynamic data (product names, store names, category labels) is stored bilingually, with `_en` being the OCR-recognized English source text and `_zh` the Chinese translation produced by that same multimodal-LLM call; fixed UI chrome (menus, buttons) is English-only, with no language switch.
- 沟通统一使用中文；地图和工单文档采用中英双语、逐句对照（中文在上，英文在下），呼应产品本身的双语需求。
  Communication is in Chinese throughout; the map and ticket documents are bilingual with sentence-by-sentence pairing (Chinese above, English below), mirroring the product's own bilingual requirement.
- 每张 ticket 优先用 `/grilling`（配合 `/domain-modeling` 沉淀术语和数据结构）解决；涉及外部技术选型对比时可临时借用 `/research`。
  Each ticket is preferentially resolved via `/grilling` (paired with `/domain-modeling` to capture terminology and data structures); `/research` may be borrowed temporarily when comparing external technology options.

## Decisions so far

- [平台选型（01-platform-choice）](issues/01-platform-choice.md) — 先做网页版，App 列入后续路线图；技术栈方向 React+TS+Node.js / Vercel+Supabase / GitHub。
  [Platform choice (01-platform-choice)](issues/01-platform-choice.md) — Build the web app first, native app deferred to a future roadmap; tech stack direction is React+TS+Node.js / Vercel+Supabase / GitHub.
- [账号与共享模型（02-family-sharing-model）](issues/02-family-sharing-model.md) — Supabase Auth 邮箱登录；一账号一圈子（默认上限 10 人）；owner/member 两级权限，member 只能改删自己的记录；邮箱邀请链接；店铺+日期+金额自动查重；购买人=登录邮箱。
  [Account & sharing model (02-family-sharing-model)](issues/02-family-sharing-model.md) — Supabase Auth email login; one account per circle (default cap 10 members); owner/member roles, members can only edit/delete their own records; email invite links; duplicate detection by store+date+amount; buyer field = login email.
- [小票数据结构（03-receipt-data-schema）](issues/03-receipt-data-schema.md) — 拍照→AI 识别草稿→用户预览确认入库；Receipt/ReceiptItem/EditLog 三表结构，规格拆成数值+单位，促销单独标记原价；原图 Supabase Storage 保留 12 个月；拍照上传用标准 file input 控件，兼顾拍照与相册选图。
  [Receipt data schema (03-receipt-data-schema)](issues/03-receipt-data-schema.md) — Photo upload → AI draft → user reviews and confirms before it's saved; a Receipt/ReceiptItem/EditLog three-table structure, spec split into value+unit, promotions flagged with original price kept; original photos kept 12 months in Supabase Storage; upload uses a standard file input, covering both camera capture and gallery selection.
- [分类体系（04-category-taxonomy）](issues/04-category-taxonomy.md) — 两级固定预设分类目录（食品/日用品等 9 大类）；AI 只能从预设列表选，不自造类目；记住用户手动修正，同名商品自动沿用。
  [Category taxonomy (04-category-taxonomy)](issues/04-category-taxonomy.md) — A two-level, system-fixed category list (9 top-level categories such as food/household); AI must pick from the preset list, never invent categories; user corrections are remembered and auto-applied to the same product name.
- [中英双语策略（09-bilingual-content-strategy）](issues/09-bilingual-content-strategy.md) — 仅动态数据内容双语（商品名/店铺名/分类），存成 `_zh`/`_en` 两列，`_en` 是 OCR 英文原文，`_zh` 是同一次大模型调用顺带产出的翻译；界面固定文案只做英文；连带更新了 03、04 号 ticket 的字段设计。
  [Bilingual content strategy (09-bilingual-content-strategy)](issues/09-bilingual-content-strategy.md) — Only dynamic data content is bilingual (product names/store names/categories), stored as `_zh`/`_en` columns, with `_en` as the OCR English source text and `_zh` as the translation produced by that same LLM call; fixed UI chrome is English-only; this required updating the field design of tickets 03 and 04.
- [商品匹配策略（05-product-matching-strategy）](issues/05-product-matching-strategy.md) — AI 建议匹配候选，用户在预览确认流程里确认/改；不处理条码；规格变化仍算同一商品，规格是购买记录的属性；新增 Product 表（`product_id`），06/07 号 ticket 按 `product_id` 分组统计，分类记忆的 key 也迁移到 `product_id`。
  [Product matching strategy (05-product-matching-strategy)](issues/05-product-matching-strategy.md) — AI suggests a match candidate, the user confirms/changes it in the existing preview flow; barcodes are not handled; spec changes still count as the same product, with spec as a per-purchase-record attribute; adds a Product table (`product_id`) that tickets 06/07 will group by, and category memory's key also migrates to `product_id`.
- [涨幅计算逻辑（06-price-change-calculation）](issues/06-price-change-calculation.md) — 和上一次购买价对比，排除促销行；按重量/体积统一换算成每 100g/100ml 比较，计数类不换算；页面展示涨幅榜单+单品趋势图+红涨绿跌配色。
  [Price-change calculation (06-price-change-calculation)](issues/06-price-change-calculation.md) — Compares against the last purchase price, excluding promotional rows; weight/volume units are normalized to a per-100g/100ml basis before comparing, count-based units are not normalized; the page shows a price-change leaderboard, a per-product trend chart, and red/green color coding for increases/decreases.
- [消耗速度计算（07-consumption-rate-calculation）](issues/07-consumption-rate-calculation.md) — 近 5 次购买滑动窗口（总量÷总天数）算日均消耗；不足 3 次购买不估算；预计剩余天数 < 5 天触发提醒；完全自动推算，不需要用户手动标记用完/没用完。
  [Consumption-rate calculation (07-consumption-rate-calculation)](issues/07-consumption-rate-calculation.md) — A sliding window of the last 5 purchases (total quantity ÷ total days) gives the average daily consumption rate; fewer than 3 purchases means no estimate is shown; a reminder triggers when estimated days remaining drops below 5; fully automatic, with no manual "used up / not used up" marking required.
- [技术栈与数据存储（08-tech-stack-storage）](issues/08-tech-stack-storage.md) — OCR+翻译用 Anthropic Claude API；调用必须经 Vercel Serverless Function 后端中转，API Key 不进前端；每人每月调用次数设上限；小票图片存私有 Supabase Storage bucket，靠签名 URL 访问。
  [Tech stack & storage (08-tech-stack-storage)](issues/08-tech-stack-storage.md) — OCR + translation uses the Anthropic Claude API; calls must be proxied through a Vercel Serverless Function backend, keeping the API key out of the frontend; a per-user monthly call cap is set; receipt images live in a private Supabase Storage bucket, accessed via signed URLs.
- [价格异常提醒规则（10-price-spike-alert-rules）](issues/10-price-spike-alert-rules.md) — 固定阈值涨幅 > 15% 触发；每次确认小票立刻检查；圈子全员可见；应用内通知列表 + 按小票汇总的单封邮件；暂不做按商品静音。
  [Price-spike alert rules (10-price-spike-alert-rules)](issues/10-price-spike-alert-rules.md) — A fixed 15% increase triggers an alert; checked immediately after each receipt is confirmed; visible to all circle members; an in-app notification list plus a single email batched per receipt; per-product muting not built for now.
- [库存提醒规则（11-low-stock-alert-rules）](issues/11-low-stock-alert-rules.md) — 每天定时任务扫描所有商品；用 `low_stock_alert_active` 标记只提醒一次，直到回升到阈值以上才重置；复用 10 号的应用内列表和邮件模板，同样全员可见。
  [Low-stock alert rules (11-low-stock-alert-rules)](issues/11-low-stock-alert-rules.md) — A daily scheduled job scans all products; a `low_stock_alert_active` flag ensures only one reminder per episode until it recovers above the threshold; reuses ticket 10's in-app list and email template, also visible to all members.
- [多店铺比价（13-multi-store-price-comparison）](issues/13-multi-store-price-comparison.md) — 确认纳入范围；复用 06 号的促销过滤和单位换算规则，比每家店最新正常价；作为单品页面里紧挨价格趋势图的一个模块，而不是独立页面；只在一家店买过时不显示对比。
  [Multi-store price comparison (13-multi-store-price-comparison)](issues/13-multi-store-price-comparison.md) — Confirmed in scope; reuses ticket 06's promotion-filtering and unit-conversion rules, comparing each store's latest normal price; shown as a module on the per-product page next to the price trend chart, not a standalone page; no comparison is shown if the product has only been bought at one store.
- [UI 结构与双语切换（14-ui-structure-and-language-toggle）](issues/14-ui-structure-and-language-toggle.md) — 页面清单（首页/拍照上传/小票列表/商品详情/月度报告/通知中心/圈子设置）；底部 Tab Bar 导航 + 悬浮拍照按钮；双语内容靠一个语言切换开关显示单一语言，界面固定文案不受影响；像素级视觉设计留给实现/原型阶段。
  [UI structure & language toggle (14-ui-structure-and-language-toggle)](issues/14-ui-structure-and-language-toggle.md) — Page list (home/photo upload/receipt list/product detail/monthly report/notification center/circle settings); bottom tab-bar navigation plus a floating photo-upload button; bilingual content is shown via a language toggle displaying one language at a time, with fixed UI chrome unaffected; pixel-level visual design is left for implementation/prototyping.
- [数据导出/报告格式（12-data-export-report-format）](issues/12-data-export-report-format.md) — CSV 逐条明细导出，整个圈子数据可选时间范围；独立的月度报告页汇总总支出环比、分类占比、涨幅榜单（复用 06 号）、提醒次数、按人支出分布，导出按钮就放在报告页上。
  [Data export & report format (12-data-export-report-format)](issues/12-data-export-report-format.md) — CSV line-by-line export, whole-circle data with a selectable time range; a standalone monthly report page rolls up total spend vs. last month, category breakdown, the price-change leaderboard (reusing ticket 06), alert counts, and per-uploader spending, with the export button living on that same page.

## Not yet specified

（尚无）
(None yet.)

## Out of scope

- 像素级视觉设计（配色细节之外的字体、间距、组件样式等）——14 号 ticket 定了页面清单和信息架构，但具体视觉呈现留给实现阶段或后续 `/prototype` 环节，不是这份需求文档要交付的深度。
  Pixel-level visual design (fonts, spacing, component styling beyond the color-coding already decided) — ticket 14 settled the page list and information architecture, but exact visual presentation is left for implementation or a later `/prototype` pass; it's not the depth this requirements document is meant to deliver.
