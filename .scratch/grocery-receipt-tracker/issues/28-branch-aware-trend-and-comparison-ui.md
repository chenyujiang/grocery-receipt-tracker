Type: prototype
Status: resolved
GitHub: #32
Blocked by: 24, 27

## Question

What do the price trend chart and the store comparison module look like once a branch, not a chain, is the unit?

Settled in charting: the trend chart draws **one line per branch** rather than mixing every Store's prices into a single line, and the store comparison module lists **branches** rather than chains — "different suburbs charge different prices" is exactly what makes that module worth reading.

This is a prototype ticket because the question is how it should look and feel, not what it should compute:

- A Product bought at four branches gives four lines on one chart, most of them one or two points long. Does that read as information or as noise? Is there a point at which sparse branches get folded away behind a toggle?
- How are the branches labelled in a legend that has to work in both languages and fit a phone screen — "Woolworths Hornby" is long, and four of them will not fit.
- Colour: `src/index.css`'s `:root` tokens carry `--primary`/`--danger` and little else. A multi-series chart needs a series palette that survives the `prefers-color-scheme: dark` override. Adding tokens is in scope.
- The comparison module sits on the product detail page next to the trend chart (ticket 13). Two branch-keyed views side by side may now be redundant — does one absorb the other?
- Where the branch shows up elsewhere: the receipt list, the receipt detail page, the monthly report's leaderboard rows.

Link the prototype as an asset on this ticket; keep it throwaway.

## Answer

Answered by [spec 29](29-branch-level-store-identity.md) (its **[assumption → 28]** decision and the Presentation section), implemented in PR #43.

- **Trend chart**: one line per Store, with series colours from design tokens (light and dark); a Store with a single purchase, or a product bought only once, is a lone point.
- **Legend**: the branch name, falling back to the chain when the branch is unknown; when two Stores on one chart would read the same, both use the full chain-and-branch name.
- **Store comparison**: keyed by Store; it sits beside the trend chart, not merged into it.
- **Where branch shows**: receipt list (whose search also matches Store names), receipt detail, leaderboard rows, and the CSV export (new `chain_name_*`/`branch_name_*` columns; the printed-header columns keep their names).
- A Purchase without a Store is left out of the chart and the comparison.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

当计量单位从"连锁"变成"分店"之后，价格趋势图和多店比价模块该长什么样？

绘制地图时已定：趋势图**按分店画成多条线**，而不是把所有门店的价格混进一条线；比价模块按**分店**列而不是按连锁列——"不同区售价不同"恰恰是这个模块值得一看的原因。

这是一张 prototype ticket，因为问题是"它该长什么样、用起来什么感觉"，而不是"它该算什么"：

- 一个在四家分店买过的 Product 会在一张图上产生四条线，其中多数只有一两个点。这读起来是信息还是噪音？到了某个程度，是不是该把点数太少的分店折叠到一个开关后面？
- 图例里的分店怎么标注——既要中英文都成立，又要塞进手机屏幕；"Woolworths Hornby" 本身就很长，四条放不下。
- 配色：`src/index.css` 的 `:root` 里目前只有 `--primary`/`--danger` 之类，多序列折线图需要一套能在 `prefers-color-scheme: dark` 覆盖下依然成立的序列色板。新增 token 属于本 ticket 范围。
- 比价模块就放在商品详情页、紧挨着趋势图（ticket 13）。两个都按分店切分的视图并排出现，可能已经重复了——要不要其中一个吸收另一个？
- 分店还应该出现在哪些地方：小票列表、小票详情页、月报排行榜的行里。

把原型作为资产链接在本 ticket 上；保持一次性、可丢弃。

## 答案

由 [spec 29](29-branch-level-store-identity.md) 回答（其中标为 **[assumption → 28]** 的决定以及"展示"一节），已在 PR #43 实现。

- **趋势图**：每个 Store 一条线，系列颜色来自设计 token（亮色和暗色各一套）；只有一次购买的 Store，或只买过一次的商品，画成一个孤立点。
- **图例**：用分店名，分店未知时退回连锁名；同一张图上两个 Store 标签相同时，两者都用"连锁 + 分店"的全名。
- **门店比价**：按 Store 分组；放在趋势图旁边，不合并进去。
- **分店显示位置**：小票列表（搜索也匹配 Store 名称）、小票详情、涨幅榜各行、CSV 导出（新增 `chain_name_*`/`branch_name_*` 列；原来的小票店名列保留原名）。
- 没有 Store 的 Purchase 不出现在趋势图和比价里。
