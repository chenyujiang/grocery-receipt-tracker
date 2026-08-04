Type: grilling
Status: resolved
Blocked by: 03

## Question

如何判断两次不同小票上的商品是"同一件商品"，从而能做跨月份的单价对比和消耗速度统计？
How do we decide that a line item on two different receipts is "the same product," so we can do cross-month unit-price comparison and consumption-rate tracking?

超市小票上的商品名称经常不完全一致（例如同一款牛奶在不同小票上写成 "Anchor Blue Milk 2L" 和 "Anchor Milk Blue Top 2L"，或简写、内部编码），且同一商品可能换了规格（2L 变 1L）。
Product names on supermarket receipts are often not identical (e.g. the same milk showing up as "Anchor Blue Milk 2L" on one receipt and "Anchor Milk Blue Top 2L" on another, or abbreviations and internal codes), and the same product may change its spec (2L becoming 1L).

需要决定匹配策略：
A matching strategy needs to be decided:

- 是否依赖 AI 语义相似度判断。
  Whether to rely on AI semantic-similarity judgment.
- 是否引入商品条码（若小票上没有条码则不可行）。
  Whether to bring in product barcodes (not feasible if the receipt has no barcode).
- 是否需要用户在识别后手动确认/合并"这是同一件商品"。
  Whether the user needs to manually confirm/merge "this is the same product" after recognition.
- 规格变化后的商品，算"同一商品换了规格"还是"新商品"。
  Whether a product whose spec has changed counts as "the same product with a new spec" or "a new product."

产出应为商品匹配/去重的判定规则，以及必要的用户交互点。
The output should be the product-matching/deduplication rules, plus any necessary user-interaction points.

**衍生信息（来自 04 号 category-taxonomy ticket）**：分类记忆机制目前先按 `raw_name` 规范化文本作为 key。这里定下"标准化商品"判定规则后，如果产出了比原始文本更稳定的标准商品 ID，应该建议分类记忆改用这个 ID 做 key，而不是继续用文本名匹配。
**Derived information (from ticket 04, category-taxonomy)**: the category-memory mechanism currently keys off normalized `raw_name` text. Once this ticket settles the rules for a "standardized product," if it produces a standard-product ID that's more stable than raw text, category memory should switch to keying off that ID instead of continuing to match on the text name.

**衍生信息（来自 09 号 bilingual-content-strategy ticket）**：03 号数据结构里的 `raw_name` 已拆成 `raw_name_zh` / `raw_name_en`。小票原文是英文（新西兰超市），这里的匹配逻辑应该以 `raw_name_en`（英文原文）为主要判断依据，`raw_name_zh` 只是翻译展示用，不参与匹配判定。
**Derived information (from ticket 09, bilingual-content-strategy)**: `raw_name` in ticket 03's data schema is now split into `raw_name_zh` / `raw_name_en`. Since receipt text is originally English (New Zealand supermarkets), the matching logic here should be based primarily on `raw_name_en` (the English source text); `raw_name_zh` is only a translation for display and doesn't participate in the matching decision.

## Answer

**执行方式**：AI 在识别小票的同时（或紧接着），把新识别出的 `raw_name_en` 和该圈子已有的标准商品列表做语义相似度比对，生成一个匹配建议（"这可能是你之前买过的 XX"或"看起来是新商品"）；用户在 03 号 ticket 已有的预览确认流程里直接确认/改这个建议，不额外增加操作步骤。
**Execution**: as the AI recognizes a receipt (or immediately after), it compares the newly recognized `raw_name_en` against the circle's existing list of standardized products via semantic similarity, producing a suggested match ("this might be the XX you bought before" or "this looks like a new product"); the user confirms or changes this suggestion right within the preview/confirm flow already established in ticket 03, with no extra steps added.

**条码**：不处理。用户在新西兰，新西兰超市小票通常也不打印条码，不需要为此预留字段。
**Barcodes**: not handled. The user is in New Zealand, and New Zealand supermarket receipts typically don't print barcodes either, so no field needs to be reserved for this.

**规格变化**：算同一商品，规格是每次购买记录（ReceiptItem）里的一个属性，不影响商品匹配判定；同一个标准商品下，不同购买记录的 `unit_spec_value`/`unit_spec_unit` 可以不一样，这正好是 06 号「涨幅计算」ticket 做隐性涨价识别的数据基础。
**Spec changes**: still counts as the same product — spec is just an attribute of each purchase record (ReceiptItem) and doesn't affect the product-matching decision; different purchase records under the same standardized product can have different `unit_spec_value`/`unit_spec_unit` values, which is exactly the data foundation ticket 06 (price-change calculation) needs for hidden price-hike detection.

**数据结构新增：Product（标准商品，圈子内维度）**
**New data structure: Product (standardized product, scoped per circle)**

- `id`、`circle_id`（标准商品是圈子内的概念，不同圈子互不影响）。
  `id`, `circle_id` (a standardized product is a per-circle concept; different circles don't affect each other).
- `canonical_name_en` / `canonical_name_zh`（用户确认后的标准商品名，中英双语，遵循 09 号 ticket 的双语字段设计）。
  `canonical_name_en` / `canonical_name_zh` (the standardized product name once confirmed by the user, bilingual, following the bilingual field design from ticket 09).
- `category`（分类，04 号 ticket）。
  `category` (category, per ticket 04).
- `created_at`
- `low_stock_alert_active`（布尔，见 11 号 ticket，标记该商品当前是否处于"已发过低库存提醒、尚未回升"的状态，避免同一次库存紧张被每天重复提醒）。
  `low_stock_alert_active` (boolean, see ticket 11; flags whether this product is currently in an "already alerted, hasn't recovered yet" state, preventing the same low-stock episode from triggering a repeat reminder every day).

**ReceiptItem 新增字段**：`product_id`，关联到上面的 Product；`raw_name_en`/`raw_name_zh` 仍然保留，作为"这次识别到的原始文本"，`product_id` 才是"这行记录被认定属于哪个标准商品"。后续 06 号（涨幅计算）、07 号（消耗速度）都按 `product_id` 分组统计，而不是按文本名。
**New field on ReceiptItem**: `product_id`, linking to the Product above; `raw_name_en`/`raw_name_zh` are still kept as "the raw text recognized this time," while `product_id` is "which standardized product this line item is judged to belong to." Ticket 06 (price-change calculation) and ticket 07 (consumption-rate calculation) will both group and aggregate by `product_id`, not by text name.

**衍生更新（供 04 号 category-taxonomy ticket 参考）**：分类记忆机制的 key 应该从 `raw_name` 迁移到 `product_id`，因为 `product_id` 才是稳定的标准商品标识；同一个标准商品下不同措辞的 `raw_name_en`（如上面 Anchor 牛奶的两种写法）都会归到同一个 `product_id`，分类记忆自然也就统一了，不用再依赖文本匹配。
**Follow-up update (for reference by ticket 04, category-taxonomy)**: the category-memory mechanism's key should migrate from `raw_name` to `product_id`, since `product_id` is the stable standardized-product identifier; different wordings of `raw_name_en` under the same standardized product (like the two Anchor milk examples above) will all resolve to the same `product_id`, so category memory is naturally unified without depending on text matching anymore.
