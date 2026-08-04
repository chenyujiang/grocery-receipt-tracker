Type: grilling
Status: resolved
Blocked by: 03

## Question

应用需要支持中英双语。用户在新西兰，小票原文是英文（Countdown/New World/PAK'nSAVE 等新西兰超市），AI 识别出的英文是原始真实文本；这段英文需要自动翻译成中文并保存，切换语言时能看到对应版本；翻译不准时用户可以自己修正中文译文。哪些字段需要双语、什么时候翻译、怎么存，都需要定下来，并同步影响 03 号（数据结构）、04 号（分类目录）两张已解决的 ticket。
The app needs to support Chinese/English bilingual content. The user is based in New Zealand, so receipts are originally in English (from supermarkets like Countdown, New World, PAK'nSAVE); the English text the AI recognizes is the authentic source text. That English needs to be auto-translated into Chinese and saved, so the corresponding version shows up when the language is switched; if a translation is inaccurate, the user can correct the Chinese translation themselves. Which fields need to be bilingual, when translation happens, and how it's stored all need to be decided, with knock-on effects on the already-resolved tickets 03 (data schema) and 04 (category taxonomy).

需要覆盖：
Needs to cover:

- 双语范围是只针对动态数据内容，还是连界面固定文案也要双语。
  Whether the bilingual scope covers only dynamic data content, or also fixed UI chrome.
- 翻译发生的时机和执行方（是否复用已经决定的多模态大模型 OCR 调用）。
  When translation happens and who performs it (whether it reuses the already-decided multimodal-LLM OCR call).
- 数据库里双语字段的存储结构。
  The storage structure for bilingual fields in the database.
- 用户修正译文后怎么记录。
  How a user's correction to a translation is recorded.

## Answer

- **双语范围**：只针对用户输入/识别出的**动态数据内容**（商品名、店铺名、分类标签）。界面固定文案（菜单、按钮等 UI 文字）**只做英文**，不需要中英切换，不需要额外接 i18n 框架，工作量最小化。
  **Bilingual scope**: limited to **dynamic data content** the user enters or that gets recognized (product names, store names, category labels). Fixed UI chrome (menus, buttons, etc.) is **English-only** — no Chinese/English switch, no separate i18n framework needed, minimizing the work involved.
- **翻译方向与时机**：小票原文是英文（新西兰超市），AI 识别小票时（复用 03 号 ticket 已经定的多模态大模型 OCR 调用）在同一次调用里顺带把识别出的英文原文翻译成中文，不需要额外接翻译 API，成本和延迟最低。
  **Translation direction and timing**: receipt text is originally English (New Zealand supermarkets); when the AI recognizes the receipt (reusing the multimodal-LLM OCR call already decided in ticket 03), that same call also translates the recognized English text into Chinese, with no separate translation API needed, keeping cost and latency to a minimum.
- **存储结构**：双语字段拆成两列，如 `name_zh` / `name_en`，而不是塞进一个 JSON 字段。`name_en` 是 OCR 识别出的原始真实文本，`name_zh` 是 AI 翻译出的版本。
  **Storage structure**: bilingual fields are split into two columns, such as `name_zh` / `name_en`, rather than packed into a single JSON field. `name_en` is the authentic text as recognized by OCR; `name_zh` is the AI-translated version.
- **用户修正机制**：`name_en` 是原文，本身的识别错误走 03 号 ticket 已有的预览确认/EditLog 流程；如果用户发现**中文翻译**不准，可以手动改 `name_zh` 字段，修改同样记录进 03 号已经定义的 EditLog（记录字段名、旧值、新值、修改人、修改时间）。
  **User correction mechanism**: `name_en` is the source text, so OCR errors in it go through the review/EditLog flow already established in ticket 03; if a user finds the **Chinese translation** inaccurate, they can manually edit the `name_zh` field, and that change is likewise recorded in the EditLog defined in ticket 03 (field name, old value, new value, editor, timestamp).

**对已解决 ticket 的连带更新：**
**Knock-on updates to already-resolved tickets:**

1. **03 号数据结构**需要扩展：
   **Ticket 03 (data schema)** needs to be extended:
   - `Receipt.store_name` 拆成 `store_name_zh` / `store_name_en`，`store_name_en` 为 OCR 识别的原文。
     `Receipt.store_name` is split into `store_name_zh` / `store_name_en`, with `store_name_en` being the OCR-recognized source text.
   - `ReceiptItem.raw_name` 拆成 `raw_name_zh` / `raw_name_en`，`raw_name_en` 为 OCR 识别的原文。
     `ReceiptItem.raw_name` is split into `raw_name_zh` / `raw_name_en`, with `raw_name_en` being the OCR-recognized source text.
   - 这两组字段的修正都走 EditLog。
     Corrections to both field pairs go through EditLog.

2. **04 号分类目录**需要给已有的 9 个大类补上英文名（子类后续开发时再补），英文名才是这套分类目录的原始定义，中文是翻译：
   **Ticket 04 (category taxonomy)** needs English names added to the existing 9 top-level categories (subcategories to be added later during development); the English names are the taxonomy's original definition, with Chinese as the translation:
   - 食品-粮油调味 → Food - Grains & Oil
   - 食品-生鲜 → Food - Fresh Produce
   - 食品-乳制品烘焙 → Food - Dairy & Bakery
   - 食品-零食饮料 → Food - Snacks & Beverages
   - 日用品-清洁洗护 → Household - Cleaning
   - 日用品-个人护理 → Household - Personal Care
   - 母婴用品 → Baby & Maternity
   - 宠物用品 → Pet Supplies
   - 其他/未分类 → Other / Uncategorized

**给 05 号「商品匹配策略」ticket 的衔接提醒**：小票原文是英文，匹配逻辑应该以 `raw_name_en`（英文原文）为主要判断基准，`raw_name_zh` 只作翻译展示用，不参与匹配判定。
**A note for ticket 05 ("product matching strategy")**: receipt text is originally English, so the matching logic should be based primarily on `raw_name_en` (the English source text); `raw_name_zh` is a translation for display only and shouldn't factor into the matching decision.
