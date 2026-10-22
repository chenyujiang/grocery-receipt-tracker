# Grocery Receipt Tracking & Price Monitoring App — Requirements Planning Map

## Destination

Produce a complete product requirements document (spec): a family-shared "photograph grocery receipts to track spending and unit prices" web app that supports bilingual (Chinese/English) data content.

The document must clearly define the feature scope, core data structures, the AI recognition (multimodal LLM OCR) approach, product matching and categorization logic, monthly price-change comparison, consumption-rate analysis, the bilingual translation mechanism, and the additional features: price-spike alerts, low-stock alerts, hidden price-hike detection, multi-store price comparison, and data export/monthly reports.

Once the document is complete, it will be handed off to the development phase for implementation (implementation itself is out of scope for this planning effort).

**Current leg (tickets 23–28), post-launch**: give a Store a branch, so the app knows *which* branch of a chain a Receipt came from, and narrow every price-change calculation and Price Spike alert to a single branch. Reached when the schema, the recognition flow, the existing data, and the comparison rules have all moved onto branch-level Store identity, shipped and covered by tests. Unlike the original planning legs, this one carries through to running code, not just a decision.

## Notes

- Domain: personal/family expense tracking + product price monitoring.
- Decided: receipt text recognition uses a multimodal LLM (e.g. the Claude / GPT-4V family), not a dedicated OCR API or a self-trained model.
- Decided: built for family sharing (multiple people recording together), not a single-user scenario; the project is also planned to open up to friends after completion, so it needs a proper account/registration system that supports multiple independent users/groups, not just a single family's invite-code model.
- Decided: build the web app first; a native/cross-platform app is deferred to a future roadmap and is not part of this round.
- Decided: the tech stack direction is React.js + TypeScript + Node.js, deployed on Vercel (frontend/API) + Supabase (database/auth), with GitHub for version control.
- Decided: the user is based in New Zealand, so receipts are originally in English (from supermarkets like Countdown, New World, PAK'nSAVE), not Chinese.
- Decided: the product must support Chinese/English bilingual content — dynamic data (product names, store names, category labels) is stored bilingually, with `_en` being the OCR-recognized English source text and `_zh` the Chinese translation produced by that same multimodal-LLM call; fixed UI chrome (menus, buttons) is English-only, with no language switch.
- Communication is in Chinese throughout; the map and ticket documents are bilingual with sentence-by-sentence pairing (Chinese above, English below), mirroring the product's own bilingual requirement.
- Each ticket is preferentially resolved via `/grilling` (paired with `/domain-modeling` to capture terminology and data structures); `/research` may be borrowed temporarily when comparing external technology options.

## Decisions so far

- [Platform choice (01-platform-choice)](issues/01-platform-choice.md) — Build the web app first, native app deferred to a future roadmap; tech stack direction is React+TS+Node.js / Vercel+Supabase / GitHub.
- [Account & sharing model (02-family-sharing-model)](issues/02-family-sharing-model.md) — Supabase Auth email login; one account per circle (default cap 10 members); owner/member roles, members can only edit/delete their own records; email invite links; duplicate detection by store+date+amount; buyer field = login email.
- [Receipt data schema (03-receipt-data-schema)](issues/03-receipt-data-schema.md) — Photo upload → AI draft → user reviews and confirms before it's saved; a Receipt/ReceiptItem/EditLog three-table structure, spec split into value+unit, promotions flagged with original price kept; original photos kept 12 months in Supabase Storage; upload uses a standard file input, covering both camera capture and gallery selection.
- [Category taxonomy (04-category-taxonomy)](issues/04-category-taxonomy.md) — A two-level, system-fixed category list (9 top-level categories such as food/household); AI must pick from the preset list, never invent categories; user corrections are remembered and auto-applied to the same product name.
- [Bilingual content strategy (09-bilingual-content-strategy)](issues/09-bilingual-content-strategy.md) — Only dynamic data content is bilingual (product names/store names/categories), stored as `_zh`/`_en` columns, with `_en` as the OCR English source text and `_zh` as the translation produced by that same LLM call; this required updating the field design of tickets 03 and 04. **Amended post-launch**: fixed UI chrome is fully translated too (not English-only), via a hand-written string dictionary, driven by the same toggle as the data content.
- [Product matching strategy (05-product-matching-strategy)](issues/05-product-matching-strategy.md) — AI suggests a match candidate, the user confirms/changes it in the existing preview flow; barcodes are not handled; spec changes still count as the same product, with spec as a per-purchase-record attribute; adds a Product table (`product_id`) that tickets 06/07 will group by, and category memory's key also migrates to `product_id`.
- [Price-change calculation (06-price-change-calculation)](issues/06-price-change-calculation.md) — Compares against the last purchase price, excluding promotional rows; weight/volume units are normalized to a per-100g/100ml basis before comparing, count-based units are not normalized; the page shows a price-change leaderboard, a per-product trend chart, and red/green color coding for increases/decreases.
- [Consumption-rate calculation (07-consumption-rate-calculation)](issues/07-consumption-rate-calculation.md) — A sliding window of the last 5 purchases (total quantity ÷ total days) gives the average daily consumption rate; fewer than 3 purchases means no estimate is shown; a reminder triggers when estimated days remaining drops below 5; fully automatic, with no manual "used up / not used up" marking required.
- [Tech stack & storage (08-tech-stack-storage)](issues/08-tech-stack-storage.md) — OCR + translation uses **Claude Haiku 4.5** via the Anthropic Claude API; calls must be proxied through a Vercel Serverless Function backend, keeping the API key out of the frontend; receipt images live in a private Supabase Storage bucket, accessed via signed URLs. **Superseded**: the global hard $1 cap described here is replaced by ticket 15's per-user credit model — see below.
- [Price-spike alert rules (10-price-spike-alert-rules)](issues/10-price-spike-alert-rules.md) — A fixed 15% increase triggers an alert; checked immediately after each receipt is confirmed; visible to all circle members; an in-app notification list plus a single email batched per receipt; per-product muting not built for now.
- [Low-stock alert rules (11-low-stock-alert-rules)](issues/11-low-stock-alert-rules.md) — A daily scheduled job scans all products; a `low_stock_alert_active` flag ensures only one reminder per episode until it recovers above the threshold; reuses ticket 10's in-app list and email template, also visible to all members.
- [Multi-store price comparison (13-multi-store-price-comparison)](issues/13-multi-store-price-comparison.md) — Confirmed in scope; reuses ticket 06's promotion-filtering and unit-conversion rules, comparing each store's latest normal price; shown as a module on the per-product page next to the price trend chart, not a standalone page; no comparison is shown if the product has only been bought at one store.
- [UI structure & language toggle (14-ui-structure-and-language-toggle)](issues/14-ui-structure-and-language-toggle.md) — Page list (home/photo upload/receipt list/product detail/monthly report/notification center/circle settings); bottom tab-bar navigation plus a floating photo-upload button; bilingual content is shown via a language toggle displaying one language at a time; pixel-level visual design is left for implementation/prototyping. **Amended post-launch**: upload became a normal fifth tab (five even items), Notifications moved to a pinned top-right icon, the receipt list gained per-row delete and a read-only detail page for confirmed receipts, and every date-range picker unified on a year-then-month popover (month-level, not day-precise).
- [Data export & report format (12-data-export-report-format)](issues/12-data-export-report-format.md) — CSV line-by-line export, whole-circle data with a selectable time range; a standalone monthly report page rolls up total spend vs. last month, category breakdown, the price-change leaderboard (reusing ticket 06), alert counts, and per-uploader spending, with the export button living on that same page. **Amended post-launch**: the exportable range is a from-month/to-month picker, not an arbitrary custom start/end date.
- [Admin dashboard & per-user AI credits (15-admin-dashboard-and-per-user-credits)](issues/15-admin-dashboard-and-per-user-credits.md) — New global-admin identity (separate from per-circle owner), reached via a hidden/unguessable route (real auth check + 404-on-deny, obscurity as a bonus layer, not a substitute); replaces ticket 08's global spend cap with a per-user dollar cap that the admin "grants" as a reset-to-fresh-allowance (default $1, or custom); disable/enable via Supabase Auth's own ban mechanism; brand-new users get a hard 1-free-successful-call trial (not a dollar amount) before needing an admin grant; blocked users get a `mailto:` link to the admin, no backend email sending; admin lands on the dashboard once post-login, with a manual switch back to the normal app; existing users are grandfathered straight into the dollar-cap model, skipping the free-trial gate. UI direction settled via `/prototype` (a needs-attention queue + circle-grouped roster, rendered as cards). Schema drafted, then **implemented and shipped**: `global_admins` + `user_ai_access` tables/RLS applied to the live project, `api/_lib/userAiAccess.ts` replacing `spendLimit.ts` (deleted), `api/admin/*` routes, `src/pages/AdminDashboard.tsx`, `RequireGlobalAdmin` route guard, and the post-login redirect — all TDD, all green (48 test files / 199 tests). CLAUDE.md updated to describe the new model. Committed and pushed to `origin/main`. **Amended post-launch**: the admin identity ended up being the project owner's existing family account rather than a separate dedicated one; Circle Settings also got a persistent "Go to admin dashboard" link (the one-time post-login redirect alone wasn't enough for an already-live session). Also surfaced a **known open bug, not yet root-caused**: new-account signup intermittently fails to auto-create its circle/profile (RLS rejects the insert as if unauthenticated, despite Supabase Auth itself succeeding) — see the ticket for the request-log evidence; needs a real fix before opening signup beyond the single grandfathered account.

