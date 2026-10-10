Type: research
Status: resolved
GitHub: #27

## Question

What store-identifying information do New Zealand supermarket receipts actually print, and how consistently?

Before deciding how a Store's chain and branch get extracted (ticket 24) and confirmed (ticket 25), we need the facts:

- For Woolworths/Countdown, New World, PAK'nSAVE, and The Warehouse, what appears in the receipt header — chain name only, chain + suburb, a street address, a numeric store code, or some combination?
- Is the branch expressed as a suburb ("Hornby"), a mall/precinct name ("Northlands"), or something else?
- Do any of them print a stable store number that would be a better identity than the printed name?
- What do the existing fixtures in this repo already show? `api/_lib/recognizeReceipt.test.ts` and any stored sample receipts are primary evidence for this user's own receipts specifically.
- How much does the header wording vary between a checkout receipt, a self-checkout receipt, and an online-order invoice from the same chain?

The answer feeds directly into whether "chain + branch as two text fields" is enough, or whether the branch needs a normalization/matching step to survive OCR variance.

## Answer

Full findings, with a confidence label on every claim and all sources cited: `.scratch/grocery-receipt-tracker/research/nz-receipt-store-headers.md` (on `main`).

**"Chain + branch as two AI-extracted text fields" is not sufficient on its own.** The branch needs a normalization step plus the human confirmation step ticket 25 already proposes — this research says that confirmation is load-bearing, not a nicety.

What the repo itself shows (all verified in code):

- `recognizeReceipt.ts` asks only for a "store name" and its schema has exactly two `string` fields, `store_name_en` / `store_name_zh`, with `additionalProperties: false` — the model has nowhere to put a branch or store code even if it reads one. Storage matches: `receipts.store_name_en/_zh`, no `stores` table.
- Two features already do exact matching on that free text: `storeComparison.ts` keys a `Map` on the raw `storeNameEn`, and `duplicateCheck.ts` does `.eq("store_name_en", ...)`. Drift splits one store into two in comparison, and silently switches duplicate detection off.
- The fixtures already disagree with themselves: `"Countdown"` vs `"Countdown Newmarket"`, and `"Pak'nSave"` vs the official `PAK'nSAVE`. There are **no stored receipt images or OCR dumps** in the repo, so every fixture string is hand-written — evidence of what the code assumes, not of what receipts print.

What the chains' own public directories show (all verified):

- **The chain name is unstable over time.** Countdown → Woolworths finished only in December 2025, so one physical branch spans two printed chain names in any multi-year history.
- **The branch has no single form**, within a single chain: suburb, street (`Lincoln Road`, `Mill Street`), mall (`Sylvia Park`), format prefix (`Metro Queen Street`), and suburb+street compounds (`Alderman Drive Henderson`). The Warehouse openly disambiguates same-suburb stores — `Henderson Lincoln Rd` vs `Henderson West City`, `Linwood - Eastgate` — with inconsistent abbreviation (`Rd` vs `Road`) and separators.
- **Word order is unsettled**: Woolworths' own pages say "Church Corner Woolworths", our fixture says "Countdown Newmarket".
- **Macronised Māori place names** (`Māngere`, `Whangārei`, `Taupō`) will very likely print de-macronised on a thermal printer.

On store numbers: Woolworths NZ does have a public 4-digit store id (9176 Church Corner, 9038 Lincoln Road, visible in store-finder URLs) — but PAK'nSAVE, New World and The Warehouse publish none, and whether any number reaches the printed receipt is unconfirmed (likely for Woolworths via the Listens survey code, uncertain elsewhere). **A store number is not a viable primary key** — treat it as an optional strengthening signal only. Foodstuffs stores are individually owner-operated, so their receipts likely carry a per-store operating-company name and GST number (likely, not verified); that also gives OCR two competing candidates for "store name".

Left unanswered by public sources: how the header differs between staffed checkout, self-checkout, and an online-order invoice. Online orders may carry **no branch at all**. Settling this needs real receipt photos — see the research doc's "What would settle the open questions".

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

新西兰超市小票上实际印了哪些能标识门店的信息，稳定程度如何？

在决定 Store 的连锁品牌和分店如何被提取（ticket 24）、如何被确认（ticket 25）之前，需要先把事实弄清楚：

