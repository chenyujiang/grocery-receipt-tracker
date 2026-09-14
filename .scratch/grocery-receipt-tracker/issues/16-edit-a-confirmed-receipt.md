Type: grilling
Status: resolved
GitHub: #17

## Question

The AI-scanned data is sometimes wrong (name/quantity/price misread, wrong month, wrong weight), but once a receipt is `confirmed`, `ReceiptDetail.tsx` is 100% read-only — there's no way to fix a mistake short of deleting and re-uploading the whole receipt. Needs deciding:

- How much of a confirmed receipt should become editable (which fields)?
- How does date editing fit the app's existing month-only `MonthPickerField`, given `purchase_date` needs day precision?
- How should the weight/volume spec (for items sold by weight, e.g. loose produce) be edited, given only 4 units (`g`/`kg`/`ml`/`l`) are actually recognized by the unit-normalization logic (`src/lib/units.ts`)?
- Who's allowed to edit — same permission model as delete (uploader-only), or looser?
- Does editing need to interact with price-spike alerts, which are computed once at confirm-time and never re-checked?

**Derived information** (from exploring the existing code before asking):
- RLS on `receipts`/`receipt_items` already has **no status check at all** — updating a `confirmed` row is already technically permitted by the database today. The read-only-after-confirm behavior is purely a frontend convention (`ReceiptDetail.tsx`'s own comment says confirming "locks the line items against further edits," but nothing enforces that beyond not building an edit UI).
- `confirmReceipt()`'s per-item update loop (`src/lib/receipts.ts:150-244`) — diff via `diffReceiptItemFields`, log each changed field to `edit_logs`, then write — is generic and not conditioned on receipt status, so it's directly reusable for post-confirmation edits.
- `edit_logs` already has a nullable `receipt_id` alongside `receipt_item_id`, so a receipt-level field (like `purchase_date`) can be logged the same way as an item field, just with `receipt_item_id` null.
- All downstream consumers (price trend, consumption rate, monthly report) compute live from `receipts`/`receipt_items` on every read — none cache derived results, so editing historical data doesn't require any recomputation/invalidation step for those. The one exception is price-spike alerts (see below), which are written once and never revisited.

## Answer

**1. Editable fields**: the same subset already editable pre-confirm (product name EN/ZH, quantity, unit price, promotion flag), **plus**:
- **Purchase date** — receipt-level, editable via `MonthPickerField` (the same component already used for the receipt-list filter and report export range). Month-only editing is intentional and sufficient — the real-world mistake this addresses is a misread month, not a misread day. **Important implementation detail**: `MonthPickerField`'s `onChange` always resets the day-of-month to `1`; naively wiring it up would silently corrupt an already-correct day when the user only meant to fix the month. The edit flow must preserve the existing day-of-month, combining the picker's year/month with the receipt's current day — not defaulting to the 1st.
- **Weight/volume spec** (`unit_spec_value` + `unit_spec_unit`) — but **only shown for items that already have a unit set** (i.e. `unit_spec_unit` is non-null — a weighed/measured item like loose produce). Plain count-based items (`unit_spec_unit` null, e.g. a boxed item) don't show this control at all; only their quantity is editable, same as today.
- The unit itself is a **fixed 4-option dropdown** — `g` / `kg` / `ml` / `L` — not free text. This matches exactly the set `src/lib/units.ts` actually normalizes (`GRAMS_PER_UNIT`/`ML_PER_UNIT`); anything else silently falls through to "each" basis in price-trend/consumption-rate math with no error, so a typo'd unit would quietly corrupt those calculations without anyone noticing. Same "AI can't invent a value outside the fixed list" spirit as the category field (ticket 04).
- Still **not** in scope: `original_price`, `subtotal`, `category`, product match (`matched_product_id`/`product_id`), store name. Left for a future round if it turns out to matter in practice.

**2. UI**: inline editing directly on `ReceiptDetail.tsx` (the confirmed-receipt page itself) — an "Edit" toggle that swaps the read-only display for editable inputs (mirroring `ReceiptReview.tsx`'s field styling), with Save/Cancel. Not a separate route, not a reuse of `ReceiptReview`'s screen.

**3. Permission**: uploader-only, matching the existing delete-receipt permission model exactly. No RLS change needed — `receipts`/`receipt_items`'s existing `uploaded_by = auth.uid()` UPDATE policies already enforce this; the frontend just needs to only show the Edit control to the uploader (same pattern `ReceiptList.tsx` already uses to gate the delete button).

**4. Price-spike alerts are not re-triggered on edit.** Alerts already recorded at confirm-time stay exactly as they are, right or wrong — editing a price afterward doesn't retroactively fix a false alert or backfill a missed one. Kept simple deliberately; only future receipts get checked going forward. (Low-stock's `low_stock_alert_active` flag has the same kind of go-stale-until-next-cron-tick property from editing past quantities, but that's an existing property of the daily cron, not something this ticket needs to address.)

**Consequences for other tickets**: none — this only adds capability to an existing page and reuses existing infrastructure (`diffReceiptItemFields`, `edit_logs`, `MonthPickerField`, the RLS policies) rather than changing any of it. Ticket 14's "confirming locks the line items" line (in its own body, not the map's gist) is now superseded by this ticket.

## Implementation

Built and shipped, TDD throughout (210 tests green, typecheck clean):

- **`src/lib/receipts.ts`**: extracted the per-item diff-then-log-then-update loop out of `confirmReceipt` into a shared `updateReceiptItemsWithLog`, and added `editConfirmedReceipt(receiptId, purchaseDate, items)` on top of it — reuses that loop for items, does its own diff/log/update for `purchase_date`, and deliberately skips status and `recordPriceSpikeAlerts`. `ReceiptDraft` gained an `uploadedBy` field (and `fetchReceiptDraft` now selects `uploaded_by`) so the frontend can gate the Edit control.
- **`src/pages/ReceiptDetail.tsx`**: an `editing` toggle swaps the read-only view for the same per-item field set as `ReceiptReview.tsx` (name EN/ZH, quantity, unit price, promotion), plus a `MonthPickerField` for the purchase month and a conditional weight/volume spec editor (value + a fixed `g`/`kg`/`ml`/`L` `<select>`) shown only when `unitSpecUnit` is already non-null. The Edit button itself only renders when `draft.uploadedBy === session.userId`. Month changes preserve the existing day-of-month via `withMonthKeepingDay` (clamped to the new month's actual last day) rather than resetting to the 1st.
- Not verified against the real deployed app with the real account (no test credentials available to this session) — verification is the test suite above; worth a manual pass next time there's browser access with real login.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

AI 扫描的数据有时候会出错（商品名/数量/价格看错、月份识别错、称重看错），但小票一旦被"确认"，`ReceiptDetail.tsx` 就是完全只读的——除了删掉整张小票重新上传，没有别的办法修正错误。需要决定：

- 已确认小票要开放多大范围的编辑（哪些字段）？
- 日期怎么编辑，才能跟 app 现有的"只能选到月"的 `MonthPickerField` 组件对上，而 `purchase_date` 又需要精确到日？
- 按重量卖的商品（比如散装蔬果）的规格单位怎么编辑，考虑到单位换算逻辑（`src/lib/units.ts`）实际上只认识 4 种单位（`g`/`kg`/`ml`/`l`）？
- 谁可以编辑——跟删除权限一样只限上传人，还是更宽松？
- 编辑要不要跟价格异常提醒（只在确认那一刻算一次，之后不会重新检查）产生联动？

**衍生信息**（提问之前先探查代码得到的）：
- `receipts`/`receipt_items` 的 RLS **本来就没有任何状态检查**——更新一条已经"confirmed"的记录，数据库层面现在就是允许的。确认后只读的行为纯粹是前端约定（`ReceiptDetail.tsx` 自己的注释里说确认会"锁定条目不能再编辑"，但除了没做编辑界面之外，没有任何东西真的强制了这一点）。
- `confirmReceipt()` 里那段逐条更新的循环（`src/lib/receipts.ts:150-244`）——用 `diffReceiptItemFields` 对比差异、把改动的字段写进 `edit_logs`、然后写库——是通用逻辑，不依赖小票状态，可以直接拿来复用在确认后的编辑上。
- `edit_logs` 本来就有一个可为空的 `receipt_id` 字段（跟 `receipt_item_id` 并列），所以像 `purchase_date` 这种小票级别（不是条目级别）的字段，也能用同样的方式记录，只是 `receipt_item_id` 留空。
- 所有下游计算（价格趋势、消耗速度、月度报告）每次都是从 `receipts`/`receipt_items` 实时查询计算的，没有任何缓存结果——所以编辑历史数据不需要额外做任何重新计算/失效处理。唯一的例外是价格异常提醒（见下），那是写一次就不会再回头看的。

## 回答

**1. 可编辑字段**：确认前本来就能改的那几个（商品名中英文、数量、单价、是否促销），**再加上**：

- **购买日期**——小票级别的字段，用 `MonthPickerField` 编辑（跟小票列表筛选、报告导出范围用的是同一个组件）。只精确到"月"是有意为之、也足够了——你实际碰到的问题是月份识别错了，不是"号数"识别错了。**有个实现细节要注意**：`MonthPickerField` 的 `onChange` 每次都会把"号数"重置成 1 号；如果直接照搬接上去，用户本来只想改月份，结果会把本来识别正确的"号数"给悄悄改错。编辑流程里必须保留小票原来的"号数"，只用选择器给的年/月去替换，不能默认成 1 号。
- **重量/体积规格**（`unit_spec_value` + `unit_spec_unit`）——但**只有这个商品本来就有单位（`unit_spec_unit` 不为空，比如散装称重的蔬果）才显示这个编辑框**。纯按件卖的商品（`unit_spec_unit` 为空，比如一盒装的商品）完全不显示这个，只能改数量，跟现在一样。
- 单位本身做成**固定的四选一下拉框**——`g`/`kg`/`ml`/`L`，不是自由文本。这正好对应 `src/lib/units.ts` 实际能换算的那几种（`GRAMS_PER_UNIT`/`ML_PER_UNIT`）；换成别的单位会在价格趋势/消耗速度的计算里悄悄退化成"按件"处理，不会报错，但会算错，也没人会发现。跟分类字段（票04）"AI 不能自己发明新分类，只能从固定列表选"是同一个思路。
- 仍然**不在**这次范围内：原价、小计、分类、匹配的商品（`matched_product_id`/`product_id`）、店名。如果以后实际用起来发现需要，留给后续再加。

**2. UI**：直接在 `ReceiptDetail.tsx`（已确认小票那个页面本身）做内联编辑——一个"编辑"按钮，点了之后把只读展示换成可编辑的输入框（样式上参照 `ReceiptReview.tsx` 现有的字段风格），配合保存/取消按钮。不是单独开一个路由，也不是复用 `ReceiptReview` 那个页面。

**3. 权限**：只有上传这张小票的人能编辑，跟删除小票的权限模型完全一致。不需要改数据库 RLS——`receipts`/`receipt_items` 现有的 `uploaded_by = auth.uid()` 更新策略本来就已经限制住了；前端只需要照着 `ReceiptList.tsx` 现在控制删除按钮显示的那套逻辑，只给上传人显示"编辑"按钮。

**4. 编辑不会重新触发价格异常提醒检查。** 确认那一刻已经生成的提醒记录，无论对错都保持原样——之后编辑价格不会追溯性地撤销一条误报，也不会补发一条当时漏掉的真实提醒。这是有意保持简单——以后新上传的小票该怎么检查还是照常检查。（库存提醒的 `low_stock_alert_active` 标记，因为编辑历史数量也会有类似的"要等下一次每日定时任务才会更新"的滞后性，但这是每日 cron 本身就有的特性，不是这张票需要处理的问题。）

**对其他票的影响**：没有——这只是给一个已有页面新增能力，复用的都是现成的基础设施（`diffReceiptItemFields`、`edit_logs`、`MonthPickerField`、现有的 RLS 策略），不改动它们。票14 自己文档里"确认之后锁定条目不能再编辑"那句话，现在被这张票取代了（这句话在票14自己的正文里，不在 map 的摘要里）。

## 实现

已经做完并上线，全程 TDD（210 个测试全绿，typecheck 干净）：

- **`src/lib/receipts.ts`**：把 `confirmReceipt` 里那段"逐条对比差异→写日志→更新"的循环抽成了共享的 `updateReceiptItemsWithLog`，在这基础上新增了 `editConfirmedReceipt(receiptId, purchaseDate, items)`——条目部分复用那个循环，`purchase_date` 单独做一次对比/日志/写入，有意跳过状态更新和 `recordPriceSpikeAlerts`。`ReceiptDraft` 新增了 `uploadedBy` 字段（`fetchReceiptDraft` 也相应查询了 `uploaded_by`），前端靠这个字段来控制编辑按钮的显示。
- **`src/pages/ReceiptDetail.tsx`**：一个 `editing` 状态切换只读展示和跟 `ReceiptReview.tsx` 一样的字段编辑（商品名中英文、数量、单价、促销标记），加上购买月份用 `MonthPickerField`，以及一个只在 `unitSpecUnit` 本来就不为空时才显示的重量/体积规格编辑器（数值+固定的 `g`/`kg`/`ml`/`L` 下拉框）。"编辑"按钮本身只在 `draft.uploadedBy === session.userId` 时才渲染。切换月份时用 `withMonthKeepingDay` 保留原来的"号数"（并按新月份实际天数做了裁剪），不会重置成1号。
- 没有用真实账号在实际部署的网站上验证过（这次会话没有可用的测试账号密码）——目前的验证靠的是上面这套测试；下次能用真实账号登录的时候值得手动过一遍。
