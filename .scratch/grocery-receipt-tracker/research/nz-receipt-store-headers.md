# Research: what NZ supermarket receipts print to identify a store

Ticket: `.scratch/grocery-receipt-tracker/issues/23-nz-receipt-store-header-facts.md`
Date: 2026-09-14
Branch: `research/nz-receipt-store-headers` (throwaway — this file is the deliverable)

Confidence is labelled per claim: **[verified]** (read directly from a primary
source or from this repo's own code), **[likely]** (consistent secondary
sources, no primary confirmation), **[uncertain]** (inference — do not build on
it without checking a real receipt).

---

## 1. What this repo already knows (primary — this user's own receipts)

### 1.1 The AI is only ever asked for one store string

`api/_lib/recognizeReceipt.ts` **[verified]**:

- The prompt says `"Extract the store name, purchase date, total amount, and
  each line item."` and `"Translate the store name ... into Chinese."` There is
  **no** instruction about a branch, a suburb, an address, or a store number.
- `RECEIPT_SCHEMA` has exactly two store fields, `store_name_en` and
  `store_name_zh`, both plain `type: "string"`. `additionalProperties: false`,
  so the model *cannot* return a branch or store code even if it reads one off
  the photo — anything it sees beyond the chain name either gets folded into
  `store_name_en` or is discarded.
- Validation covers `purchase_date` and `items.length` only. A store name of
  `""` or `"Supermarket"` passes.

So today's pipeline has **no store-identity signal at all** beyond one free-text
line, and no evidence is being captured about what the header actually said.

### 1.2 Storage is two nullable text columns, with no store table

- `supabase/migrations/20260804000001_create_core_tables.sql`: `receipts` has
  `store_name_en text not null`, `store_name_zh text` **[verified]**. No
  `stores` table anywhere in `supabase/migrations/` **[verified]**.
- `spec.md` §11 and `src/lib/storeComparison.ts`'s own comment say it outright:
  *"Stores are identified by their English name (there's no separate stores
  table)"* **[verified]**.

### 1.3 Two features already do exact string matching on that free text

Both are the failure sites if the string drifts:

- `src/lib/storeComparison.ts` — `latestByStore` is a
  `Map<string, StoreComparisonRecord>` keyed on `record.storeNameEn`, raw. No
  trim, no case-fold, no normalization **[verified]**. `"Countdown Hornby"` and
  `"Woolworths Hornby"` become two competing stores in the comparison for the
  same physical shop.
- `src/lib/duplicateCheck.ts` — `.eq("store_name_en", params.storeNameEn)`, an
  exact SQL equality as one third of the duplicate key (store + date + total)
  **[verified]**. Any drift in the string silently *disables* duplicate
  detection rather than producing a wrong match, so this fails quietly.

### 1.4 The fixtures show the variance already exists in this repo's own head

Store strings currently used across the test suite **[verified]**, gathered from
`api/**` and `src/**`:

| String | Where |
| --- | --- |
| `"Countdown"` / `"倒数超市"` | most fixtures |
| `"Countdown Newmarket"` / `"倒数超市 Newmarket 店"` | `api/_lib/recognizeReceipt.test.ts` |
| `"Pak'nSave"` / `"帕克超市"` | store-comparison fixtures |
| `"Four Square"` / `null` | `src/lib/bilingual.test.ts` (zh absent) |
| `"城内城外"` | bilingual fixture |

Three things fall out of that table, all of them evidence rather than guesswork:

1. The same chain appears **both bare and branch-qualified** (`"Countdown"` vs
   `"Countdown Newmarket"`) in fixtures written by this project. Whatever the
   model decides to include is currently a coin flip, because the prompt asks
   for a "store name" without defining it.
2. `"Pak'nSave"` is *not* the chain's own orthography — official is
   **`PAK'nSAVE`** **[verified]**, see §2.2. Casing already varies.
3. `store_name_zh` is nullable and the fixtures exercise `null`, so the Chinese
   side can never be the identity key.

### 1.5 No image fixtures exist

There are no stored sample receipt images or OCR text dumps anywhere in the repo
(`find` over the tree for `*fixture*`, `*sample*`, `*.jpg`, `*.png` returns only
`.git` hook samples) **[verified]**. **All fixture store strings above are
hand-written by this project, not transcribed from a real receipt.** They are
evidence of what the code *assumes*, not of what NZ receipts *print*. The only
way to close that gap is to photograph a few real receipts — see §4.

