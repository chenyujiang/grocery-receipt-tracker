Type: grilling
Status: resolved

## Question

页面结构/信息架构长什么样，双语内容在界面上怎么切换显示？（不是要做像素级视觉设计，而是把 spec 需要的页面清单、导航方式、双语显示机制定下来；具体视觉样式留给实现阶段或后续的 /prototype 环节。）
What does the page structure/information architecture look like, and how does the UI toggle between the two languages? (This isn't pixel-level visual design — it's pinning down the page list, navigation pattern, and bilingual display mechanism that the spec needs; exact visual styling is left for implementation or a later `/prototype` pass.)

## Answer

**页面清单**（移动优先，因为核心操作是手机拍照上传）：
**Page list** (mobile-first, since the core action is photographing receipts on a phone):

- 首页/Dashboard：本月总支出、分类占比、待处理提醒摘要（10/11 号 ticket）、最近几张小票。
  Home/Dashboard: this month's total spend, category breakdown, a summary of pending alerts (tickets 10/11), and the most recent receipts.
- 拍照上传流程：拍照/选图 → AI 处理中 → 预览确认页（逐条编辑双语商品名、数量、规格、单价、分类、匹配建议，见 03/05 号 ticket）→ 确认入库。
  Photo upload flow: take a photo / pick an image → AI processing → a preview/confirm screen (editing bilingual product name, quantity, spec, unit price, category, and match suggestion line by line, per tickets 03/05) → confirm to save.
- 小票列表：历史小票，按店铺/日期/上传人筛选。
  Receipt list: historical receipts, filterable by store/date/uploader.
- 商品详情页：06 号的价格趋势图 + 13 号的多店铺比价模块 + 07 号的消耗速度/预计剩余天数 + 该商品的购买历史。
  Product detail page: ticket 06's price trend chart + ticket 13's multi-store comparison module + ticket 07's consumption rate/estimated days remaining + the product's purchase history.
- 月度报告页：按月份汇总的总览——本月总支出及环比、分类占比、涨幅榜单（复用 06 号 ticket 的计算逻辑，作为本页一个板块，不再单列一个重复页面）、本月触发的价格异常/低库存提醒次数（10/11 号）、按上传人的支出分布，以及导出当前时间范围数据的按钮（12 号 ticket，CSV 格式，不单独开一个导出页面）。
  Monthly report page: a month-scoped overview — this month's total spend and its change vs. last month, category breakdown, a price-change leaderboard (reusing ticket 06's calculation logic as a section on this page rather than a separate, duplicate page), the number of price-spike/low-stock alerts triggered this month (tickets 10/11), spending distribution by uploader, and a button to export data for the current time range (ticket 12, CSV format, no separate export page).
- 通知中心：10/11 号的提醒列表。
  Notification center: the alert list from tickets 10/11.
- 圈子设置：成员管理、邀请链接（02 号 ticket）。
  Circle settings: member management, invite links (ticket 02).

**导航方式**：底部 Tab Bar（移动网页更顺手）——首页 / 小票 / 月度报告 / 通知 / 我的；拍照上传做成一个居中悬浮的醒目按钮，而不是塞进某个 tab 里。
**Navigation pattern**: a bottom tab bar (more natural for mobile web) — Home / Receipts / Monthly Report / Notifications / Me; photo upload is a prominent, centered floating action button rather than being tucked into one of the tabs.

**双语内容显示机制**：做一个语言切换开关（放在"我的"/设置页，或者页面顶部），默认只显示一种语言的动态内容（商品名、店铺名等 `_zh`/`_en` 字段），切换后整批内容跟着切换显示的语言版本；开关只影响数据内容，不影响界面固定文案（09 号 ticket 已定界面固定文案只做英文，不受这个开关影响）。
**Bilingual content display mechanism**: a language toggle (placed on the "Me"/settings page, or at the top of the page) is added; by default only one language's version of dynamic content (`_zh`/`_en` fields like product names, store names) is shown, and switching it changes which language version is displayed across the board. The toggle only affects dynamic data content — it doesn't affect fixed UI chrome, which per ticket 09 is English-only regardless of this toggle.

**范围说明**：这张 ticket 定的是页面清单、导航结构和双语切换机制，不是像素级的视觉设计（配色细节已经在 06 号 ticket 里定了涨红跌绿；字体、间距、组件样式等留给实现/原型阶段）。
**Scope note**: this ticket settles the page list, navigation structure, and the bilingual toggle mechanism — not pixel-level visual design (color coding is already settled in ticket 06 as red-up/green-down; fonts, spacing, and component styling are left for implementation/prototyping).
