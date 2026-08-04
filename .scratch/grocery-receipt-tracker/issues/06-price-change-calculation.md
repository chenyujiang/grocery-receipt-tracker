Type: grilling
Status: resolved
Blocked by: 05

## Question

月度价格对比与涨幅怎么计算和展示？（含"隐性涨价识别"功能的计算基础）
How should the monthly price comparison and percentage change be calculated and displayed? (This also underpins the "hidden price-hike detection" feature.)

需要决定：
Needs deciding:

- 涨幅是"和上一次购买价格对比"，还是"和某个历史平均价（如近 3 个月均价）对比"。
  Whether the change is measured "against the last purchase price" or "against a historical average (e.g. the trailing 3-month average)."
- 商品规格发生变化时（如 500g 变 400g），如何换算成统一单位价格（如元/100g）来判断真实涨跌。
  When a product's spec changes (e.g. 500g to 400g), how to convert it into a common unit price (e.g. price per 100g) to judge the real change.
- 页面具体展示什么内容（涨幅榜单、单个商品的价格趋势图、涨跌幅正负颜色规则等）。
  Exactly what the page displays (a leaderboard of price changes, a per-product price trend chart, color rules for positive/negative changes, etc.).
- 促销/临时降价是否会干扰涨幅判断（例如买到促销价，下次恢复原价，会不会被误判为"暴涨"）。
  Whether promotions/temporary discounts could distort the change calculation (e.g. buying at a promotional price, then the price reverting next time — would that be misread as a "spike"?).

产出应为涨幅计算公式和月度对比页面的信息结构。
The output should be the price-change formula and the information structure of the monthly comparison page.

## Answer

**对比基准**：和上一次购买价格对比，而不是历史均价，这是最直观的算法，也符合最初的需求描述。
**Comparison baseline**: compare against the last purchase price rather than a historical average — the most intuitive approach, and it matches the original requirement description.

**促销行处理**：计算时排除 `is_promotion = true` 的行，基准价格和当前价格都只取正常价（`is_promotion = false`）的记录。如果最近一次购买恰好是促销价，就继续往前找最近一次非促销的记录做基准，避免"买到促销价、下次恢复原价"被误判为暴涨。
**Handling promotions**: rows with `is_promotion = true` are excluded from the calculation — both the baseline and the current price are taken only from normal-price (`is_promotion = false`) records. If the most recent purchase happens to be a promotional one, the calculation looks further back for the nearest non-promotional record to use as the baseline, avoiding a false "spike" reading when a promo price reverts to normal.

**单位换算**：按 `unit_spec_unit` 的类型自动换算成统一基准单位再比较：
**Unit conversion**: normalized to a common base unit based on the type of `unit_spec_unit` before comparing:

- 重量类（g / kg）统一换算成"每 100g"的单价。
  Weight units (g / kg) are normalized to a "price per 100g" basis.
- 体积类（ml / L）统一换算成"每 100ml"的单价。
  Volume units (ml / L) are normalized to a "price per 100ml" basis.
- 计数类（个/pack 等无法拆分的单位）不做换算，直接用 `unit_price` 本身对比，因为"每个"就是最小可比单位。
  Count-based units (each/pack, and other units that can't be subdivided) are not normalized — `unit_price` itself is compared directly, since "per item" is already the smallest comparable unit.
- 换算表由开发阶段维护一份静态的单位类型/换算比例映射（如 kg→1000g、L→1000ml），这份表本身不需要在这张 ticket 里穷举完，属于实现细节。
  The conversion table (a static mapping of unit type/ratio, e.g. kg→1000g, L→1000ml) is maintained during development; it doesn't need to be exhaustively enumerated in this ticket — that's an implementation detail.

**涨跌幅公式**：`涨幅% = (本次换算后单价 − 基准换算后单价) / 基准换算后单价 × 100%`，基准和本次都按上面的促销过滤和单位换算规则取值。
**Price-change formula**: `change % = (this purchase's normalized unit price − baseline's normalized unit price) / baseline's normalized unit price × 100%`, with both values selected using the promotion-filtering and unit-conversion rules above.

**月度对比页面展示内容**：
**What the monthly comparison page shows**:

- **涨幅榜单**：本月（按 `purchase_date` 落在当月的 confirmed 记录）涨幅最高的商品排行，按 `product_id` 分组，一行一个标准商品。
  **Price-change leaderboard**: a ranking of products with the largest price increases this month (confirmed records whose `purchase_date` falls in the current month), grouped by `product_id`, one row per standardized product.
- **单品价格趋势图**：点进某个标准商品，展示它历史所有购买记录的换算单价随时间变化的折线图；促销记录用不同的点样式（如空心点）标出，避免被误读成真实价格波动。
  **Per-product price trend chart**: clicking into a standardized product shows a line chart of its normalized unit price across all historical purchase records over time; promotional records are marked with a different point style (e.g. hollow dots) so they aren't misread as genuine price movement.
- **涨跌颜色规则**：涨价显示红色，降价显示绿色，直观区分。
  **Color coding**: price increases are shown in red, decreases in green, for quick visual distinction.