- [Edit a confirmed receipt (16-edit-a-confirmed-receipt)](issues/16-edit-a-confirmed-receipt.md) — Inline "Edit" toggle directly on `ReceiptDetail.tsx` (not a separate route), uploader-only (matches the existing delete permission, no RLS change needed since RLS never had a status check to begin with). Editable: name/quantity/unit price/promotion (already editable pre-confirm), plus purchase date (via the existing month-only `MonthPickerField`, day-of-month preserved rather than reset to the 1st) and the weight/volume spec value+unit — but only for items that already have a unit set, and only as a fixed g/kg/ml/L dropdown, not free text, since that's the only set `units.ts` actually normalizes. Reuses `diffReceiptItemFields`/`edit_logs` as-is. Price-spike alerts are deliberately not re-triggered on edit — old alerts stand as-is, right or wrong. **Implemented and shipped**: `editConfirmedReceipt` added to `src/lib/receipts.ts`, `ReceiptDetail.tsx` got the edit toggle — all TDD, all green (210 tests). Not yet manually verified against the real deployed app (no test login available this session).

- [Branch-level Store identity (24–28, answered by spec 29)](issues/29-branch-level-store-identity.md) — A Store is a Circle-scoped record carrying its chain and branch, matched on normalized keys, created on confirm, with an unknown branch as its own row ([24](issues/24-store-as-an-entity.md), [25](issues/25-recognize-and-confirm-a-store.md)); existing receipts backfilled from a hand-confirmed mapping ([26](issues/26-backfill-existing-receipts.md)); price change, the headline, the leaderboard and Price Spike alerts all compare within one Store, with a six-month staleness cut-off on alerts, while consumption rate stays cross-branch ([27](issues/27-scope-price-change-to-one-branch.md)); the trend chart draws one line per Store and branch shows across the list, detail, leaderboard and CSV ([28](issues/28-branch-aware-trend-and-comparison-ui.md)). Store names are shown in English only. **Implemented** in PR #43.
- [Atomic AI access accounting (37-atomic-ai-access-accounting)](issues/37-atomic-ai-access-accounting.md) — Per-user AI access check and increment moved into service-role-only Postgres functions (`reserve_ai_call` / `release_ai_call` / `record_ai_spend`), each one row-locking UPDATE; trial is exact, dollar cap can overshoot by the cost of concurrent in-flight calls. Migration applied live 2026-10-23.
- [Validate matched product id (34-validate-matched-product-id)](issues/34-validate-matched-product-id.md) — `recognizeReceipt` keeps Claude's `matched_product_id` only if it's one of the ids the prompt offered; anything else becomes `null` (a new product) instead of a foreign-key failure after the call was charged.
- [Long receipts hit max_tokens (35-long-receipts-hit-max-tokens)](issues/35-long-receipts-hit-max-tokens.md) — `max_tokens` raised from 4096 to 16000 (model still Haiku 4.5); a response that still stops at `max_tokens` throws a user-facing "too long, photograph it in two halves" message instead of a JSON parse error, and the trial reservation is handed back.
- [Recognize route housekeeping (38-recognize-route-housekeeping)](issues/38-recognize-route-housekeeping.md) — Any failure after the image upload deletes the stored image (best effort, before responding); the route returns a generic message for database errors instead of their raw text, keeping user-facing `Error` messages; the frontend's `errorMessage()` deliberately still shows them. Prompt size left as is.

