Type: research
Status: open
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
