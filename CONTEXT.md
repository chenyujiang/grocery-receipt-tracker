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
