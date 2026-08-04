Type: grilling
Status: resolved

## Question

调用多模态大模型识别小票后，具体要提取哪些结构化字段，以及识别置信度低或出错时怎么处理？

至少需要覆盖：

- 店铺名称、购买日期。
- 每个商品的名称、数量、规格/单位（如 500g、1L、1 个）、单价、小计。
- 小票总价、是否有优惠/折扣行。

还需要决定：

- 识别失败或用户认为有误时，是否提供手动修正界面；修正后的数据如何覆盖原 AI 识别结果、是否保留修改记录。
- 原始小票照片是否保留、保留多久。

产出应为该应用的标准化商品记录数据结构（字段、类型、是否必填）。

## Answer

**流程**：拍照上传 → AI 识别产出草稿（status = pending_review）→ 用户在预览页逐条确认/修正 → 确认后 status = confirmed，正式计入统计；不单独设"识别置信度低"标记，统一靠预览确认这一步兜底。期间任何编辑都写入修改历史。

**拍照上传的实现方式（追加讨论）**：网页版用标准的 `<input type="file" accept="image/*" capture="environment">` 文件选择控件即可，手机浏览器（iOS Safari / Android Chrome）会自动弹出系统菜单，同时提供"拍照"和"从相册选择"两个入口，不需要用 `getUserMedia` 自己搭一套相机取景 UI，开发量更小、兼容性也更好。

**Receipt（小票）**

- `id`
- `circle_id`（属于哪个圈子，见 02 号 ticket）。
- `uploaded_by`（登录邮箱，即"谁传的"，见 02 号 ticket 的购买人字段决定）。
- `store_name_zh` / `store_name_en`（店铺名称，中英双语，见 09 号 ticket；`store_name_en` 是 OCR 识别的英文原文，`store_name_zh` 是翻译版）。
- `purchase_date`（购买日期）。
- `total_amount`（小票总价）。
- `original_image_url`（原图地址，保留期过后清空，见下方"原图策略"）。
- `uploaded_at`
- `status`（pending_review / confirmed）。

**ReceiptItem（商品行）**

- `id`、`receipt_id`。
- `raw_name_zh` / `raw_name_en`（AI 识别出的商品名，中英双语，见 09 号 ticket；`raw_name_en` 是 OCR 识别的英文原文，`raw_name_zh` 是翻译版；05 号商品匹配 ticket 以 `raw_name_en` 为主要判断依据）。
- `quantity`（数量）。
- `unit_spec_value` + `unit_spec_unit`（规格拆成数值 + 单位两个字段，如 500 / g，方便后面做单位换算）。
- `unit_price`（实际成交单价）。
- `original_price`（原价，可为空；识别到划线价/优惠标识时才填）。
- `is_promotion`（布尔，是否促销价）。
- `subtotal`（小计）。
- ~~`category`（分类，04 号 ticket 细化）~~ ——**已被 05 号 ticket 的 Product 表取代**：分类唯一存在 `Product.category` 上，通过 `product_id` 读取，`ReceiptItem` 不再单独存这个字段（否则同一商品的分类会在多条记录里各存一份，修正时彼此不同步）。整理 spec.md 时发现并修正了这处矛盾。

**EditLog（修改历史）**

- `id`、关联的 `receipt_id`/`receipt_item_id`。
- `field_name`、`old_value`、`new_value`。
- `edited_by`（登录邮箱）、`edited_at`。

**原图策略**：图片存 Supabase Storage，默认保留 12 个月后自动清理（只清图片，结构化数据永久保留），保留时长后续可在设置里调整。

**追加更新（来自 09 号 bilingual-content-strategy ticket）**：`store_name`、`raw_name` 均需拆成 `_zh` / `_en` 两列。小票原文是英文（新西兰超市），所以 `_en` 才是 OCR 识别的原始真实文本，`_zh` 是同一次多模态大模型调用顺带翻译出的中文版本；用户修正**中文翻译**（`_zh` 字段）走上面的 EditLog 机制。