## Not yet specified

- **Consumption rate under branch-level Stores.** Ticket 07's sliding window of the last 5 purchases doesn't care where a Product was bought, and probably shouldn't — you consume what you bought regardless of which branch sold it. But it shares `fetchPurchaseHistories` with everything that *is* being narrowed, so once ticket 27 decides where the grouping lives, it's worth re-reading to confirm consumption stayed cross-branch on purpose rather than by accident.
- **Merging two Stores that turn out to be the same branch.** OCR variance, or a chain rename (Countdown → Woolworths), will eventually leave one real branch sitting as two Store rows with their Purchase History split between them. The admin dashboard already merges Circles; whether branches need the same, and who may do it, isn't sharp enough to ticket until ticket 24 fixes what a Store's identity is.
- **Whether a chain-level view survives at all.** Everything in this leg pushes toward the branch. Whether "what do I pay at Woolworths generally" remains a question the app answers, or quietly disappears, is a consequence of ticket 28's prototype rather than something to decide up front.

## Out of scope

- Pixel-level visual design (fonts, spacing, component styling beyond the color-coding already decided) — ticket 14 settled the page list and information architecture, but exact visual presentation is left for implementation or a later `/prototype` pass; it's not the depth this requirements document is meant to deliver.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# 家庭超市小票记账与价格追踪 App — 需求规划地图

