# Grocery Receipt Tracker

A family shares one account-group, photographs grocery receipts, and the app tracks what each product costs over time, how fast it gets used up, and which store sells it cheapest.

This file is a glossary and nothing else. It defines what each term *is*, so that types, columns, and test names agree on one word per concept. Requirements live in `.scratch/grocery-receipt-tracker/spec.md`; decisions live in `docs/adr/`.

## Sharing

**Circle**:
A group of people who share one pooled set of products, receipts, and alerts. Every user belongs to exactly one.
_Avoid_: Household, family, group, team, account

**Global Admin**:
A person who can act across every Circle — the only role that can ban a user, grant AI Credit, or merge Circles. Distinct from any notion of "owner of a Circle", which the app does not have.
_Avoid_: Superuser, site admin, owner

## Buying

**Receipt**:
One shopping trip at one store, captured as a photo and the line items extracted from it.
_Avoid_: Transaction, bill, docket

**Receipt Item**:
A single line on a Receipt: what was bought, how many, at what price.
_Avoid_: Line item, entry, row

**Product**:
The recurring thing a Circle buys, which many Receipt Items across many Receipts refer to. Carries the canonical name and the category; a Receipt Item carries neither.
_Avoid_: Item, SKU, good

**Purchase**:
One acquisition of a Product at a known unit price and date — a Receipt Item after it's been normalized to comparable units. The unit of every price and consumption calculation.
_Avoid_: Buy, acquisition, sale

**Purchase History**:
Every Purchase of one Product, oldest first. The single input that price trends, store comparison, consumption rate, and alerts all start from.
_Avoid_: Price history, timeline, purchase log

**Bilingual Name**:
The name of a Product, Store, or Receipt Item held in both languages at once: an English **Source Text**, read off the receipt, and a Chinese **Translation** of it. Reading a Bilingual Name in either language always yields text — a Product whose Translation was never produced reads back as its Source Text, not as blank.
_Avoid_: Localized name, i18n name, name pair

## Review

**Draft**:
A Receipt whose AI-extracted contents nobody has confirmed yet. Nothing in a Draft counts as a Purchase.
_Avoid_: Pending receipt, unconfirmed receipt, provisional

**Correction**:
A user's change to what the AI produced — a misread name, a bad translation, a wrong category. Every one is recorded, because the record is what later teaches the matching.
_Avoid_: Edit, fix, override

## AI Access

**AI Access**:
Whether a given user may make an AI recognition call right now. The umbrella state; it resolves through either a Free Trial or AI Credit, never both.
_Avoid_: Quota, allowance, limit, budget

**Free Trial**:
The fixed number of *successful* recognition calls a brand-new user gets, counted rather than priced. Where every user starts, and it never refills.
_Avoid_: Free tier, trial quota, starter allowance

**AI Credit**:
A dollar cap a Global Admin grants a user, spent down by the real cost of each call. Granting is always a reset to a fresh cap, never a top-up, and nothing but another grant lifts an exhausted one.
_Avoid_: Balance, top-up, budget, spend limit

## Watching

**Alert**:
A notice raised for a Circle about one Product — that its price spiked, or that stock is running low. Raised by the app, not by a user.
_Avoid_: Notification, warning, flag

**Low Stock**:
The state of a Product whose estimated days remaining, derived from its Purchase History, has run down. It decays with time alone, which is why it's re-checked on a schedule rather than on new Purchases.
_Avoid_: Out of stock, running out, depleted

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

# 家庭采购小票追踪器

一家人共用一个账户组，拍摄采购小票，应用据此追踪每样商品的价格变化、消耗速度，以及哪家店最便宜。

本文件只是一份术语表，别无其他。它定义每个术语**是什么**，好让类型名、数据库列名和测试名对同一个概念只用同一个词。需求写在 `.scratch/grocery-receipt-tracker/spec.md`；决策记录在 `docs/adr/`。

## 共享

**Circle（圈子）**：
共用同一批商品、小票和提醒的一群人。每个用户恰好属于一个。
_避免_：家庭、家族、群组、团队、账户

**Global Admin（全局管理员）**：
能跨所有 Circle 操作的人——唯一能封禁用户、发放 AI Credit、合并 Circle 的角色。与「某个 Circle 的所有者」不是一回事，应用中并不存在后者这一概念。
_避免_：超级用户、站点管理员、所有者

## 购买

**Receipt（小票）**：
在一家店的一次购物，以一张照片及从中提取的行项目的形式留存。
_避免_：交易、账单、收据单

**Receipt Item（小票行项目）**：
小票上的一行：买了什么、买了多少、单价多少。
_避免_：明细行、条目、记录行

**Product（商品）**：
一个 Circle 反复购买的东西，众多小票上的众多行项目都指向它。它承载规范名称和分类；行项目两者都不承载。
_避免_：物品、SKU、货品

**Purchase（一次购入）**：
在已知单价和日期下对某个 Product 的一次获取——即换算成可比单位之后的 Receipt Item。所有价格与消耗计算的基本单位。
_避免_：购买动作、获取、销售

**Purchase History（购入历史）**：
某个 Product 的全部 Purchase，按时间从旧到新。价格趋势、门店比价、消耗速度和提醒，全都从它出发。
_避免_：价格历史、时间线、购买日志

**Bilingual Name（双语名称）**：
Product、门店或 Receipt Item 同时以两种语言持有的名称：英文的 **Source Text（原文）**，从小票上读取；以及它的中文 **Translation（译文）**。用任一语言读取 Bilingual Name 都必然得到文字——某个 Product 若从未产出过 Translation，读回来的是它的 Source Text，而不是空白。
_避免_：本地化名称、i18n 名称、名称对

## 复核

**Draft（草稿）**：
AI 提取完内容但还没有人确认的 Receipt。草稿里的任何内容都不算作 Purchase。
_避免_：待处理小票、未确认小票、临时小票

**Correction（更正）**：
用户对 AI 产出结果所做的改动——认错的名称、糟糕的翻译、错误的分类。每一次都会被记录，因为这份记录正是日后改进匹配的依据。
_避免_：编辑、修正、覆盖

## AI 使用权

**AI Access（AI 使用权）**：
某个用户此刻是否可以发起一次 AI 识别调用。这是总括状态；它要么经由 Free Trial 判定，要么经由 AI Credit 判定，绝不会两者同时。
_避免_：配额、额度、限制、预算

**Free Trial（免费试用）**：
全新用户获得的固定次数的**成功**识别调用，按次数计而不按金额计。每个用户的起点，且永不补充。
_避免_：免费层、试用配额、初始额度

**AI Credit（AI 额度）**：
Global Admin 发放给用户的美元上限，按每次调用的真实成本扣减。发放永远是重置为一个全新的上限，而非叠加充值；除了再发放一次，没有任何机制能解除已用尽的状态。
_避免_：余额、充值、预算、消费上限

## 监测

**Alert（提醒）**：
就某个 Product 向一个 Circle 发出的通知——价格异常上涨，或库存即将耗尽。由应用发出，而非用户发出。
_避免_：通知、警告、标记

**Low Stock（库存偏低）**：
某个 Product 的状态：由其 Purchase History 推算出的预计可用天数已经见底。它仅随时间流逝就会逼近，因此需要定时重新检查，而不是在有新 Purchase 时才检查。
_避免_：缺货、快用完、耗尽
