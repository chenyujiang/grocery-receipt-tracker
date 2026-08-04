Type: grilling
Status: resolved

## Question

调用多模态大模型识别小票后，具体要提取哪些结构化字段，以及识别置信度低或出错时怎么处理？
After calling a multimodal LLM to recognize a receipt, exactly which structured fields should be extracted, and how should low-confidence or incorrect recognition be handled?

至少需要覆盖：
Must cover at least:

- 店铺名称、购买日期。
  Store name, purchase date.
- 每个商品的名称、数量、规格/单位（如 500g、1L、1 个）、单价、小计。
  Each product's name, quantity, spec/unit (e.g. 500g, 1L, 1 piece), unit price, and subtotal.
- 小票总价、是否有优惠/折扣行。
  The receipt's total amount, and whether there are any discount/promotion lines.

还需要决定：
Also needs deciding:

- 识别失败或用户认为有误时，是否提供手动修正界面；修正后的数据如何覆盖原 AI 识别结果、是否保留修改记录。
  Whether a manual-correction interface is provided when recognition fails or the user thinks it's wrong; how corrected data overrides the original AI output, and whether a change history is kept.
- 原始小票照片是否保留、保留多久。
  Whether the original receipt photo is kept, and for how long.

产出应为该应用的标准化商品记录数据结构（字段、类型、是否必填）。
The output should be the app's standardized product-record data structure (fields, types, required or optional).

## Answer

**流程**：拍照上传 → AI 识别产出草稿（status = pending_review）→ 用户在预览页逐条确认/修正 → 确认后 status = confirmed，正式计入统计；不单独设"识别置信度低"标记，统一靠预览确认这一步兜底。期间任何编辑都写入修改历史。
**Flow**: photo upload → AI produces a draft (status = pending_review) → the user reviews and corrects each line on a preview screen → once confirmed, status = confirmed and it counts toward statistics; there's no separate "low confidence" flag — the review step is the safety net for everything. Any edit made along the way is written to the change history.

**拍照上传的实现方式（追加讨论）**：网页版用标准的 `<input type="file" accept="image/*" capture="environment">` 文件选择控件即可，手机浏览器（iOS Safari / Android Chrome）会自动弹出系统菜单，同时提供"拍照"和"从相册选择"两个入口，不需要用 `getUserMedia` 自己搭一套相机取景 UI，开发量更小、兼容性也更好。
**How photo upload is implemented (added later)**: the web version can just use the standard `<input type="file" accept="image/*" capture="environment">` file-picker control; mobile browsers (iOS Safari / Android Chrome) automatically pop up a system menu offering both "take photo" and "choose from library," so there's no need to build a custom camera viewfinder UI with `getUserMedia` — less development effort and better compatibility.

**Receipt（小票）**
**Receipt**

- `id`
- `circle_id`（属于哪个圈子，见 02 号 ticket）。
  `circle_id` (which circle it belongs to, see ticket 02).
- `uploaded_by`（登录邮箱，即"谁传的"，见 02 号 ticket 的购买人字段决定）。
  `uploaded_by` (the login email, i.e. "who uploaded it," per the buyer-field decision in ticket 02).
- `store_name_zh` / `store_name_en`（店铺名称，中英双语，见 09 号 ticket；`store_name_en` 是 OCR 识别的英文原文，`store_name_zh` 是翻译版）。
  `store_name_zh` / `store_name_en` (store name, bilingual, see ticket 09; `store_name_en` is the OCR-recognized English source text, `store_name_zh` is the translated version).
- `purchase_date`（购买日期）。
  `purchase_date` (purchase date).
