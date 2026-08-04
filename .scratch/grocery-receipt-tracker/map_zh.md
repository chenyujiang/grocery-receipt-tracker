# 家庭超市小票记账与价格追踪 App — 需求规划地图

## Destination

产出一份完整的产品需求文档（spec）：面向家庭共享使用的"超市小票拍照记账 + 单价追踪"应用，支持中英双语数据内容。

文档需定义清楚功能范围、核心数据结构、AI 识别（多模态大模型 OCR）方案、商品匹配与分类逻辑、月度涨幅对比、消耗速度分析、中英双语翻译机制，以及价格异常提醒、库存快用完提醒、隐性涨价识别、多店铺比价、数据导出/月度报告这几项附加功能。

文档完成后交给开发阶段实现（不在本次规划范围内）。

## Notes

- 领域：个人/家庭消费记账 + 商品价格追踪。
- 已定：小票文字识别方案使用多模态大模型（如 Claude / GPT-4V 一类），不走专用 OCR API 或自训练模型。
- 已定：面向家庭共享使用（多人共同记录），非单人场景；且项目做完后计划开放给朋友使用，因此需要正式的账号注册体系，能支持多个互不相关的用户/群组各自使用（不只是单一家庭的邀请码模式）。
- 已定：先做网页版（Web App），原生/跨平台 App 列入后续路线图，本轮不做。
- 已定：技术栈方向为 React.js + TypeScript + Node.js，部署 Vercel（前端/接口）+ Supabase（数据库/认证），GitHub 做版本控制。
- 已定：用户在新西兰，小票原文是英文（Countdown/New World/PAK'nSAVE 等新西兰超市），不是中文。
- 已定：产品需支持中英双语——动态数据内容（商品名、店铺名、分类标签）中英双语存储，`_en` 是 OCR 识别的英文原文，`_zh` 是同一次多模态大模型调用顺带翻译出的中文版本；界面固定文案（菜单、按钮）只做英文，不做切换。
- 沟通统一使用中文；地图和工单文档采用中英双语、逐句对照（中文在上，英文在下），呼应产品本身的双语需求。
- 每张 ticket 优先用 `/grilling`（配合 `/domain-modeling` 沉淀术语和数据结构）解决；涉及外部技术选型对比时可临时借用 `/research`。

## Decisions so far

- [平台选型（01-platform-choice）](issues/01-platform-choice_zh.md) — 先做网页版，App 列入后续路线图；技术栈方向 React+TS+Node.js / Vercel+Supabase / GitHub。
- [账号与共享模型（02-family-sharing-model）](issues/02-family-sharing-model_zh.md) — Supabase Auth 邮箱登录；一账号一圈子（默认上限 10 人）；owner/member 两级权限，member 只能改删自己的记录；邮箱邀请链接；店铺+日期+金额自动查重；购买人=登录邮箱。
- [小票数据结构（03-receipt-data-schema）](issues/03-receipt-data-schema_zh.md) — 拍照→AI 识别草稿→用户预览确认入库；Receipt/ReceiptItem/EditLog 三表结构，规格拆成数值+单位，促销单独标记原价；原图 Supabase Storage 保留 12 个月；拍照上传用标准 file input 控件，兼顾拍照与相册选图。
- [分类体系（04-category-taxonomy）](issues/04-category-taxonomy_zh.md) — 两级固定预设分类目录（食品/日用品等 9 大类）；AI 只能从预设列表选，不自造类目；记住用户手动修正，同名商品自动沿用。
- [中英双语策略（09-bilingual-content-strategy）](issues/09-bilingual-content-strategy_zh.md) — 仅动态数据内容双语（商品名/店铺名/分类），存成 `_zh`/`_en` 两列，`_en` 是 OCR 英文原文，`_zh` 是同一次大模型调用顺带产出的翻译；界面固定文案只做英文；连带更新了 03、04 号 ticket 的字段设计。
- [商品匹配策略（05-product-matching-strategy）](issues/05-product-matching-strategy_zh.md) — AI 建议匹配候选，用户在预览确认流程里确认/改；不处理条码；规格变化仍算同一商品，规格是购买记录的属性；新增 Product 表（`product_id`），06/07 号 ticket 按 `product_id` 分组统计，分类记忆的 key 也迁移到 `product_id`。
- [涨幅计算逻辑（06-price-change-calculation）](issues/06-price-change-calculation_zh.md) — 和上一次购买价对比，排除促销行；按重量/体积统一换算成每 100g/100ml 比较，计数类不换算；页面展示涨幅榜单+单品趋势图+红涨绿跌配色。
- [消耗速度计算（07-consumption-rate-calculation）](issues/07-consumption-rate-calculation_zh.md) — 近 5 次购买滑动窗口（总量÷总天数）算日均消耗；不足 3 次购买不估算；预计剩余天数 < 5 天触发提醒；完全自动推算，不需要用户手动标记用完/没用完。
- [技术栈与数据存储（08-tech-stack-storage）](issues/08-tech-stack-storage_zh.md) — OCR+翻译用 Anthropic Claude API 的 **Claude Haiku 4.5**；调用必须经 Vercel Serverless Function 后端中转，API Key 不进前端；限额是**全局硬性 $1 上限**（不是按次数/按用户），触达后拒绝调用，需人工手动调高；小票图片存私有 Supabase Storage bucket，靠签名 URL 访问。
- [价格异常提醒规则（10-price-spike-alert-rules）](issues/10-price-spike-alert-rules_zh.md) — 固定阈值涨幅 > 15% 触发；每次确认小票立刻检查；圈子全员可见；应用内通知列表 + 按小票汇总的单封邮件；暂不做按商品静音。
- [库存提醒规则（11-low-stock-alert-rules）](issues/11-low-stock-alert-rules_zh.md) — 每天定时任务扫描所有商品；用 `low_stock_alert_active` 标记只提醒一次，直到回升到阈值以上才重置；复用 10 号的应用内列表和邮件模板，同样全员可见。
- [多店铺比价（13-multi-store-price-comparison）](issues/13-multi-store-price-comparison_zh.md) — 确认纳入范围；复用 06 号的促销过滤和单位换算规则，比每家店最新正常价；作为单品页面里紧挨价格趋势图的一个模块，而不是独立页面；只在一家店买过时不显示对比。
- [UI 结构与双语切换（14-ui-structure-and-language-toggle）](issues/14-ui-structure-and-language-toggle_zh.md) — 页面清单（首页/拍照上传/小票列表/商品详情/月度报告/通知中心/圈子设置）；底部 Tab Bar 导航 + 悬浮拍照按钮；双语内容靠一个语言切换开关显示单一语言，界面固定文案不受影响；像素级视觉设计留给实现/原型阶段。
- [数据导出/报告格式（12-data-export-report-format）](issues/12-data-export-report-format_zh.md) — CSV 逐条明细导出，整个圈子数据可选时间范围；独立的月度报告页汇总总支出环比、分类占比、涨幅榜单（复用 06 号）、提醒次数、按人支出分布，导出按钮就放在报告页上。

## Not yet specified

（尚无）

## Out of scope

- 像素级视觉设计（配色细节之外的字体、间距、组件样式等）——14 号 ticket 定了页面清单和信息架构，但具体视觉呈现留给实现阶段或后续 `/prototype` 环节，不是这份需求文档要交付的深度。