## Destination

产出一份完整的产品需求文档（spec）：面向家庭共享使用的"超市小票拍照记账 + 单价追踪"应用，支持中英双语数据内容。

文档需定义清楚功能范围、核心数据结构、AI 识别（多模态大模型 OCR）方案、商品匹配与分类逻辑、月度涨幅对比、消耗速度分析、中英双语翻译机制，以及价格异常提醒、库存快用完提醒、隐性涨价识别、多店铺比价、数据导出/月度报告这几项附加功能。

文档完成后交给开发阶段实现（不在本次规划范围内）。

**当前这一程（ticket 23–28），上线之后**：给 Store 加上分店，让应用知道一张小票来自某连锁的**哪一家**分店，并把所有涨幅计算和价格异常提醒收窄到单一分店。达成标志：数据结构、识别流程、存量数据、比价规则全部迁到"分店级 Store 身份"之上，已上线且有测试覆盖。和最初那几程规划不同，这一程一路做到可运行的代码，而不只是一个决定。

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

- [平台选型（01-platform-choice）](issues/01-platform-choice.md) — 先做网页版，App 列入后续路线图；技术栈方向 React+TS+Node.js / Vercel+Supabase / GitHub。
- [账号与共享模型（02-family-sharing-model）](issues/02-family-sharing-model.md) — Supabase Auth 邮箱登录；一账号一圈子（默认上限 10 人）；owner/member 两级权限，member 只能改删自己的记录；邮箱邀请链接；店铺+日期+金额自动查重；购买人=登录邮箱。
- [小票数据结构（03-receipt-data-schema）](issues/03-receipt-data-schema.md) — 拍照→AI 识别草稿→用户预览确认入库；Receipt/ReceiptItem/EditLog 三表结构，规格拆成数值+单位，促销单独标记原价；原图 Supabase Storage 保留 12 个月；拍照上传用标准 file input 控件，兼顾拍照与相册选图。
- [分类体系（04-category-taxonomy）](issues/04-category-taxonomy.md) — 两级固定预设分类目录（食品/日用品等 9 大类）；AI 只能从预设列表选，不自造类目；记住用户手动修正，同名商品自动沿用。
- [中英双语策略（09-bilingual-content-strategy）](issues/09-bilingual-content-strategy.md) — 仅动态数据内容双语（商品名/店铺名/分类），存成 `_zh`/`_en` 两列，`_en` 是 OCR 英文原文，`_zh` 是同一次大模型调用顺带产出的翻译；连带更新了 03、04 号 ticket 的字段设计。**上线后修订**：界面固定文案也全部翻译了（不再是纯英文），用手写字典实现，和数据内容共用同一个切换开关。
- [商品匹配策略（05-product-matching-strategy）](issues/05-product-matching-strategy.md) — AI 建议匹配候选，用户在预览确认流程里确认/改；不处理条码；规格变化仍算同一商品，规格是购买记录的属性；新增 Product 表（`product_id`），06/07 号 ticket 按 `product_id` 分组统计，分类记忆的 key 也迁移到 `product_id`。
- [涨幅计算逻辑（06-price-change-calculation）](issues/06-price-change-calculation.md) — 和上一次购买价对比，排除促销行；按重量/体积统一换算成每 100g/100ml 比较，计数类不换算；页面展示涨幅榜单+单品趋势图+红涨绿跌配色。
- [消耗速度计算（07-consumption-rate-calculation）](issues/07-consumption-rate-calculation.md) — 近 5 次购买滑动窗口（总量÷总天数）算日均消耗；不足 3 次购买不估算；预计剩余天数 < 5 天触发提醒；完全自动推算，不需要用户手动标记用完/没用完。
- [技术栈与数据存储（08-tech-stack-storage）](issues/08-tech-stack-storage.md) — OCR+翻译用 Anthropic Claude API 的 **Claude Haiku 4.5**；调用必须经 Vercel Serverless Function 后端中转，API Key 不进前端；小票图片存私有 Supabase Storage bucket，靠签名 URL 访问。**已被取代**：这里的全局硬性 $1 上限被 15 号 ticket 的按用户额度模型取代，见下文。
- [价格异常提醒规则（10-price-spike-alert-rules）](issues/10-price-spike-alert-rules.md) — 固定阈值涨幅 > 15% 触发；每次确认小票立刻检查；圈子全员可见；应用内通知列表 + 按小票汇总的单封邮件；暂不做按商品静音。
- [库存提醒规则（11-low-stock-alert-rules）](issues/11-low-stock-alert-rules.md) — 每天定时任务扫描所有商品；用 `low_stock_alert_active` 标记只提醒一次，直到回升到阈值以上才重置；复用 10 号的应用内列表和邮件模板，同样全员可见。
- [多店铺比价（13-multi-store-price-comparison）](issues/13-multi-store-price-comparison.md) — 确认纳入范围；复用 06 号的促销过滤和单位换算规则，比每家店最新正常价；作为单品页面里紧挨价格趋势图的一个模块，而不是独立页面；只在一家店买过时不显示对比。
- [UI 结构与双语切换（14-ui-structure-and-language-toggle）](issues/14-ui-structure-and-language-toggle.md) — 页面清单（首页/拍照上传/小票列表/商品详情/月度报告/通知中心/圈子设置）；底部 Tab Bar 导航 + 悬浮拍照按钮；双语内容靠一个语言切换开关显示单一语言；像素级视觉设计留给实现/原型阶段。**上线后修订**：拍照上传改成普通的第五个 tab（五个等宽项），通知搬到页面右上角的固定图标，小票列表加了逐条删除和已确认小票的只读详情页，所有日期范围选择器统一成"先选年再选月"的弹出选择器（精确到月，不精确到日）。
- [数据导出/报告格式（12-data-export-report-format）](issues/12-data-export-report-format.md) — CSV 逐条明细导出，整个圈子数据可选时间范围；独立的月度报告页汇总总支出环比、分类占比、涨幅榜单（复用 06 号）、提醒次数、按人支出分布，导出按钮就放在报告页上。**上线后修订**：可导出的时间范围改成起始月/结束月选择器，不再是自定义起止日期。
- [管理后台与按用户 AI 额度（15-admin-dashboard-and-per-user-credits）](issues/15-admin-dashboard-and-per-user-credits.md) — 新增独立于 circle owner 的全局管理员身份，走隐藏/不规律路径访问（真正权限校验 + 非管理员 404，隐蔽性只是锦上添花）；用按用户的美元额度取代 08 号的全局总闸门，管理员"给额度"是重置成一份新额度（默认 $1，或自定义）；禁用/启用走 Supabase Auth 自带的封禁机制；全新用户先拿到硬性"1 次成功识别免费"（按次数而非金额），用完后才需要管理员分配额度；被卡住的用户看到联系管理员的 `mailto:` 链接，不走后端发信；管理员登录后一次性自动跳到后台，可手动切回普通 App；老用户直接迁移进按金额算的模型，跳过免费试用限制。UI 方向已通过 `/prototype` 定下来（"需要处理"队列 + 按圈子分组的名单，用卡片展示）。Schema 画好之后**已经实现并上线**：`global_admins` + `user_ai_access` 两张表/RLS 已经应用到线上项目，`api/_lib/userAiAccess.ts` 取代了 `spendLimit.ts`（已删除），加上 `api/admin/*` 接口、`src/pages/AdminDashboard.tsx`、`RequireGlobalAdmin` 路由守卫、登录后自动跳转——全部 TDD，全部通过（48 个测试文件/199 个测试）。CLAUDE.md 也已同步更新为新模型的描述。已提交并推送到 `origin/main`。**上线后修订**：最终的管理员身份用的是项目所有者本来那个家庭账号，没有另外注册专用账号；Circle Settings 也加了一个常驻的"前往管理后台"链接（光靠登录后一次性跳转，对已经有登录状态的会话不够用）。另外还发现一个**还没查出根本原因的已知 bug**：新账号注册偶尔会自动创建圈子/档案失败（RLS 拒绝了插入，表现得像没登录一样，但 Supabase Auth 那一层本身是成功的）——具体的请求日志证据见票里的记录；在向这个已经"祖父迁移"过的唯一账号之外开放注册之前，需要先真正修好这个问题。