- `total_amount`（小票总价）。
  `total_amount` (the receipt's total amount).
- `original_image_url`（原图地址，保留期过后清空，见下方"原图策略"）。
  `original_image_url` (the original image's address, cleared after the retention period — see "Original photo policy" below).
- `uploaded_at`
- `status`（pending_review / confirmed）。
  `status` (pending_review / confirmed).

**ReceiptItem（商品行）**
**ReceiptItem**

- `id`、`receipt_id`。
  `id`, `receipt_id`.
- `raw_name_zh` / `raw_name_en`（AI 识别出的商品名，中英双语，见 09 号 ticket；`raw_name_en` 是 OCR 识别的英文原文，`raw_name_zh` 是翻译版；05 号商品匹配 ticket 以 `raw_name_en` 为主要判断依据）。
  `raw_name_zh` / `raw_name_en` (the AI-recognized product name, bilingual, see ticket 09; `raw_name_en` is the OCR-recognized English source text, `raw_name_zh` is the translated version; ticket 05's product-matching decision is based primarily on `raw_name_en`).
- `quantity`（数量）。
  `quantity` (quantity).
- `unit_spec_value` + `unit_spec_unit`（规格拆成数值 + 单位两个字段，如 500 / g，方便后面做单位换算）。
  `unit_spec_value` + `unit_spec_unit` (the spec split into a numeric value and a unit, e.g. 500 / g, to make later unit conversion easier).
- `unit_price`（实际成交单价）。
  `unit_price` (the actual transacted unit price).
- `original_price`（原价，可为空；识别到划线价/优惠标识时才填）。
  `original_price` (the original price, nullable; only filled when a struck-through price or promotion marker is recognized).
- `is_promotion`（布尔，是否促销价）。
  `is_promotion` (boolean, whether it's a promotional price).
- `subtotal`（小计）。
  `subtotal` (line subtotal).
- ~~`category`（分类，04 号 ticket 细化）~~ ——**已被 05 号 ticket 的 Product 表取代**：分类唯一存在 `Product.category` 上，通过 `product_id` 读取，`ReceiptItem` 不再单独存这个字段（否则同一商品的分类会在多条记录里各存一份，修正时彼此不同步）。整理 spec.md 时发现并修正了这处矛盾。
  ~~`category` (category, detailed in ticket 04)~~ — **superseded by ticket 05's `Product` table**: category is stored solely on `Product.category` and read via `product_id`; `ReceiptItem` no longer keeps its own copy of this field (otherwise the same product's category would be duplicated across records and drift out of sync when corrected). This inconsistency was caught and fixed while assembling spec.md.

**EditLog（修改历史）**
**EditLog**

- `id`、关联的 `receipt_id`/`receipt_item_id`。
  `id`, the associated `receipt_id`/`receipt_item_id`.
- `field_name`、`old_value`、`new_value`。
  `field_name`, `old_value`, `new_value`.
- `edited_by`（登录邮箱）、`edited_at`。
  `edited_by` (login email), `edited_at`.

**原图策略**：图片存 Supabase Storage，默认保留 12 个月后自动清理（只清图片，结构化数据永久保留），保留时长后续可在设置里调整。
**Original photo policy**: images are stored in Supabase Storage and auto-cleaned after 12 months by default (only the images are cleared; structured data is kept forever); the retention period can be adjusted later in settings.

**追加更新（来自 09 号 bilingual-content-strategy ticket）**：`store_name`、`raw_name` 均需拆成 `_zh` / `_en` 两列。小票原文是英文（新西兰超市），所以 `_en` 才是 OCR 识别的原始真实文本，`_zh` 是同一次多模态大模型调用顺带翻译出的中文版本；用户修正**中文翻译**（`_zh` 字段）走上面的 EditLog 机制。
**Follow-up update (from ticket 09, bilingual-content-strategy)**: both `store_name` and `raw_name` are split into `_zh` / `_en` columns. Since receipts are originally in English (New Zealand supermarkets), it's the `_en` value that is the authentic OCR source text, while `_zh` is the Chinese translation produced by that same multimodal-LLM call; user corrections to the **Chinese translation** (the `_zh` field) go through the same EditLog mechanism described above.
