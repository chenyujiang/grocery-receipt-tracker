Type: grilling
Status: resolved

## Question

商品的分类体系怎么设计？
How should the product category taxonomy be designed?

需要决定：
Needs deciding:

- 预设几级分类（例如"食品-粮油/食品-生鲜/日用品-清洁/日用品-个护"这类两级结构，还是更简单的一级分类）。
  How many levels the preset taxonomy has (e.g. a two-level structure like "Food-Grains&Oil / Food-Fresh Produce / Household-Cleaning / Household-Personal Care," or a simpler single level).
- 由谁维护这套分类目录（系统固定预设，还是允许家庭自定义新增类目）。
  Who maintains this category list (a system-fixed preset, or does each circle get to add its own custom categories).
- AI 自动分类的粒度和判断依据（基于商品名称语义）。
  The granularity and basis for AI auto-categorization (based on the semantics of the product name).
- 用户能否手动修正 AI 分类结果，修正后是否影响未来同名商品的自动分类（即是否需要"记忆"机制）。
  Whether users can manually correct the AI's categorization, and whether that correction affects future auto-categorization of the same product name (i.e. whether a "memory" mechanism is needed).

产出应为分类目录的初始结构和自动分类的基本规则。
The output should be the category list's initial structure and the basic rules for auto-categorization.

## Answer

- **层级**：两级（大类 + 子类）。
  **Levels**: two (top-level category + subcategory).
- **目录来源**：系统固定预设，所有圈子共用，不支持圈子自定义新增。
  **Source of the list**: a system-fixed preset shared by all circles; circles cannot add their own custom categories.
- **AI 分类范围**：只能从预设列表里选最匹配的一个子类，不允许自己生成新类目。
  **Scope of AI categorization**: it can only pick the best-matching subcategory from the preset list, and is never allowed to invent a new category.
- **分类记忆机制**：用户手动改过某个商品的分类后，记住这次修正，同名商品下次再出现时自动套用改过的分类，不用每次都手动改。
  **Category-memory mechanism**: once a user manually corrects a product's category, that correction is remembered; the same product name is auto-assigned the corrected category the next time it appears, so it doesn't need to be corrected by hand every time.

**初始分类目录（大类 - 子类，后续开发时可以微调具体子类，不需要重开这张 ticket）：**
**Initial category list (top-level - subcategory; the exact subcategories can be fine-tuned later during development without reopening this ticket):**

- 食品-粮油调味 / Food - Grains & Oil（大米/杂粮、食用油、面粉/干货、调味品/酱料）。
  Food - Grains & Oil / 食品-粮油调味 (rice/grains, cooking oil, flour/dry goods, seasonings/sauces).
- 食品-生鲜 / Food - Fresh Produce（肉禽蛋、蔬菜水果、水产）。
  Food - Fresh Produce / 食品-生鲜 (meat/poultry/eggs, fruits & vegetables, seafood).
- 食品-乳制品烘焙 / Food - Dairy & Bakery（牛奶/乳制品、面包/烘焙）。
  Food - Dairy & Bakery / 食品-乳制品烘焙 (milk/dairy, bread/baked goods).
- 食品-零食饮料 / Food - Snacks & Beverages（零食、饮料、酒水）。
  Food - Snacks & Beverages / 食品-零食饮料 (snacks, drinks, alcohol).
- 日用品-清洁洗护 / Household - Cleaning（洗衣液、清洁剂、纸巾）。
  Household - Cleaning / 日用品-清洁洗护 (laundry detergent, cleaning products, tissues).
- 日用品-个人护理 / Household - Personal Care（洗护用品、化妆品）。
  Household - Personal Care / 日用品-个人护理 (toiletries, cosmetics).
- 母婴用品 / Baby & Maternity。
  Baby & Maternity / 母婴用品.
- 宠物用品 / Pet Supplies。
  Pet Supplies / 宠物用品.
- 其他/未分类 / Other / Uncategorized（AI 无法归类或识别不到商品名时的兜底类目）。
  Other / Uncategorized / 其他/未分类 (the fallback category when AI can't classify or can't recognize the product name).

**追加更新（来自 09 号 bilingual-content-strategy ticket）**：分类目录本身固定预设、中英对照已经如上列出；界面上显示的分类标签直接用这份中英对照表，不需要额外翻译流程。
**Follow-up update (from ticket 09, bilingual-content-strategy)**: the category list itself is a fixed preset, and the Chinese/English pairing is already listed above; the category labels shown in the UI use this bilingual table directly, with no extra translation step needed.

**已按 05 号「商品匹配策略」ticket 更新**：05 号 ticket 已经定下"标准化商品"（Product 表，`product_id`）的判定规则，分类记忆机制的 key 从 `raw_name` 迁移为 `product_id`——同一个标准商品下不同措辞的原始文本都会归到同一个 `product_id`，分类记忆自然统一，不再依赖文本匹配。
**Updated per ticket 05 ("product matching strategy")**: ticket 05 has now settled the rules for identifying a "standardized product" (the Product table, `product_id`), so the category-memory mechanism's key has migrated from `raw_name` to `product_id` — different wordings of the raw text under the same standardized product all resolve to the same `product_id`, so category memory is naturally unified and no longer depends on text matching.
