Type: grilling
Status: resolved
Blocked by: 05

## Question

消耗速度怎么计算，以及库存快用完提醒怎么触发？
How should consumption rate be calculated, and what should trigger a low-stock reminder?

需要决定：
Needs deciding:

- 消耗速度是基于"购买间隔天数 ÷ 每次购买数量/规格"估算平均消耗速度（例如一瓶 5L 油平均 45 天买一次，约等于每天消耗 111ml），还是需要用户输入更多信息（如家庭人口数、是否囤货）。
  Whether consumption rate is estimated as "days between purchases ÷ quantity/spec per purchase" (e.g. buying a 5L bottle of oil every 45 days on average works out to roughly 111ml/day), or whether extra user input is needed (e.g. household size, whether they stockpile).
- 购买间隔不规律时（例如一次性囤了 3 瓶）如何避免消耗速度计算失真。
  How to avoid distorted calculations when purchase intervals are irregular (e.g. buying 3 bottles at once).
- 库存快用完提醒的触发条件是什么（例如预计剩余天数少于 N 天时提醒）。
  What the trigger condition for a low-stock reminder should be (e.g. reminding when the estimated days remaining falls below N).
- 提醒依据的"当前库存"是估算值而非真实库存，如何向用户说明这是预测而非精确值。
  Since the "current stock" the reminder relies on is an estimate rather than a real inventory count, how to communicate to the user that this is a prediction, not an exact figure.

产出应为消耗速度的计算模型和提醒触发规则。
The output should be the consumption-rate calculation model and the reminder trigger rules.

## Answer

**计算窗口**：按 `product_id` 取最近 5 次购买记录（不足 5 次就用现有全部记录）做滑动窗口，用"窗口内总购买量 ÷ 窗口跨越的总天数"算平均每日消耗速度，而不是只看最近一次购买间隔，这样囤货（一次买好几瓶）不会把估算打乱。
**Calculation window**: for a given `product_id`, take the most recent 5 purchase records (or all available records if fewer than 5) as a sliding window, and compute average daily consumption as "total quantity purchased within the window ÷ total days spanned by the window," rather than looking only at the most recent purchase interval — this way stockpiling (buying several bottles at once) doesn't throw off the estimate.

- 重量/体积类商品换算成 06 号 ticket 已经定的基准单位（g / ml）后再累加求和；计数类商品直接用数量累加，不需要换算。
  Weight/volume products are converted to the base units already established in ticket 06 (g / ml) before summing; count-based products are summed directly by quantity, with no conversion needed.
- 窗口跨度按窗口内最早一次购买日期到最近一次购买日期的天数计算；若同一天出现多次购买导致跨度为 0，按 1 天处理，避免除以零。
  The window's span is the number of days from the earliest to the most recent purchase date within the window; if multiple purchases fall on the same day, causing a span of 0, it's treated as 1 day to avoid dividing by zero.

**数据不足时的处理**：某个标准商品累计购买记录少于 3 次时，不计算、不提醒，页面显示"数据不足，还需要更多购买记录才能预测"，达到 3 次后才开始正常估算和提醒。
**Handling insufficient data**: if a standardized product has fewer than 3 accumulated purchase records, no estimate or reminder is generated — the page shows "not enough data yet to predict"; normal estimation and reminders begin once 3 records are reached.

**库存快用完提醒的触发条件**：
**Trigger condition for the low-stock reminder**:

- 预计当前剩余量 = 最近一次购买的量（换算成基准单位）− 平均每日消耗速度 × （今天 − 最近一次购买日期的天数）。
  Estimated current remaining stock = the most recent purchase's quantity (in base units) − average daily consumption rate × (days since the most recent purchase date).
- 预计剩余天数 = 预计当前剩余量 ÷ 平均每日消耗速度；预计剩余天数 < 5 天时触发提醒（先定一个默认阈值，后续开发阶段可以再开放成用户可调的设置项，不需要现在就做成可配置）。
  Estimated days remaining = estimated current remaining stock ÷ average daily consumption rate; a reminder is triggered when this falls below 5 days (a default threshold for now — it can be made a user-adjustable setting later during development, no need to build that configurability now).

**准确度与自动化**：完全依赖购买记录自动推算，不引入"标记用完/没用完"这类手动录入，避免增加使用负担。页面上明确标注这是"预计"数值（如"预计还能用 3 天"字样），并说明是基于最近几次购买记录估算，让用户理解这是预测而非精确库存。
**Accuracy and automation**: the estimate is derived entirely from purchase records, with no manual "mark as used up / not used up" input, to avoid adding to the user's workload. The UI clearly labels these as "estimated" figures (e.g. "approx. 3 days of stock left") and notes that they're based on recent purchase history, so users understand this is a prediction, not an exact inventory count.
