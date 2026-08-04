Type: grilling
Status: resolved
Blocked by: 06

## Question

价格异常提醒的具体触发规则是什么？（06 号 ticket 已经给出了涨幅计算公式，这里要定的是"涨多少算异常"以及怎么通知用户。）
What exactly triggers a price-spike alert? (Ticket 06 already defines the price-change formula; this ticket needs to decide "how much of a change counts as abnormal" and how the user is notified.)

需要覆盖：
Needs to cover:

- 触发阈值是固定百分比（如涨幅超过 15%），还是可以按商品类别或让用户自定义。
  Whether the trigger threshold is a fixed percentage (e.g. more than a 15% increase), or can vary by category or be user-configurable.
- 触发频率——每次确认小票后立刻检查，还是按月批量检查一次。
  Trigger frequency — checked immediately after each receipt is confirmed, or checked in a monthly batch.
- 通知渠道——01 号 ticket 已定网页版用"网页内展示 + 邮件通知"的弱推送方案，这里要定具体怎么呈现（应用内的提醒列表、邮件内容包含什么）。
  Notification channel — ticket 01 already decided on a "in-app display + email notification" weak-push approach for the web app; this ticket needs to decide exactly how that's presented (an in-app alert list, what an email contains).
- 是否需要允许用户关闭某个商品的提醒（比如知道某商品本来就贵，不想被反复提醒）。
  Whether users can mute alerts for a specific product (e.g. they already know a product is expensive and don't want repeated alerts).

## Answer

**触发阈值**：固定百分比，涨幅超过 15% 触发（先用一个统一默认值，不分商品类别；后续开发阶段可以开放成可调设置项，不需要现在就做）。
**Trigger threshold**: a fixed percentage — triggers when the increase exceeds 15% (a single default for now, not varied by category; this can be made an adjustable setting later during development, no need to build that now).

**检查时机**：每次用户确认一张小票后（03 号 ticket 的 `status = confirmed` 那一步），立刻对这张小票里涉及的商品逐个跑 06 号 ticket 的涨幅计算，实时判断是否触发。
**Check timing**: immediately after the user confirms a receipt (the `status = confirmed` step from ticket 03), the price-change calculation from ticket 06 is run for each product on that receipt, checking in real time whether the threshold is triggered.

**接收范围**：圈子内所有成员都能看到提醒，不按"历史上谁买过这个商品"筛选——圈子内消费本来就是共享的，保持简单一致，和 02 号 ticket "member 能看到圈子全部记录"的权限设计一致。
**Who receives it**: all members of the circle see the alert, without filtering by "who has historically bought this product" — spending within a circle is shared by design, so this stays simple and consistent with ticket 02's permission model, where members can see all of the circle's records.

**应用内展示**：一个"提醒"列表（类似通知中心），每条显示触发的商品名（双语）、这次价格、涨幅百分比、跳转到该商品价格趋势图的链接。
**In-app display**: an "alerts" list (like a notification center); each entry shows the triggered product's name (bilingual), the new price, the percentage increase, and a link to that product's price trend chart.

**邮件通知**：不是每次触发都单独发一封，而是按"这次小票"汇总——一张小票确认后，如果里面有多个商品触发了价格异常，合并成一封邮件发给圈子所有成员，列出这次小票里所有触发提醒的商品，避免被逐条邮件轰炸。
**Email notification**: rather than sending a separate email for every trigger, alerts are batched per receipt — after a receipt is confirmed, if multiple products on it triggered a price spike, they're combined into a single email sent to all circle members, listing every triggered product from that receipt, avoiding an inbox flooded with one-off emails.

**静音功能**：暂不做。先不支持按商品关闭提醒，保持 MVP 简单；如果后续用户反馈提醒太吵，再加这个功能。
**Mute functionality**: not built for now. Per-product alert muting isn't supported in this pass, keeping the MVP simple; it can be added later if users find the alerts too noisy.
