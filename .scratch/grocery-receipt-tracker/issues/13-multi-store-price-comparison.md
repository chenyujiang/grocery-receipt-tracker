Type: grilling
Status: resolved
Blocked by: 06

## Question

多店铺比价（同一商品在不同超市的价格对比）要做进这份需求文档，具体怎么设计？
Multi-store price comparison (the same product's price across different supermarkets) is confirmed in scope — how exactly should it be designed?

背景：05 号 ticket 定的 `Product`（标准商品）本身是圈子内维度、不区分店铺的，`ReceiptItem` 上有 `receipt_id` 关联到 `Receipt.store_name_en`，所以同一个 `product_id` 天然可能对应多个不同店铺的购买记录——数据结构本身已经支持跨店铺比较，这张 ticket 主要是定"怎么呈现"和"怎么算"。
Background: the `Product` (standardized product) defined in ticket 05 is scoped per circle, not per store, and `ReceiptItem` links to `Receipt.store_name_en` via `receipt_id` — so a single `product_id` can naturally span purchases from multiple stores. The underlying data structure already supports cross-store comparison; this ticket is mainly about how it's presented and calculated.

需要覆盖：
Needs to cover:

- 对比基准——每家店取最新一次购买价，还是最低历史价，还是平均价。
  Comparison basis — the latest purchase price at each store, the lowest historical price, or an average.
- 是否复用 06 号 ticket 的促销过滤和单位换算规则。
  Whether to reuse the promotion-filtering and unit-conversion rules from ticket 06.
- 展示位置——是单品页面（06 号价格趋势图旁边）的一个模块，还是独立的一个页面。
  Where it's shown — a module on the per-product page (alongside ticket 06's price trend chart), or a standalone page.
- 数据不足时（这个商品只在一家店买过）怎么处理。
  What happens when there isn't enough data (the product has only ever been bought at one store).

## Answer

**对比基准**：复用 06 号 ticket 已经定的规则——排除促销行，只取每家店"最新一次正常价格"做对比，和涨幅计算的口径保持一致，不引入"最低价"或"平均价"这类新概念，减少认知负担。
**Comparison basis**: reuses the rules already established in ticket 06 — promotional rows are excluded, and only each store's "latest normal price" is compared, keeping the same basis as the price-change calculation rather than introducing new concepts like "lowest price" or "average price," which would add cognitive overhead.

**单位换算**：同样复用 06 号 ticket 的单位换算规则（重量/体积换算成每 100g/100ml，计数类直接比 `unit_price`），保证跨店铺比较的是同一个基准。
**Unit conversion**: also reuses ticket 06's unit-conversion rules (weight/volume normalized to per-100g/100ml, count-based units compared directly by `unit_price`), ensuring cross-store comparisons use the same basis.

**展示位置**：作为单品页面的一个模块，紧挨着 06 号 ticket 的价格趋势图——用户点进某个标准商品，同一个页面里既能看到"这个东西价格涨了没"，也能看到"现在哪家店最便宜"，不用跳到另一个独立页面。
**Where it's shown**: as a module on the per-product page, right next to ticket 06's price trend chart — when a user opens a standardized product, the same page shows both "has this gone up in price" and "which store is currently cheapest," without needing to navigate to a separate page.

**数据不足处理**：如果这个商品目前只在一家店买过，这个模块不显示"对比"，只显示"暂无其他店铺的购买记录"，等以后在别的店买过同款才会出现对比。
**Handling insufficient data**: if a product has so far only been bought at one store, this module doesn't show a "comparison" — it shows "no purchase records from other stores yet," and the comparison appears once the same product is bought at a different store.