- Woolworths/Countdown、New World、PAK'nSAVE、The Warehouse 的小票抬头分别印了什么——只有连锁品牌名，还是品牌 + 区名，还是街道地址，还是门店编号，或者几样都有？
- 分店是用区名（"Hornby"）、商场/片区名（"Northlands"）还是别的方式表达的？
- 有没有哪家印了稳定的门店编号——那会是比印出来的名字更好的身份标识。
- 本仓库已有的 fixture 显示了什么？`api/_lib/recognizeReceipt.test.ts` 以及已保存的样例小票，是关于**这位用户自己的小票**最直接的证据。
- 同一连锁的人工收银小票、自助收银小票、线上订单发票，抬头措辞差异有多大？

答案直接决定"连锁 + 分店两个文本字段"是否够用，还是分店需要一层归一化/匹配才能扛住 OCR 的措辞漂移。

## 答案

完整结论（每条都标了置信度、来源齐全）见 `.scratch/grocery-receipt-tracker/research/nz-receipt-store-headers.md`（已在 `main` 上）。

**"连锁 + 分店两个 AI 提取的文本字段"单靠自己不够。** 分店需要一层归一化，再加上 ticket 25 已经提出的人工确认步骤——本研究的结论是：那个确认步骤是**承重**的，不是锦上添花。

仓库自身显示的（均已在代码中核实）：

- `recognizeReceipt.ts` 只要一个 "store name"，其 schema 正好两个 `string` 字段 `store_name_en` / `store_name_zh`，且 `additionalProperties: false`——即使模型在照片上读到了分店或门店编号，也无处可放。存储与之对应：`receipts.store_name_en/_zh`，没有 `stores` 表。
- 已经有两处功能在对这段自由文本做精确匹配：`storeComparison.ts` 用原样 `storeNameEn` 做 `Map` 的 key，`duplicateCheck.ts` 用 `.eq("store_name_en", ...)`。字符串一漂移，比价里一家店被拆成两家，重复检测则被静默关掉。
- fixture 自己就已经互相矛盾：`"Countdown"` vs `"Countdown Newmarket"`，`"Pak'nSave"` vs 官方 `PAK'nSAVE`。仓库里**没有任何保存的小票图片或 OCR 文本**，所以每个 fixture 字符串都是手写的——它们是"代码假设了什么"的证据，不是"小票印了什么"的证据。

各连锁自家公开目录显示的（均已核实）：

- **连锁名随时间不稳定。** Countdown → Woolworths 直到 2025 年 12 月才全部完成，所以在任何多年历史里，同一家实体分店都会横跨两个印刷连锁名。
- **分店没有统一形态**，而且是在同一连锁内部：区名、街道（`Lincoln Road`、`Mill Street`）、商场（`Sylvia Park`）、业态前缀（`Metro Queen Street`）、区名+街道复合（`Alderman Drive Henderson`）。The Warehouse 更是公然用消歧词区分同区门店——`Henderson Lincoln Rd` vs `Henderson West City`、`Linwood - Eastgate`——且缩写（`Rd` vs `Road`）和分隔符都不一致。
- **词序也没定**：Woolworths 自家页面写 "Church Corner Woolworths"，我们的 fixture 写 "Countdown Newmarket"。
- **带长音符的毛利语地名**（`Māngere`、`Whangārei`、`Taupō`）在热敏打印机上极可能印成去长音符的形式。

关于门店编号：Woolworths NZ 确实有公开的四位数门店 id（Church Corner 9176、Lincoln Road 9038，可在 store-finder 的 URL 里看到）——但 PAK'nSAVE、New World、The Warehouse 都不公开，且是否有任何编号会印到小票上均未确认（Woolworths 经由 Listens 问卷代码推断为"大概率"，其余"不确定"）。**门店编号不能当主键**——只应作为可选的增强信号。Foodstuffs 门店都是业主独立自营，所以其小票很可能带有逐店的经营公司名和 GST 号（大概率，未核实）；这也给 OCR 提供了两个互相竞争的"门店名"候选。

公开来源未能回答的：人工收银、自助收银、线上订单发票之间抬头差异有多大。线上订单可能**根本没有分店**。要落实这一点需要真实小票照片——见研究文档的"要把未决问题落实，该做什么"一节。