---

## 2. External evidence: how NZ chains name their branches

### 2.1 Woolworths NZ (ex-Countdown)

- **The chain name on the receipt changed under our feet.** The Countdown →
  Woolworths rebrand was announced July 2023; the first store reopened as
  Woolworths in Bethlehem, Tauranga on 17 August 2023; **Countdown Botany was
  the last to convert, in December 2025** — i.e. the whole fleet took ~2.5 years
  and only finished a few months before this research **[verified]**, per
  [Wikipedia: Woolworths (New Zealand supermarket chain)](https://en.wikipedia.org/wiki/Woolworths_(New_Zealand_supermarket_chain)).
  Consequence for us: a user's own receipt history for **one physical branch**
  spans two different printed chain names, and a 2024 receipt photographed today
  will still say "Countdown". This is not hypothetical drift; it is guaranteed
  drift in any multi-year history.
- **Branch naming puts the branch word *first*.** Woolworths NZ's own
  store-finder pages are titled e.g. **"Church Corner Woolworths"** and
  **"Lincoln Road Woolworths"**, not "Woolworths Church Corner"
  **[verified]** —
  [Church Corner](https://www.woolworths.co.nz/store-finder/9176/riccarton-christchurch/church-corner-woolworths),
  [Lincoln Road](https://www.woolworths.co.nz/store-finder/9038/henderson/lincoln-road-woolworths).
  So even the chain's own word order is the opposite of the `"Countdown
  Newmarket"` shape our fixture assumes.
- **There is a numeric store id, and it is public.** Those same URLs embed
  **9176** (Church Corner, Riccarton) and **9038** (Lincoln Road, Henderson) —
  a 4-digit id, with a separate suburb slug (`riccarton-christchurch`,
  `henderson`) alongside the branch slug **[verified]**. Note the branch name
  ("Church Corner") and the suburb ("Riccarton") are *different words* for the
  same store, which is exactly the ambiguity a text field can't resolve.
- **Is that number printed on the receipt?** The "Countdown Listens" survey
  T&Cs confirm only that a purchase receipt carries "entry details"
  ([official T&Cs](https://www.woolworths.co.nz/info/terms-and-conditions/countdown-listens-survey))
  **[verified]**; they do not say what those details are. Third-party
  walkthroughs of that survey state the code at the **bottom** of the receipt is
  two numbers, a **store code** and a **transaction number** **[likely]**. I
  could not confirm the store code's position or format against a primary
  source, and the store-finder id (9176) being the same number as a printed
  store code is **[uncertain]**. The survey site itself is JS-rendered and
  couldn't be read.
- The store finder page is a client-rendered SPA; a plain fetch of
  `/store-finder/search` returns no store data, so there is no easy public
  chain-name → store-number table to normalize against **[verified]**.

### 2.2 PAK'nSAVE

Fetched [PAK'nSAVE Store Finder](https://www.paknsave.co.nz/store-finder)
directly **[verified]**. No store numbers are shown anywhere in the directory.
Branch names are emphatically **not** uniformly suburbs:

- suburb — Albany, Botany, Clendon, Glen Innes, Highland Park, Royal Oak,
  Hornby, Papanui, Riccarton, Wainoni
- **street** — **Lincoln Road**, **Wairau Road**, **Cameron Road**,
  **Clarence Street**, **Mill Street**, **Moorhouse**
- **mall** — **Sylvia Park**
- **street + suburb, both** — **"Alderman Drive Henderson"**
- **macronised Māori place names** — **Māngere, Pāpāmoa, Whakatāne, Kaitāia,
  Whangārei, Taupō, Hāwera**
- town/city with a qualifier — "Gisborne City"

The macrons matter concretely: thermal-printer receipt headers are very commonly
plain ASCII, so a receipt will likely read `MANGERE` while the canonical branch
name is `Māngere` **[likely — the ASCII-printing habit is well established for
receipt printers, but I have no primary NZ receipt image to prove it]**. Any
equality check on branch text has to fold macrons.

### 2.3 New World

Fetched [New World Store Finder](https://www.newworld.co.nz/store-finder)
**[verified]**. No store numbers. Mostly suburb names (Albany, Birkenhead,
Browns Bay), but with format prefixes and street names mixed in — **"Metro Queen
Street"**, **"Metro Shore City"**. So the branch field can carry a *format*
token ("Metro") that isn't part of the location at all.

### 2.4 Foodstuffs ownership → a legal entity name that isn't the brand name

New World, PAK'nSAVE and Four Square are Foodstuffs banners, and **every store
is separately owner-operated** (Foodstuffs South Island alone describes itself
as ~200 individually owned businesses; owner-operators are limited to one store
each) **[verified]**, per
[Foodstuffs SI: Becoming an owner](https://www.foodstuffs-si.co.nz/working-with-us/becoming-an-owner)
and [About us | PAK'nSAVE](https://www.paknsave.co.nz/about-us).

Under NZ GST law, taxable supply information must carry the **supplier's name
and GST number** ([IRD: Taxable supply information for GST](https://www.ird.govt.nz/gst/tax-invoices-for-gst))
**[verified]**. For an owner-operated store the supplier is the store's own
company, not the banner. So a New World / PAK'nSAVE receipt very probably prints
an operating-company name and a per-store GST number distinct from the brand
line — something like a "<Place> New World Limited" style entity **[likely; the
legal requirement is verified, the exact printed wording is not]**.

Two consequences if true:

- A per-store **GST number** would be a genuinely stable per-branch identity for
  Foodstuffs stores — better than any name **[likely]**. But it is **not** stable
  across a change of owner-operator, and stores do change hands (see
  [NZ Herald: supermarket "musical chairs"](https://www.nzherald.co.nz/business/supermarket-musical-chairs-4-paknsave-new-world-stores-said-to-be-changing-hands/RG54YKDZVVTDEF2THUCE5X6MNY/))
  **[verified that stores change hands; uncertain whether the GST number
  follows the store or the owner]**.
- It also gives the OCR *two competing candidate strings* for "store name" — the
  brand line and the legal entity line — which is a plausible source of the
  `"Countdown"` vs `"Countdown Newmarket"` style inconsistency we'd see.
- Woolworths NZ is the opposite case: one company (Woolworths New Zealand
  Limited, Mangere, Auckland — stated in its own survey T&Cs **[verified]**)
  operates every store, so the legal name and GST number are **identical across
  all ~187 branches** and are useless for telling branches apart.

### 2.5 The Warehouse

Fetched [The Warehouse store list](https://www.thewarehouse.co.nz/stores)
**[verified]**. URLs are `/stores/[storename].html` — **no numeric id in the
URL**. The naming is the strongest evidence in this whole document that a bare
branch string is not enough, because it openly contains **disambiguators**:

- **"Henderson Lincoln Rd"** *and* **"Henderson West City"** — same suburb, two
  stores, separated by road vs mall
- **"Tauranga Crossing"** *and* **"Tauranga Fraser Cove"** — same city, two malls
- **"Linwood - Eastgate"**, **"Spreydon - Barrington"** — suburb *and* mall,
  joined by a hyphen-space
- **"Mt Wellington Lunn Ave"** — suburb + street
- "Auckland Airport", "Auckland Central" — same city, different qualifier

Note `"Rd"` abbreviated here vs PAK'nSAVE's `"Lincoln Road"` spelled out, and the
` - ` separator used in only some names. Free text will not survive this.

### 2.6 Checkout vs self-checkout vs online order

I found **no primary source** describing how the header differs between a staffed
lane, a self-checkout, and an online-order tax invoice **[uncertain — treat as
unanswered]**. What is established:

- Woolworths NZ issues **eReceipts / digital receipts** through the Everyday
  Rewards and Woolworths NZ apps, and in-store receipts and online order history
  are both viewable there ([Woolworths NZ app](https://www.woolworths.co.nz/services/woolworths-nz-app))
  **[verified]**. Digital and paper receipts are therefore different renderings
  of the same transaction and need not be laid out the same.
- An **online order has no physical branch in the customer-facing sense** — it is
  fulfilled from a store or a dedicated facility, and the invoice is issued by
  Woolworths New Zealand Limited. Whether a branch name appears on it at all is
  **[uncertain]**. This is a real risk for the branch model: some receipts may
  legitimately have *no* branch.
- Self-checkout receipts are printed by the same store system and are very likely
  identical in the header, differing only in the operator/till fields **[likely,
  by construction — no source]**.

---

## 3. Answering the ticket's questions

| Question | Answer | Confidence |
| --- | --- | --- |
| Chain only, chain+suburb, address, or code? | Brand line plus a branch word, plus address/phone; Foodstuffs adds a separate operating-company name + per-store GST number | brand+branch **[verified]** from store directories; the printed layout **[likely]** |
| Branch = suburb, mall, or something else? | **All of them, mixed within the same chain** — suburb, street, mall, format prefix ("Metro"), and suburb+street compounds | **[verified]** from all four chains' own directories |
| Is there a stable store number? | Woolworths NZ has a 4-digit public store id (9176, 9038). PAK'nSAVE, New World and The Warehouse publish none. Whether any of it reaches the printed receipt is unconfirmed | id exists **[verified]**; printed **[likely]** for Woolworths, **[uncertain]** elsewhere |
| What do this repo's fixtures show? | Two free-text columns, exact-string matching in two features, and fixtures that already disagree with themselves (`"Countdown"` vs `"Countdown Newmarket"`, `"Pak'nSave"` vs official `PAK'nSAVE`) | **[verified]** |
| Checkout vs self-checkout vs online? | Unanswered by public sources; online orders may carry no branch at all | **[uncertain]** |

---

## 4. What would settle the open questions

Nothing on the public web will. Three cheap steps, in order of value:

1. Photograph one receipt from each of Woolworths, New World, PAK'nSAVE and The
   Warehouse and transcribe the top ~8 lines verbatim into this file. That alone
   converts every **[likely]** above into **[verified]** or kills it.
2. Include one self-checkout receipt and one online-order invoice from the same
   chain, to answer §2.6.
3. Run those photos through the existing `recognizeReceipt` prompt unchanged and
   record what lands in `store_name_en`. That measures the actual variance of the
   thing tickets 24/25 have to survive, rather than predicting it.

---

## 5. Bottom line for tickets 24 and 25

**"Chain name + branch name, two AI-extracted text fields" is not sufficient on
its own.** The evidence against it is concrete, not speculative:

1. The chain name itself is unstable across time — Countdown → Woolworths, fleet
   complete only December 2025 **[verified]**. Every user with a multi-year
   history has both names for one shop.
2. The branch name has no single form. Suburb, street, mall, "Metro", and
   suburb+street compounds all appear *within one chain's own directory*, with
   inconsistent abbreviation (`Rd` vs `Road`) and separators (` - `)
   **[verified]**.
3. Word order is unsettled: the chain's own pages say "Church Corner
   Woolworths", our fixture says "Countdown Newmarket" **[verified]**.
4. Macronised place names will almost certainly arrive de-macronised from a
   thermal printer **[likely]**.
5. The current code compares these strings with raw `Map` keys and SQL `.eq()`
   **[verified]**, so any of the above silently splits one store into two in
   price comparison, and silently switches duplicate detection off.

What the evidence supports instead: keep the AI extracting free text (it is the
only thing that generalises across four chains with four different layouts), but
**do not let the raw text be the identity**. Put a `Store` row behind it, and
between the two put (a) a normalization step — trim, case-fold, strip macrons,
expand `Rd`/`St`, normalize separators, and alias `Countdown` → `Woolworths` —
and (b) a human confirmation step that binds a normalized string to an existing
`Store` or creates one. That is precisely the split tickets 24 and 25 already
propose, and this research says the confirmation step in 25 is load-bearing
rather than a nicety.

A store number is **not** a viable primary key: three of the four chains publish
none, and the one that does isn't confirmed to print it. Treat any number we do
find as an optional strengthening signal, never the identity.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# 研究：新西兰超市小票上到底印了什么门店标识信息

对应 ticket：`.scratch/grocery-receipt-tracker/issues/23-nz-receipt-store-header-facts.md`
日期：2026-09-14
分支：`research/nz-receipt-store-headers`（一次性分支——本文件即交付物）

每条结论都标了置信度：**[已核实]**（直接读自第一手来源或本仓库代码）、
**[大概率]**（二手来源互相印证，但没有第一手确认）、**[不确定]**（属于推断，
不要在没看过真实小票之前依赖它）。

---

## 1. 本仓库已知的事实（第一手——这位用户自己的小票）

### 1.1 我们只向 AI 要一个门店字符串

`api/_lib/recognizeReceipt.ts` **[已核实]**：

- 提示词写的是 `"Extract the store name, purchase date, total amount, and each
  line item."` 以及 `"Translate the store name ... into Chinese."`。关于分店、
  区名、地址、门店编号，**一个字都没有**。
- `RECEIPT_SCHEMA` 里门店字段正好两个：`store_name_en` 和 `store_name_zh`，
  都是普通 `type: "string"`。而且 `additionalProperties: false`，所以即使模型
  在照片上读到了分店或门店编号，**也没有地方可以返回**——要么被塞进
  `store_name_en`，要么直接丢掉。
- 校验只覆盖 `purchase_date` 和 `items.length`。门店名是 `""` 或 `"Supermarket"`
  都能通过。

也就是说，现在的流水线除了一行自由文本之外**完全没有门店身份信号**，也没有在
积累任何关于小票抬头实际写了什么的证据。

### 1.2 存储就是两个可空文本列，没有门店表

- `supabase/migrations/20260804000001_create_core_tables.sql`：`receipts` 有
  `store_name_en text not null`、`store_name_zh text` **[已核实]**。
  `supabase/migrations/` 里没有任何 `stores` 表 **[已核实]**。
- `spec.md` 第 11 节和 `src/lib/storeComparison.ts` 的注释已经明说：
  *"Stores are identified by their English name (there's no separate stores
  table)"* **[已核实]**。

### 1.3 已经有两处功能在对这段自由文本做精确字符串匹配

字符串一漂移，坏的就是这两处：

- `src/lib/storeComparison.ts`——`latestByStore` 是
  `Map<string, StoreComparisonRecord>`，直接用 `record.storeNameEn` 原样做 key，
  没有 trim、没有大小写折叠、没有归一化 **[已核实]**。于是同一家实体店的
  `"Countdown Hornby"` 和 `"Woolworths Hornby"` 会在比价里变成互相竞争的两家店。
- `src/lib/duplicateCheck.ts`——`.eq("store_name_en", params.storeNameEn)`，
  这是 SQL 精确相等，并且是重复判定三元组（门店 + 日期 + 总额）的三分之一
  **[已核实]**。字符串一漂移，重复检测是被**静默关掉**而不是给出错误结果，
  所以这个故障是无声的。

### 1.4 fixture 显示这种差异已经存在于本仓库自己的认知里

目前整个测试套件里用到的门店字符串 **[已核实]**（取自 `api/**` 和 `src/**`）：

| 字符串 | 出处 |
| --- | --- |
| `"Countdown"` / `"倒数超市"` | 多数 fixture |
| `"Countdown Newmarket"` / `"倒数超市 Newmarket 店"` | `api/_lib/recognizeReceipt.test.ts` |
| `"Pak'nSave"` / `"帕克超市"` | 比价相关 fixture |
| `"Four Square"` / `null` | `src/lib/bilingual.test.ts`（中文缺失） |
| `"城内城外"` | 双语 fixture |

这张表能推出三件事，都是证据而非猜测：

1. 同一个连锁在本项目自己写的 fixture 里**既有裸品牌名也有带分店的写法**
   （`"Countdown"` vs `"Countdown Newmarket"`）。模型到底带不带分店，目前纯属
   抛硬币，因为提示词只说了要 "store name"，没有定义它。
2. `"Pak'nSave"` 并不是该连锁自己的写法——官方是 **`PAK'nSAVE`** **[已核实]**，
   见第 2.2 节。大小写本身就已经在漂。
3. `store_name_zh` 可空，而且 fixture 里真的测了 `null`，所以中文一侧永远不可能
   充当身份 key。

### 1.5 仓库里没有任何图片 fixture

整棵树里没有保存任何样例小票图片或 OCR 文本（对 `*fixture*`、`*sample*`、
`*.jpg`、`*.png` 做 `find`，只返回 `.git` 的 hook 样例）**[已核实]**。
**上面所有 fixture 门店字符串都是本项目手写的，不是从真实小票转录的。**
它们是"代码假设了什么"的证据，不是"新西兰小票印了什么"的证据。要补上这个缺口，
只能去拍几张真实小票——见第 4 节。

---

## 2. 外部证据：各连锁如何命名分店

### 2.1 Woolworths NZ（原 Countdown）

- **小票上的连锁名在我们脚下换过一次。** Countdown → Woolworths 更名 2023 年 7 月
  宣布，第一家（陶朗加 Bethlehem）2023 年 8 月 17 日以 Woolworths 重开，
  **最后一家 Countdown Botany 在 2025 年 12 月完成更名**——整个车队花了约两年半，
  距本次研究才几个月 **[已核实]**，见
  [Wikipedia: Woolworths (New Zealand supermarket chain)](https://en.wikipedia.org/wiki/Woolworths_(New_Zealand_supermarket_chain))。
  对我们的后果：用户**同一家实体分店**的历史会横跨两个不同的印刷连锁名，而今天
  才拍的 2024 年小票上写的仍然是 "Countdown"。这不是假想的漂移，是任何多年历史
  里必然出现的漂移。
- **分店名里分店词在前。** Woolworths NZ 自家门店页标题是
  **"Church Corner Woolworths"**、**"Lincoln Road Woolworths"**，而不是
  "Woolworths Church Corner" **[已核实]**——
  [Church Corner](https://www.woolworths.co.nz/store-finder/9176/riccarton-christchurch/church-corner-woolworths)、
  [Lincoln Road](https://www.woolworths.co.nz/store-finder/9038/henderson/lincoln-road-woolworths)。
  也就是说连锁自己的词序和我们 fixture 里 `"Countdown Newmarket"` 的形状正好相反。
- **门店数字编号是存在的，而且公开。** 上面那两个 URL 里嵌着 **9176**
  （Riccarton 的 Church Corner）和 **9038**（Henderson 的 Lincoln Road）——
  四位数编号，并且区名 slug（`riccarton-christchurch`、`henderson`）和分店名
  slug 是分开的两段 **[已核实]**。注意分店名（"Church Corner"）和区名
  （"Riccarton"）是同一家店的**两个不同词**，而这正是文本字段无法消解的歧义。
- **这个编号印在小票上吗？** "Countdown Listens" 问卷条款只确认了小票上带有
  "entry details"（[官方条款](https://www.woolworths.co.nz/info/terms-and-conditions/countdown-listens-survey)）
  **[已核实]**，但没说这些细节是什么。第三方攻略说小票**底部**的代码是两个数字，
  一个 **store code**、一个 **transaction number** **[大概率]**。我无法用第一手
  来源确认这个 store code 的位置和格式；store-finder 里的编号（9176）是否就是
  小票上印的 store code，属于 **[不确定]**。问卷站点本身是 JS 渲染的，读不到。
- 门店查找页是纯前端渲染的 SPA，直接抓 `/store-finder/search` 拿不到门店数据，
  所以没有现成的公开"连锁名 → 门店编号"对照表可供归一化 **[已核实]**。

### 2.2 PAK'nSAVE

直接抓取了 [PAK'nSAVE Store Finder](https://www.paknsave.co.nz/store-finder)
**[已核实]**。目录里任何地方都没有门店编号。分店名**绝非**统一用区名：

- 区名——Albany、Botany、Clendon、Glen Innes、Highland Park、Royal Oak、
  Hornby、Papanui、Riccarton、Wainoni
- **街道名**——**Lincoln Road**、**Wairau Road**、**Cameron Road**、
  **Clarence Street**、**Mill Street**、**Moorhouse**
- **商场名**——**Sylvia Park**
- **街道 + 区名并列**——**"Alderman Drive Henderson"**
- **带长音符的毛利语地名**——**Māngere、Pāpāmoa、Whakatāne、Kaitāia、
  Whangārei、Taupō、Hāwera**
- 城市名加限定词——"Gisborne City"

长音符这一点很具体：热敏打印机的小票抬头通常是纯 ASCII，所以小票上多半印的是
`MANGERE`，而规范分店名是 `Māngere` **[大概率——热敏打印机印 ASCII 是公认习惯，
但我没有第一手的新西兰小票图片来证明]**。任何对分店文本的相等判断都必须折叠长音符。

### 2.3 New World

抓取了 [New World Store Finder](https://www.newworld.co.nz/store-finder)
**[已核实]**。没有门店编号。大多数是区名（Albany、Birkenhead、Browns Bay），
但混着业态前缀和街道名——**"Metro Queen Street"**、**"Metro Shore City"**。
也就是说分店字段里可能夹带一个和位置完全无关的**业态**词（"Metro"）。

### 2.4 Foodstuffs 的所有权结构 → 法人名不等于品牌名

New World、PAK'nSAVE、Four Square 都是 Foodstuffs 旗下的招牌，而**每家店都是
独立的业主自营店**（光 Foodstuffs South Island 就自称由约 200 家独立经营的生意
组成，且业主每人只能经营一家店）**[已核实]**，见
[Foodstuffs SI: Becoming an owner](https://www.foodstuffs-si.co.nz/working-with-us/becoming-an-owner)
和 [About us | PAK'nSAVE](https://www.paknsave.co.nz/about-us)。

按新西兰 GST 法规，taxable supply information 必须载明**供应商名称和 GST 号**
（[IRD: Taxable supply information for GST](https://www.ird.govt.nz/gst/tax-invoices-for-gst)）
**[已核实]**。对业主自营店来说，供应商是该店自己的公司，而不是招牌品牌。所以
New World / PAK'nSAVE 的小票上很可能印着一个与品牌行不同的经营公司名和一个
逐店的 GST 号——类似 "<地名> New World Limited" 这种法人名 **[大概率；法律要求
已核实，具体印刷措辞未核实]**。

若属实，有两个后果：

- 对 Foodstuffs 门店来说，逐店的 **GST 号**会是一个真正稳定的分店身份——比任何
  名字都好 **[大概率]**。但它在**换业主**时并不稳定，而门店确实会易主（见
  [NZ Herald：超市"抢椅子"](https://www.nzherald.co.nz/business/supermarket-musical-chairs-4-paknsave-new-world-stores-said-to-be-changing-hands/RG54YKDZVVTDEF2THUCE5X6MNY/)）
  **[门店易主已核实；GST 号跟店还是跟人，不确定]**。
- 这还给 OCR 提供了**两个互相竞争的"门店名"候选串**——品牌行和法人行——这很可能
  就是 `"Countdown"` vs `"Countdown Newmarket"` 这类不一致的来源。
- Woolworths NZ 则正好相反：所有门店由一家公司（Woolworths New Zealand Limited，
  奥克兰 Mangere，见其问卷条款 **[已核实]**）经营，所以法人名和 GST 号在全部约
  187 家分店之间**完全相同**，对区分分店毫无用处。

### 2.5 The Warehouse

抓取了 [The Warehouse 门店列表](https://www.thewarehouse.co.nz/stores)
**[已核实]**。URL 形如 `/stores/[storename].html`——**URL 里没有数字编号**。
它的命名是本文最有力的证据，说明光靠一个分店字符串不够，因为里面公然带着
**消歧词**：

- **"Henderson Lincoln Rd"** 和 **"Henderson West City"**——同一个区，两家店，
  靠"路名 vs 商场名"区分
- **"Tauranga Crossing"** 和 **"Tauranga Fraser Cove"**——同一座城，两个商场
- **"Linwood - Eastgate"**、**"Spreydon - Barrington"**——区名和商场名用
  "空格连字符空格"拼起来
- **"Mt Wellington Lunn Ave"**——区名 + 街道
- "Auckland Airport"、"Auckland Central"——同城不同限定词

注意这里 `"Rd"` 是缩写，而 PAK'nSAVE 写的是 `"Lincoln Road"` 全称；` - ` 分隔符
也只在部分名字里出现。自由文本扛不住这些。

### 2.6 人工收银 vs 自助收银 vs 线上订单

关于抬头在人工收银台、自助收银、线上订单税务发票之间有何差异，我**没有找到任何
第一手来源** **[不确定——视为未解答]**。已确立的只有：

- Woolworths NZ 通过 Everyday Rewards 和 Woolworths NZ App 提供**电子小票
  （eReceipts）**，店内小票和线上订单历史都能在里面查看
  （[Woolworths NZ app](https://www.woolworths.co.nz/services/woolworths-nz-app)）
  **[已核实]**。所以电子小票和纸质小票是同一笔交易的两种呈现，版式不必相同。
- **线上订单在面向顾客的意义上没有实体分店**——它由某家门店或专门的履约中心发货，
  发票由 Woolworths New Zealand Limited 开出。上面到底有没有分店名，属于
  **[不确定]**。这对分店模型是个真实风险：有些小票可能**根本没有**分店。
- 自助收银小票由同一套门店系统打印，抬头极可能完全一致，只在收银员/收银台字段上
  不同 **[大概率，属于结构性推断——无来源]**。

---

## 3. 回答 ticket 的问题

| 问题 | 回答 | 置信度 |
| --- | --- | --- |
| 只有连锁名，还是品牌+区名、地址、编号？ | 品牌行 + 一个分店词，加地址/电话；Foodstuffs 还会多一个经营公司名 + 逐店 GST 号 | "品牌+分店"**[已核实]**（来自门店目录）；具体印刷版式 **[大概率]** |
| 分店是区名、商场名还是别的？ | **全都是，而且在同一连锁内部混用**——区名、街道、商场、业态前缀（"Metro"）、以及区名+街道的复合写法 | **[已核实]**，四家连锁自家目录 |
| 有稳定的门店编号吗？ | Woolworths NZ 有公开的四位数门店 id（9176、9038）。PAK'nSAVE、New World、The Warehouse 都不公开。是否印到小票上均未确认 | 编号存在 **[已核实]**；Woolworths 印在小票上 **[大概率]**，其余 **[不确定]** |
| 本仓库的 fixture 显示了什么？ | 两个自由文本列、两处精确字符串匹配，而且 fixture 自己就已经互相矛盾（`"Countdown"` vs `"Countdown Newmarket"`，`"Pak'nSave"` vs 官方 `PAK'nSAVE`） | **[已核实]** |
| 人工/自助/线上差异？ | 公开来源无法回答；线上订单可能根本没有分店 | **[不确定]** |

---

## 4. 要把未决问题落实，该做什么

公开网络上没有答案。三个低成本步骤，按价值排序：

1. 从 Woolworths、New World、PAK'nSAVE、The Warehouse 各拍一张小票，把最上面约
   8 行逐字抄进本文件。光这一步就能把上面每一条 **[大概率]** 变成 **[已核实]**
   或直接推翻。
2. 再加一张同一连锁的自助收银小票和一张线上订单发票，用来回答第 2.6 节。
3. 用**未改动**的现有 `recognizeReceipt` 提示词跑一遍这些照片，记录
   `store_name_en` 里最终落进了什么。这是在**测量** ticket 24/25 要扛住的实际
   差异，而不是预测它。

---

## 5. 给 ticket 24 和 25 的结论

**"连锁名 + 分店名两个 AI 提取的文本字段"单靠自己是不够的。** 反对它的证据是
具体的，不是臆测：

1. 连锁名本身就随时间不稳定——Countdown → Woolworths，直到 2025 年 12 月才全部
   完成 **[已核实]**。任何有多年历史的用户，同一家店都会有两个名字。
2. 分店名没有统一形态。区名、街道、商场、"Metro"、区名+街道复合，**在同一连锁
   自己的目录里**全都出现，缩写不一致（`Rd` vs `Road`）、分隔符不一致（` - `）
   **[已核实]**。
3. 词序也没定：连锁自家页面写 "Church Corner Woolworths"，我们的 fixture 写
   "Countdown Newmarket" **[已核实]**。
4. 带长音符的地名几乎肯定会以去长音符的形式从热敏打印机上出来 **[大概率]**。
5. 现有代码用裸 `Map` key 和 SQL `.eq()` 比较这些字符串 **[已核实]**，所以上述
   任何一种情况都会把一家店悄悄拆成两家（比价），并悄悄关掉重复检测。

证据支持的做法是：继续让 AI 提取自由文本（面对四家版式各异的连锁，这是唯一能
泛化的东西），但**不要让原始文本成为身份**。在它后面放一个 `Store` 行，中间夹两
层：(a) 归一化——trim、大小写折叠、去长音符、展开 `Rd`/`St`、统一分隔符，并把
`Countdown` 别名到 `Woolworths`；(b) 人工确认——把归一化后的字符串绑定到已有
`Store` 或新建一个。这正是 ticket 24 和 25 已经提出的拆法，而本研究的结论是：
25 里的确认步骤是**承重**的，不是锦上添花。

门店编号**不能**当主键：四家里有三家根本不公开，唯一公开的那家也没确认会印在
小票上。任何我们真拿到的编号，只应作为可选的增强信号，绝不作为身份本身。