- [编辑已确认小票（16-edit-a-confirmed-receipt）](issues/16-edit-a-confirmed-receipt.md) — 直接在 `ReceiptDetail.tsx` 上做内联"编辑"切换（不是单独路由），只限上传人（跟现有删除权限一致，不用改 RLS，因为 RLS 本来就没做状态检查）。可编辑：商品名/数量/单价/促销（确认前本来就能改），加上购买日期（用现成的"只到月"的 `MonthPickerField`，保留原来的"号数"不重置成1号）和重量/体积规格数值+单位——但只对本来就有单位的商品显示，单位是固定的 g/kg/ml/L 四选一，不是自由文本，因为这正好是 `units.ts` 实际能换算的那几种。直接复用 `diffReceiptItemFields`/`edit_logs`。价格异常提醒有意不会因为编辑重新触发——老的提醒记录不管对错都保持原样。**已实现并上线**：`editConfirmedReceipt` 加到了 `src/lib/receipts.ts`，`ReceiptDetail.tsx` 加了编辑切换——全部 TDD，全部通过（210 个测试）。还没用真实账号在实际部署的网站上手动验证过（这次会话没有测试账号可以登录）。

- [分店级 Store 身份（24–28，由 spec 29 回答）](issues/29-branch-level-store-identity.md) — Store 是按 Circle 隔离、带连锁和分店的记录，按规范化键匹配，确认时创建，未知分店自成一行（[24](issues/24-store-as-an-entity.md)、[25](issues/25-recognize-and-confirm-a-store.md)）；存量小票按用户手工确认的映射回填（[26](issues/26-backfill-existing-receipts.md)）；涨幅、详情页标题、涨幅榜和价格异常提醒都只在同一 Store 内比较，提醒加了六个月的过期截止，消耗速度保持跨分店（[27](issues/27-scope-price-change-to-one-branch.md)）；趋势图每个 Store 一条线，分店显示在列表、详情、涨幅榜和 CSV 里（[28](issues/28-branch-aware-trend-and-comparison-ui.md)）。Store 名称只显示英文。已在 PR #43 **实现**。
- [AI 额度原子记账（37-atomic-ai-access-accounting）](issues/37-atomic-ai-access-accounting.md) — 按用户 AI 额度的检查和加数挪进只限 service role 调用的 Postgres 函数（`reserve_ai_call` / `release_ai_call` / `record_ai_spend`），每个都是一条带行锁的 UPDATE；试用次数精确，美元上限最多超出同时进行中的调用的花费。迁移已于 2026-10-23 应用到线上。
- [校验匹配到的商品 id（34-validate-matched-product-id）](issues/34-validate-matched-product-id.md) — `recognizeReceipt` 只保留提示词里给出过的 `matched_product_id`；其他值变成 `null`（按新商品处理），不会在已经扣费之后才因外键失败。
- [长小票超出 max_tokens（35-long-receipts-hit-max-tokens）](issues/35-long-receipts-hit-max-tokens.md) — `max_tokens` 从 4096 调到 16000（模型仍是 Haiku 4.5）；仍停在 `max_tokens` 的响应会抛出给用户看的"太长了，分成上下两半拍"提示，而不是 JSON 解析错误，试用预占也会归还。
- [识别路由收尾整理（38-recognize-route-housekeeping）](issues/38-recognize-route-housekeeping.md) — 图片上传之后任何一步失败，都会删掉已存的图片（尽力而为，在响应之前）；数据库错误返回通用提示而不是原始文字，写给用户看的 `Error` 信息保留；前端的 `errorMessage()` 有意仍然显示它们。提示词大小暂不处理。

