Type: grilling
Status: resolved
Blocked by: 07

## Question

库存快用完提醒具体怎么展示和通知？（07 号 ticket 已经给出了"预计剩余天数 < 5 天触发"的判定条件，这里要定的是通知怎么呈现给用户。）
Exactly how should the low-stock reminder be displayed and delivered? (Ticket 07 already defines the trigger condition — estimated days remaining < 5 — this ticket needs to decide how the notification is presented to the user.)

需要覆盖：
Needs to cover:

- 通知渠道——01 号 ticket 已定网页版用"网页内展示 + 邮件通知"的弱推送方案，这里要定具体怎么呈现（应用内的提醒列表长什么样、邮件包含什么信息）。
  Notification channel — ticket 01 already decided on a "in-app display + email notification" weak-push approach for the web app; this ticket needs to decide exactly how that's presented (what the in-app alert list looks like, what an email contains).
- 提醒频率——预计剩余天数 < 5 天后，是只提醒一次，还是每天都提醒直到用户买了或手动关闭。
  Reminder frequency — once estimated days remaining drops below 5, is the user notified once, or every day until they buy it or dismiss the alert.
- 圈子内谁会收到提醒——所有成员都收到，还是只有历史上买过这个商品的人。
  Who in the circle receives the reminder — all members, or only members who have historically bought this product.
- 是否和 10 号「价格异常提醒规则」ticket 共用同一套通知列表/邮件模板，还是分开展示。
  Whether this shares the same notification list/email template as ticket 10 ("price-spike alert rules"), or is displayed separately.

## Answer

**检查机制**：库存快用完提醒不像 10 号 ticket 那样能挂在"确认小票"这个事件上触发，因为预计剩余天数会随时间推移自然下降，哪怕这几天没有新小票。所以用一个每天固定跑一次的定时任务（Vercel Cron 或 Supabase pg_cron）扫描圈子里所有标准商品（`product_id`）的预计剩余天数，检查是否新跌破 5 天阈值。
**Check mechanism**: unlike ticket 10, the low-stock reminder can't hang off the "receipt confirmed" event, because estimated days remaining naturally decreases over time even with no new receipts. So a daily scheduled job (Vercel Cron or Supabase pg_cron) scans every standardized product (`product_id`) in each circle to check whether its estimated days remaining has newly dropped below the 5-day threshold.

**提醒频率**：每个商品维护一个"是否处于低库存提醒状态"的标记（例如 `Product.low_stock_alert_active` 布尔字段）。跌破阈值时，如果这个标记还是 false，就触发一次提醒并把它设为 true；此后定时任务每天扫描到同一个商品仍在阈值以下，但标记已经是 true，就不重复发送。只有当用户买了新的、预计剩余天数回升到 5 天以上时，才把标记重置为 false，为下一次真正用完再次跌破阈值做准备。
**Reminder frequency**: each product keeps a "currently in low-stock alert state" flag (e.g. a `Product.low_stock_alert_active` boolean). When the threshold is first crossed, if this flag is still false, one reminder is sent and the flag is set to true; on subsequent days, the daily job sees the same product still below the threshold but with the flag already true, so it doesn't resend. Only once the user buys more and the estimated days remaining rises back above 5 does the flag reset to false, ready to trigger again the next time it's genuinely running low.

**通知渠道与接收范围**：复用 10 号 ticket 已经定的应用内通知列表和邮件模板，只是消息类型不同（低库存 vs 价格异常），不单独再造一套 UI。接收范围同样是圈子内全体成员，保持和 10 号一致。
**Notification channel and audience**: reuses the in-app notification list and email template already established in ticket 10, just with a different message type (low-stock vs. price-spike) rather than building a separate UI. The audience is likewise all members of the circle, consistent with ticket 10.
