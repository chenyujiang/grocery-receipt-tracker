# 家庭超市小票记账与价格追踪 App — 需求文档
# Grocery Receipt Tracking & Price Monitoring App — Product Requirements Document

本文档整理自 `wayfinder` 规划地图（`map.md`）里 14 张已解决 ticket 的决策，是这个项目的完整需求说明，可直接交付给开发阶段使用。
This document consolidates the decisions from all 14 resolved tickets in the `wayfinder` planning map (`map.md`) into a complete requirements specification, ready to hand off to development.

## 1. 概述 Overview

这是一个面向家庭（以及未来可能的朋友圈子）共享使用的网页应用：用户拍照上传超市小票，AI 自动识别出商品明细并中英双语化，应用据此追踪每件商品的单价变化、消耗速度，并在价格异常上涨或库存快用完时主动提醒。
This is a web application for shared use by a family (and potentially friend groups in the future): users photograph grocery receipts, AI automatically recognizes the line items and renders them bilingually in Chinese and English, and the app tracks each product's unit-price changes and consumption rate, proactively alerting when a price spikes or stock is running low.

用户所在地为新西兰，小票原文为英文（如 Countdown、New World、PAK'nSAVE 等超市），应用会将识别出的英文内容自动翻译成中文。
The user is based in New Zealand, so receipts are originally in English (from supermarkets such as Countdown, New World, and PAK'nSAVE); the app automatically translates the recognized English content into Chinese.

## 2. 范围 Scope

### 2.1 本期功能范围 In scope

- 拍照/选图上传小票，AI 识别 + 中英翻译（第 6 节）。
  Photograph/select and upload a receipt, with AI recognition + Chinese/English translation (Section 6).
- 家庭/圈子共享账号体系（第 4 节）。
  A family/circle account-sharing system (Section 4).
- 商品自动分类与匹配（第 8、9 节）。
  Automatic product categorization and matching (Sections 8, 9).
- 月度单价涨幅对比、隐性涨价识别（第 10 节）。
  Monthly unit-price change comparison and hidden price-hike detection (Section 10).
- 多店铺比价（第 11 节）。
  Multi-store price comparison (Section 11).
- 消耗速度分析与库存快用完提醒（第 12 节）。
  Consumption-rate analysis and low-stock alerts (Section 12).
- 价格异常提醒（第 13 节）。
  Price-spike alerts (Section 13).
- 数据导出（CSV）与月度报告页面（第 14 节）。
  Data export (CSV) and a monthly report page (Section 14).

### 2.2 后续路线图（本期不做）Future roadmap (not in this round)

- 原生/跨平台手机 App（先做网页版验证可行性）。
  A native/cross-platform mobile app (the web version ships first to validate the concept).
- App 级别的原生推送通知（本期用"网页内展示 + 邮件通知"代替）。
  App-level native push notifications (this round uses "in-app display + email" instead).
- 按商品/分类自定义提醒阈值和静音功能。
  Per-product/category custom alert thresholds and mute functionality.

### 2.3 明确排除 Explicitly out of scope

- 像素级视觉设计（字体、间距、组件样式）——本文档定义页面结构和信息架构，具体视觉呈现留给实现阶段或后续原型环节。
  Pixel-level visual design (fonts, spacing, component styling) — this document defines page structure and information architecture; exact visual presentation is left for implementation or a later prototyping pass.

## 3. 技术栈与架构 Tech Stack & Architecture

- **前端**：React.js + TypeScript，移动优先的响应式网页应用，部署在 Vercel。
  **Frontend**: React.js + TypeScript, a mobile-first responsive web app, deployed on Vercel.
- **后端**：Node.js，以 Vercel Serverless Functions 的形式运行，承担 AI 调用中转、业务逻辑和定时任务。
  **Backend**: Node.js, running as Vercel Serverless Functions, handling AI call proxying, business logic, and scheduled jobs.
- **数据库/认证/存储**：Supabase（Postgres 数据库 + Supabase Auth 邮箱登录 + Supabase Storage 对象存储）。
  **Database/Auth/Storage**: Supabase (Postgres database + Supabase Auth email login + Supabase Storage for objects).
- **版本控制**：GitHub。
  **Version control**: GitHub.
- **AI 模型**：Anthropic Claude API 的多模态模型，用于小票 OCR 识别 + 中英翻译 + 商品匹配建议，全部在同一次后端调用中完成。
  **AI model**: the Anthropic Claude API's multimodal model, used for receipt OCR, Chinese/English translation, and product-match suggestions — all performed within the same backend call.

### 3.1 安全与成本控制 Security & cost control

- AI 调用必须经后端 Serverless Function 中转，Claude API Key 只存在后端环境变量里，绝不出现在前端代码或浏览器网络请求中。
  AI calls must be proxied through a backend Serverless Function; the Claude API key lives only in backend environment variables and never appears in frontend code or browser network requests.
- 每个用户设一个每月调用次数上限（具体数值留给开发阶段定），在调用 Claude API 前做检查，防止异常情况导致账单失控。
  A monthly per-user call cap is set (the exact number left for development to decide), checked before calling the Claude API, to prevent runaway costs from anomalies.
- 小票原图存储在 Supabase Storage 的私有 bucket，不开放公开 URL；前端需要显示原图时，由后端生成一个有效期较短的签名 URL，仅圈子成员可获取。
  Original receipt images are stored in a private Supabase Storage bucket with no public URL; when the frontend needs to display an image, the backend generates a short-lived signed URL, obtainable only by circle members.

### 3.2 端到端数据流 End-to-end data flow

1. 用户在网页上传/拍摄小票图片，前端把图片发给后端 API route。
   The user uploads/photographs a receipt image on the web page; the frontend sends the image to a backend API route.
2. 后端把原图存入 Supabase Storage 私有 bucket，同时调用 Claude API 完成 OCR 识别 + 中英翻译，产出结构化草稿。
   The backend stores the image in the private Supabase Storage bucket and calls the Claude API to perform OCR recognition and Chinese/English translation, producing a structured draft.
3. 后端把识别出的商品英文原文与该圈子已有的标准商品列表做匹配，生成匹配建议，一并写入草稿。
   The backend matches the recognized product's English text against the circle's existing standardized-product list, generating a match suggestion included in the same draft.
4. 草稿以 `status = pending_review` 存入数据库；用户在预览页逐条确认/修正后，状态更新为 `confirmed`，正式计入统计。
   The draft is saved with `status = pending_review`; once the user reviews and confirms/corrects each line, the status updates to `confirmed` and it counts toward statistics.
5. 小票确认后，后端立即跑价格异常检查（第 13 节）；每天的定时任务另外扫描所有商品的库存状态（第 12 节）。
   Once a receipt is confirmed, the backend immediately runs the price-spike check (Section 13); a separate daily scheduled job scans all products' stock status (Section 12).

## 4. 账号与共享模型 Accounts & Sharing

- **登录方式**：Supabase Auth 自带的邮箱登录方案。
  **Login method**: Supabase Auth's built-in email login.
- **账号与圈子关系**：一个账号只属于一个"圈子"（Circle）——注册时自动创建一个圈子，或通过邀请链接加入别人的圈子。这是个简化模型：家庭是一个圈子，未来朋友各自使用则是互不相关的独立圈子。
  **Account-to-circle relationship**: one account belongs to exactly one "Circle" — a circle is created automatically at signup, or joined via someone else's invite link. This is a simplified model: a family is one circle, and friends using the app independently in the future form their own separate, unrelated circles.
- **圈子人数**：默认上限 10 人（后续可调整）。
  **Circle size**: a default cap of 10 members (adjustable later).
- **权限分级**：
  **Permission tiers**:
  - **owner**：创建圈子的人，可邀请/移除成员、解散圈子；和 member 一样，只能修改/删除自己上传的记录。
    **owner**: the person who created the circle; can invite/remove members and dissolve the circle; like members, can only edit/delete records they uploaded themselves.
  - **member**：只能新增记录，只能修改/删除自己上传的记录，不能动别人的。
    **member**: can only add records, and can only edit/delete records they uploaded themselves — never anyone else's.
  - 所有成员（无论角色）都能**查看**圈子内的全部记录、报告和提醒。
    All members (regardless of role) can **view** all of the circle's records, reports, and alerts.
- **邀请方式**：邮箱邀请链接，需要接入邮件发送服务（如 Supabase 自带方案或 Resend）。
  **Invite method**: emailed invite links, requiring an email-sending service (e.g. Supabase's built-in option or Resend).
- **防重复拍票**：新小票按"店铺 + 日期 + 总金额"自动检测疑似重复，检测到就提示用户确认"确实重复，不导入"或"不是重复，继续导入"。
  **Duplicate-receipt prevention**: new receipts are auto-checked for suspected duplicates by matching store + date + total amount; when detected, the user confirms either "yes, duplicate, don't import" or "not a duplicate, continue."
- **购买人字段**：每条记录的 `uploaded_by` 自动取当前登录账号的邮箱，无需额外输入，可用于按人统计消费。
  **Buyer field**: each record's `uploaded_by` is automatically set to the current login email, requiring no extra input, and enables per-person spending statistics.

## 5. 数据模型 Data Model

### 5.0 Circle（圈子）与用户资料 Circle & User Profile

**Circle**

| 字段 Field | 说明 Description |
|---|---|
| `id` | 主键 Primary key |
| `name` | 圈子名称（可选，如"我们家"）Circle name (optional, e.g. "Our Family") |
| `max_members` | 人数上限，默认 10 Member cap, default 10 |
| `created_at` | 创建时间 Created timestamp |

**Profile**（一对一关联 Supabase Auth 的 `auth.users`）
**Profile** (one-to-one with Supabase Auth's `auth.users`)

| 字段 Field | 说明 Description |
|---|---|
| `user_id` | = `auth.users.id` |
| `circle_id` | 所属圈子 The circle this user belongs to |
| `role` | `owner` / `member` |

由于"一个账号只属于一个圈子"（第 4 节），圈子归属和角色直接存在用户资料表上，不需要多对多的成员关系表。
Since "one account belongs to exactly one circle" (Section 4), circle membership and role are stored directly on the user profile table — no many-to-many membership table is needed.

邀请链接的具体实现（邀请 token 的生成、过期时间等）留给开发阶段设计，本文档不展开。
The concrete implementation of invite links (token generation, expiry, etc.) is left for development to design and isn't expanded on in this document.

### 5.1 Receipt（小票）

| 字段 Field | 说明 Description |
|---|---|
| `id` | 主键 Primary key |
| `circle_id` | 所属圈子 Which circle this belongs to |
| `uploaded_by` | 上传人登录邮箱 Uploader's login email |
| `store_name_en` | 店铺名，OCR 识别的英文原文 Store name, OCR-recognized English source text |
| `store_name_zh` | 店铺名中文翻译 Store name, Chinese translation |
| `purchase_date` | 购买日期 Purchase date |
| `total_amount` | 小票总价 Receipt total |
| `original_image_url` | 原图存储地址（保留期后清空）Original image address (cleared after retention period) |
| `uploaded_at` | 上传时间 Upload timestamp |
| `status` | `pending_review` / `confirmed` |

原图存储在 Supabase Storage，默认保留 12 个月后自动清理（只清图片，结构化数据永久保留）。
Original images are stored in Supabase Storage and auto-deleted after 12 months by default (only the images are cleared; structured data is kept forever).

### 5.2 ReceiptItem（商品行）

| 字段 Field | 说明 Description |
|---|---|
| `id`, `receipt_id` | 主键、关联小票 Primary key, linked receipt |
| `raw_name_en` | AI 识别的商品名英文原文 AI-recognized product name, English source text |
| `raw_name_zh` | 商品名中文翻译 Product name, Chinese translation |
| `product_id` | 关联到标准化商品（见 5.3）Linked standardized product (see 5.3) |
| `quantity` | 数量 Quantity |
| `unit_spec_value` / `unit_spec_unit` | 规格数值 + 单位（如 500 / g）Spec value + unit (e.g. 500 / g) |
| `unit_price` | 实际成交单价 Actual transacted unit price |
| `original_price` | 原价（可为空，识别到划线价/优惠时才填）Original price (nullable, filled only when a struck-through/promo price is recognized) |
| `is_promotion` | 布尔，是否促销价 Boolean, whether it's a promotional price |
| `subtotal` | 小计 Line subtotal |

`raw_name_en`/`raw_name_zh` 记录"这次识别到的原始文本"，`product_id` 记录"这行被认定属于哪个标准商品"——两者分工不同。
`raw_name_en`/`raw_name_zh` record "the raw text recognized this time," while `product_id` records "which standardized product this line is judged to belong to" — the two serve different purposes.

**注意**：`ReceiptItem` 不单独存 `category` 字段——分类归属统一挂在 `Product`（见 5.3）上，通过 `product_id` 读取，避免同一个商品的分类在多条 `ReceiptItem` 记录里各存一份、事后修正时彼此不同步。预览确认页上仍然可以让用户对某一行编辑分类，但保存的是它所匹配的 `Product.category`，而不是 `ReceiptItem` 自己的副本。
**Note**: `ReceiptItem` does not store its own `category` field — categorization is owned entirely by `Product` (see 5.3) and read via `product_id`, avoiding a situation where the same product's category is duplicated across multiple `ReceiptItem` rows and drifts out of sync when corrected later. The preview/confirm screen can still let a user edit the category shown for a given line, but what's saved is its matched `Product.category`, not a separate copy on the `ReceiptItem`.

### 5.3 Product（标准商品，圈子内维度）

| 字段 Field | 说明 Description |
|---|---|
| `id`, `circle_id` | 主键、所属圈子（标准商品是圈子内概念）Primary key, owning circle (a per-circle concept) |
| `canonical_name_en` / `canonical_name_zh` | 用户确认后的标准商品名，双语 Standardized product name once confirmed, bilingual |
| `category` | 分类，唯一的存储位置（见第 9 节）Category, the single place it's stored (see Section 9) |
| `low_stock_alert_active` | 布尔，是否处于"已提醒、尚未回升"状态（见第 12 节）Boolean, whether currently in an "already alerted, not yet recovered" state (see Section 12) |
| `created_at` | 创建时间 Created timestamp |

同一个标准商品下，不同购买记录的规格（`unit_spec_value`/`unit_spec_unit`）可以不一样——这正是隐性涨价识别和消耗速度计算的数据基础。
Different purchase records under the same standardized product can have different specs (`unit_spec_value`/`unit_spec_unit`) — this is precisely the data foundation for hidden price-hike detection and consumption-rate calculation.

### 5.4 EditLog（修改历史）

| 字段 Field | 说明 Description |
|---|---|
| `id` | 主键 Primary key |
| `receipt_id` / `receipt_item_id` | 关联记录 Linked record |
| `field_name`, `old_value`, `new_value` | 改了哪个字段、改前改后的值 Which field changed, old and new values |
| `edited_by`, `edited_at` | 修改人、修改时间 Editor, timestamp |

所有用户编辑（英文原文的识别纠错、中文翻译的修正、分类修正等）都记录在这张表里。
All user edits (correcting English OCR errors, fixing Chinese translations, correcting categories, etc.) are recorded in this table.

## 6. 小票上传与识别流程 Receipt Upload & Recognition Flow

**上传方式**：网页用标准的 `<input type="file" accept="image/*" capture="environment">` 控件，手机浏览器会自动提供"拍照"和"从相册选择"两个入口，无需自建相机取景 UI。
**Upload method**: the web app uses a standard `<input type="file" accept="image/*" capture="environment">` control; mobile browsers automatically offer both "take photo" and "choose from library," with no need to build a custom camera UI.

**处理流程**：
**Processing flow**:

1. 上传后立即调用 Claude API 完成 OCR + 翻译 + 商品匹配建议，生成 `status = pending_review` 的草稿。
   Upon upload, the Claude API is immediately called to perform OCR, translation, and product-match suggestion, producing a `status = pending_review` draft.
2. 用户在预览页逐条确认/修正每个字段（商品名、数量、规格、单价、分类、匹配的标准商品）。
   The user reviews and corrects each field line by line on a preview screen (product name, quantity, spec, unit price, category, matched standardized product).
3. 确认后状态变为 `confirmed`，正式计入统计，并触发价格异常检查（第 13 节）。
   Once confirmed, the status becomes `confirmed`, it counts toward statistics, and triggers the price-spike check (Section 13).

不单独设"识别置信度低"标记——预览确认这一步本身就是识别错误的兜底机制。
There's no separate "low confidence" flag — the review/confirm step itself is the safety net for recognition errors.

## 7. 双语内容策略 Bilingual Content Strategy

- **范围**：仅动态数据内容（商品名、店铺名、分类标签）双语化；界面固定文案（菜单、按钮等）只做英文，不做切换，不需要 i18n 框架。
  **Scope**: only dynamic data content (product names, store names, category labels) is bilingual; fixed UI chrome (menus, buttons, etc.) is English-only, with no switching and no i18n framework needed.
- **方向**：小票原文是英文，`_en` 字段是 OCR 识别的原始真实文本，`_zh` 字段是同一次 Claude API 调用顺带产出的中文翻译。
  **Direction**: receipt text is originally English; `_en` fields hold the authentic OCR source text, while `_zh` fields hold the Chinese translation produced by that same Claude API call.
- **存储**：双语字段拆成两列（如 `name_zh` / `name_en`），不用 JSON 字段。
  **Storage**: bilingual fields are split into two columns (e.g. `name_zh` / `name_en`), not packed into a JSON field.
- **修正**：`_en` 的识别错误走标准的预览确认/EditLog 流程；用户发现 `_zh` 翻译不准时可以手动修改，同样记入 EditLog。
  **Corrections**: OCR errors in `_en` go through the standard preview/EditLog flow; if a user finds the `_zh` translation inaccurate, they can edit it manually, likewise recorded in EditLog.
- **界面显示**：做一个语言切换开关（放在设置页或页面顶部），默认只显示一种语言的动态内容，切换后整批内容跟随显示对应语言版本。
  **UI display**: a language toggle is provided (on the settings page or at the top of the page); by default only one language's dynamic content is shown, and switching it changes the displayed language across the board.

## 8. 商品匹配 Product Matching

**匹配方式**：AI 在识别小票的同一次调用（或紧接着）里，把新识别出的 `raw_name_en` 与该圈子已有的标准商品（Product）列表做语义相似度比对，生成匹配建议；用户在预览确认流程里直接确认或改这个建议，不增加额外操作步骤。
**Matching method**: within the same call that recognizes the receipt (or immediately after), the AI compares the newly recognized `raw_name_en` against the circle's existing Product list via semantic similarity, producing a match suggestion; the user confirms or changes it directly within the preview/confirm flow, with no extra steps added.

**判定依据**：以 `raw_name_en`（英文原文）为主要判断依据，`raw_name_zh`（中文翻译）不参与匹配。
**Matching basis**: primarily based on `raw_name_en` (the English source text); `raw_name_zh` (the Chinese translation) doesn't factor into matching.

**规格变化**：不影响匹配判定——同一个标准商品下，不同购买记录的规格可以不一样，规格只是 `ReceiptItem` 自己的属性。
**Spec changes**: don't affect the matching decision — different purchase records under the same standardized product can have different specs; spec is just an attribute of each `ReceiptItem`.

**条码**：不处理。新西兰超市小票通常不打印条码，不为此预留字段。
**Barcodes**: not handled. New Zealand supermarket receipts typically don't print barcodes, so no field is reserved for this.

## 9. 分类体系 Category Taxonomy

- **层级**：两级（大类 + 子类），系统固定预设，所有圈子共用，不支持圈子自定义新增。
  **Levels**: two (top-level category + subcategory), a system-fixed preset shared by all circles; circles cannot add their own custom categories.
- **AI 分类范围**：只能从预设列表里选最匹配的子类，不允许生成新类目。
  **AI categorization scope**: can only pick the best-matching subcategory from the preset list, never invent new categories.
- **分类记忆机制**：用户手动改过某个商品的分类后，记住这次修正；同一个 `product_id` 下次再出现时自动套用改过的分类（key 是 `product_id`，不是原始文本，因为不同措辞的原始文本都会归到同一个标准商品）。
  **Category-memory mechanism**: once a user corrects a product's category, that correction is remembered; the same `product_id` is auto-assigned the corrected category next time (keyed by `product_id`, not raw text, since different wordings of the raw text all resolve to the same standardized product).
- **初始值来源**：识别出一行新商品时，如果它匹配到圈子里已有的 `Product`（第 8 节），分类直接取该 `Product.category`（已有的分类记忆生效）；如果没有匹配、要新建 `Product`，才用 AI 在同一次识别调用里给出的分类建议作为这个新 `Product.category` 的初始值。
  **Initial value source**: when a new line item is recognized, if it matches an existing `Product` in the circle (Section 8), its category is simply that `Product.category` (existing category memory applies); only when there's no match and a new `Product` is created does the AI's category suggestion from that same recognition call become the new `Product.category`'s initial value.

**初始分类目录**：
**Initial category list**:

| 大类 Top-level | English |
|---|---|
| 食品-粮油调味 | Food - Grains & Oil |
| 食品-生鲜 | Food - Fresh Produce |
| 食品-乳制品烘焙 | Food - Dairy & Bakery |
| 食品-零食饮料 | Food - Snacks & Beverages |
| 日用品-清洁洗护 | Household - Cleaning |
| 日用品-个人护理 | Household - Personal Care |
| 母婴用品 | Baby & Maternity |
| 宠物用品 | Pet Supplies |
| 其他/未分类 | Other / Uncategorized |

具体子类留给开发阶段微调；英文名是分类目录的原始定义，中文是翻译。
Exact subcategories are left for development to fine-tune; the English names are the taxonomy's original definition, with Chinese as the translation.

## 10. 涨幅计算与展示 Price-Change Calculation & Display

**对比基准**：和上一次购买价格对比（不是历史均价）。
**Comparison baseline**: against the last purchase price (not a historical average).

**促销过滤**：排除 `is_promotion = true` 的行，基准价和当前价都只取正常价记录；如果最近一次购买恰好是促销价，就继续往前找最近一次非促销记录做基准，避免促销价回归原价被误判为暴涨。
**Promotion filtering**: rows with `is_promotion = true` are excluded; both the baseline and current price are taken from normal-price records only. If the most recent purchase was promotional, the calculation looks further back for the nearest non-promotional record, avoiding a false spike when a promo price reverts to normal.

**单位换算**：
**Unit conversion**:

- 重量类（g/kg）换算成每 100g 单价；体积类（ml/L）换算成每 100ml 单价；计数类（个/pack）直接比 `unit_price`。
  Weight units (g/kg) are normalized to price per 100g; volume units (ml/L) to price per 100ml; count-based units (each/pack) are compared directly by `unit_price`.
- 换算表（如 kg→1000g、L→1000ml）由开发阶段维护，属于实现细节。
  The conversion table (e.g. kg→1000g, L→1000ml) is maintained during development, as an implementation detail.

**公式**：`涨幅% = (本次换算后单价 − 基准换算后单价) / 基准换算后单价 × 100%`。
**Formula**: `change % = (this purchase's normalized unit price − baseline's normalized unit price) / baseline's normalized unit price × 100%`.

**展示内容**：
**Display**:

- 涨幅榜单：本月涨幅最高的商品排行，按 `product_id` 分组。
  Price-change leaderboard: this month's biggest price increases, grouped by `product_id`.
- 单品价格趋势图：某个标准商品历史换算单价随时间变化的折线图，促销记录用空心点等不同样式标出。
  Per-product price trend chart: a line chart of a standardized product's normalized unit price over time, with promotional records marked using a distinct style (e.g. hollow dots).
- 涨跌颜色：涨价红色，降价绿色。
  Color coding: increases in red, decreases in green.

## 11. 多店铺比价 Multi-Store Price Comparison

`Product` 本身是圈子内维度、不区分店铺，`ReceiptItem` 通过 `receipt_id` 关联到 `Receipt.store_name`，所以同一个 `product_id` 天然可能对应多个店铺——数据结构本身已支持跨店铺比较。
`Product` is scoped per circle, not per store, and `ReceiptItem` links to `Receipt.store_name` via `receipt_id` — so a single `product_id` can naturally span multiple stores; the data structure already supports cross-store comparison.

- **对比基准**：复用第 10 节的规则——排除促销行，只比每家店最新一次正常价，不引入"最低价"或"平均价"。
  **Comparison basis**: reuses the rules from Section 10 — promotional rows excluded, comparing only each store's latest normal price, without introducing "lowest price" or "average price."
- **单位换算**：同样复用第 10 节的规则，确保跨店铺比较用同一个基准。
  **Unit conversion**: also reuses the rules from Section 10, ensuring cross-store comparisons use the same basis.
- **展示位置**：商品详情页里紧挨价格趋势图的一个模块，不是独立页面。
  **Display location**: a module on the product detail page, next to the price trend chart — not a standalone page.
- **数据不足**：只在一家店买过时不显示对比，显示"暂无其他店铺的购买记录"。
  **Insufficient data**: if only bought at one store so far, no comparison is shown — it displays "no purchase records from other stores yet."

## 12. 消耗速度与库存提醒 Consumption Rate & Low-Stock Alerts

**计算窗口**：按 `product_id` 取最近 5 次购买记录（不足 5 次用全部）做滑动窗口，日均消耗速度 = 窗口内总购买量（换算成基准单位）÷ 窗口跨越的总天数。这样囤货不会打乱估算。同一天内同一 `product_id` 出现多条 `ReceiptItem`（比如一次买了不同规格的两瓶）时，按同一次"购买记录"合并处理，量直接相加。
**Calculation window**: for a given `product_id`, take the most recent 5 purchases (or all available if fewer) as a sliding window; average daily consumption = total quantity in the window (converted to base units) ÷ total days spanned. This way stockpiling doesn't distort the estimate. If multiple `ReceiptItem` rows for the same `product_id` fall on the same day (e.g. two differently-sized bottles bought in one trip), they're treated as a single "purchase" and their quantities summed.

**数据不足**：累计购买记录少于 3 次时不计算、不提醒，显示"数据不足"。
**Insufficient data**: fewer than 3 accumulated purchases means no estimate or alert — it shows "not enough data yet."

**触发条件**：
**Trigger condition**:

- 预计当前剩余量 = 最近一次购买量（基准单位）− 日均消耗速度 ×（今天 − 最近一次购买日期的天数）。
  Estimated current remaining stock = most recent purchase quantity (base units) − average daily consumption × (days since the most recent purchase).
- 预计剩余天数 = 预计当前剩余量 ÷ 日均消耗速度；跌破 5 天（默认阈值）时触发提醒。
  Estimated days remaining = estimated current remaining stock ÷ average daily consumption; a reminder triggers when this drops below 5 days (default threshold).

**检查机制**：不像价格提醒挂在"确认小票"事件上，而是用每天一次的定时任务（Vercel Cron / Supabase pg_cron）扫描所有商品。
**Check mechanism**: unlike price alerts, this doesn't hang off the "receipt confirmed" event — instead, a daily scheduled job (Vercel Cron / Supabase pg_cron) scans all products.

**提醒频率**：用 `Product.low_stock_alert_active` 标记只提醒一次，直到用户买了新的、剩余天数回升到阈值以上才重置，避免每天重复骚扰。
**Reminder frequency**: the `Product.low_stock_alert_active` flag ensures only one reminder per episode, resetting only once the user buys more and days remaining recovers above the threshold, avoiding repeated daily nagging.

**自动化**：完全依赖购买记录自动推算，不引入手动"标记用完"的录入；UI 明确标注这是"预计"数值，非精确库存。
**Automation**: fully derived from purchase records, with no manual "mark as used up" input; the UI clearly labels these as "estimated" figures, not exact inventory counts.

## 13. 价格异常提醒 Price-Spike Alerts

- **阈值**：固定百分比，涨幅超过 15% 触发（默认值，后续可开放成可调设置项）。
  **Threshold**: a fixed percentage — triggers above a 15% increase (a default, adjustable later).
- **检查时机**：每次小票确认后，立刻对涉及的商品跑第 10 节的涨幅计算。
  **Check timing**: immediately after each receipt is confirmed, the price-change calculation from Section 10 runs for the products on it.
- **接收范围**：圈子内所有成员，不按历史购买人筛选。
  **Audience**: all members of the circle, not filtered by historical buyer.
- **应用内展示**：通知列表，每条显示商品名（双语）、新价格、涨幅百分比，链接到该商品的价格趋势图。
  **In-app display**: a notification list; each entry shows the product name (bilingual), the new price, the percentage increase, and a link to that product's price trend chart.
- **邮件通知**：按小票汇总成一封（同一张小票的多个触发商品合并），不逐条单发。
  **Email notification**: batched per receipt (multiple triggered products on the same receipt combined into one email), not sent individually.
- **静音**：暂不支持按商品关闭提醒。
  **Muting**: per-product muting is not supported for now.

## 14. 数据导出与月度报告 Data Export & Monthly Report

**月度报告页面**：独立页面，按月份选择查看（可回溯历史月份），汇总：
**Monthly report page**: a standalone page, selectable by month (with the ability to browse past months), summarizing:

- 本月总支出及环比变化。
  This month's total spend and its change vs. last month.
- 按分类的支出占比。
  Spending breakdown by category.
- 涨幅榜单（复用第 10 节的计算逻辑，作为本页一个板块）。
  The price-change leaderboard (reusing Section 10's logic as a section on this page).
- 本月触发的价格异常/低库存提醒次数。
  The number of price-spike/low-stock alerts triggered this month.
- 按上传人的支出分布，以及本月上传的小票/商品条目总数。
  Spending distribution by uploader, and the total receipts/line items uploaded this month.

**数据导出**：
**Data export**:

- 格式：CSV。
  Format: CSV.
- 内容：逐条明细，每个 `ReceiptItem` 展开一行（商品名、分类、数量、规格、单价、店铺、日期、上传人），不预先汇总。
  Content: line-by-line detail, with each `ReceiptItem` expanded into one row (product name, category, quantity, spec, unit price, store, date, uploader); nothing pre-aggregated.
- 范围：整个圈子的数据，可选时间范围（如最近一个月、自定义起止日期）。
  Scope: the whole circle's data, with a selectable time range (e.g. the last month, or a custom range).
- 入口：月度报告页面上的一个导出按钮，不单独开导出页面。
  Entry point: an export button on the monthly report page, with no separate export page.

## 15. UI 结构与导航 UI Structure & Navigation

**页面清单**（移动优先）：
**Page list** (mobile-first):

1. **首页/Dashboard**：本月总支出、分类占比、待处理提醒摘要、最近几张小票。
   **Home/Dashboard**: this month's total spend, category breakdown, a pending-alerts summary, recent receipts.
2. **拍照上传流程**：拍照/选图 → AI 处理中 → 预览确认页 → 确认入库。
   **Photo upload flow**: photograph/select → AI processing → preview/confirm → save.
3. **小票列表**：按店铺/日期/上传人筛选历史小票。
   **Receipt list**: historical receipts, filterable by store/date/uploader.
4. **商品详情页**：价格趋势图 + 多店铺比价模块 + 消耗速度/预计剩余天数 + 购买历史。
   **Product detail page**: price trend chart + multi-store comparison module + consumption rate/estimated days remaining + purchase history.
5. **月度报告页**：见第 14 节。
   **Monthly report page**: see Section 14.
6. **通知中心**：价格异常 + 低库存提醒列表。
   **Notification center**: the price-spike and low-stock alert list.
7. **圈子设置**：成员管理、邀请链接。
   **Circle settings**: member management, invite links.

**导航**：底部 Tab Bar——首页 / 小票 / 月度报告 / 通知 / 我的；拍照上传是一个居中悬浮按钮。
**Navigation**: a bottom tab bar — Home / Receipts / Monthly Report / Notifications / Me; photo upload is a centered floating action button.

**双语切换**：语言切换开关（设置页或页面顶部），默认只显示一种语言的动态内容，只影响数据内容，不影响英文界面文案。
**Bilingual toggle**: a language toggle (settings page or page top), showing only one language's dynamic content by default, affecting only data content — not the English UI chrome.

视觉样式（配色之外的字体、间距、组件设计）不在本文档范围内，留给实现阶段或后续 `/prototype` 环节。
Visual styling (fonts, spacing, component design beyond color coding) is outside this document's scope, left for implementation or a later `/prototype` pass.