## Not yet specified

- **分店级 Store 之下的消耗速度。** ticket 07 的"最近 5 次购买滑动窗口"不关心商品是在哪买的，而且大概也不该关心——东西买回来就是要用掉的，跟哪家分店卖的无关。但它和所有正在被收窄的功能共用 `fetchPurchaseHistories`，所以等 ticket 27 定下分组放在哪一层之后，值得回头确认：消耗速度保持跨分店是有意为之，而不是漏改。
- **合并"其实是同一家分店"的两条 Store。** OCR 措辞漂移，或者连锁改名（Countdown → Woolworths），迟早会让一家真实分店变成两条 Store 记录，价格历史被劈成两半。管理后台已经能合并 Circle 了；分店是否需要同样的能力、谁有权做，在 ticket 24 把 Store 的身份定死之前还不够清晰，开不了 ticket。
- **连锁级视角是否还留得住。** 这一程的一切都在往"分店"推。"我在 Woolworths 整体上花多少钱"还算不算这个应用要回答的问题，是 ticket 28 原型的结果，而不是现在该先拍板的事。

## Out of scope

- 像素级视觉设计（配色细节之外的字体、间距、组件样式等）——14 号 ticket 定了页面清单和信息架构，但具体视觉呈现留给实现阶段或后续 `/prototype` 环节，不是这份需求文档要交付的深度。
