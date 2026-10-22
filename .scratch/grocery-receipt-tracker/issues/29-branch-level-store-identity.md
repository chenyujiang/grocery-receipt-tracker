Type: spec
Status: ready-for-agent
GitHub: #33
Covers: 24, 25, 26, 27, 28

## Problem Statement

A supermarket chain has many branches, and the same product does not cost the same at all of them. Right now the app cannot tell them apart: a Receipt records only a store *name*, so every Woolworths in the country is one Store as far as the app is concerned.

Worse, price comparison ignores the Store entirely. `calculatePriceChange()` takes a Product's two most recent normal-price Purchases wherever they were bought, so a price-spike alert can fire because milk at PAK'nSAVE is cheaper than milk at New World — a fact about two different shops, not a price rise. Products from different chains often don't even carry the same name, so some of these comparisons are between things that aren't the same product at all.

The result is an alert list nobody trusts. The user wants to know one thing: **did this product get more expensive at the shop I actually buy it from?**

## Solution

Give a Store a branch, and make the branch the unit of every price comparison.

When a receipt is scanned, the AI splits the header into a chain and a branch ("Woolworths" / "Hornby") and the user confirms it in the same preview flow they already use to confirm items. The confirmed Receipt points at a **Store** row — a real record, scoped to the Circle — rather than carrying a loose string.

Everything that answers "did this get more expensive" then narrows to a single Store: the product detail page's price-change figure, the 15% price-spike alert, and the monthly report's leaderboard. Two purchases at two different branches are no longer a price change; they're a store comparison, which the app already has a module for. That module, and the price trend chart, become *more* useful under the new model, because "different suburbs charge different prices" is exactly the thing they exist to show — so both move from chain-level to branch-level too.

Consumption rate deliberately does not narrow. You use what you bought regardless of which branch sold it.

## User Stories

1. As a shopper, I want the app to record which branch a receipt came from, so that my price history reflects where I actually shop.
2. As a shopper, I want the AI to read the branch off the receipt header automatically, so that I don't have to type it in for every shop.
3. As a shopper, I want to correct the branch the AI read, in the same screen where I already correct item names, so that I don't have to learn a second workflow.
4. As a shopper, I want to pick from the branches I've already shopped at, so that one branch doesn't accumulate three slightly different spellings.
5. As a shopper, I want to record a receipt whose header doesn't name a branch, so that an unreadable header doesn't block me from saving the receipt at all.
6. As a shopper, I want a receipt with an unknown branch kept separate from my named branches, so that the app never claims a price rise it can't actually justify.
7. As a shopper, I want a price-spike alert only when the same product got more expensive at the same branch, so that the alerts I get are ones I can act on.
8. As a shopper, I want to stop getting alerts caused by a chain-to-chain price difference, so that the notification list stops crying wolf.
9. As a shopper, I want the product detail page's price-change figure labelled with the branch it refers to, so that I know which shop the number is about.
10. As a shopper, I want the monthly report's price-increase leaderboard to name the branch behind each increase, so that the report tells me where to stop shopping.
11. As a shopper, I want a product I buy at three branches to occupy one leaderboard row, not three, so that one product can't crowd out the rest of the report.
12. As a shopper, I want the price trend chart to draw one line per branch, so that I can see a branch drifting more expensive than its neighbours.
13. As a shopper, I want promotional purchases still drawn on the trend chart but never used as a price-change baseline, so that the chart stays honest without a special being mistaken for a price cut.
14. As a shopper, I want the store comparison module to list branches rather than chains, so that "where is this cheapest" names a shop I can drive to.
15. As a shopper, I want my existing receipts to keep working after the change, so that switching to branches doesn't wipe the price history I've already built up.
16. As a shopper, I want the receipt list and receipt detail page to show the branch, so that I can tell two visits apart at a glance.
17. As a shopper, I want the branch included in my CSV export, so that the exported data is as precise as what the app shows.
18. As a shopper, I want the branch shown in my chosen language like every other name in the app, so that switching to Chinese doesn't leave English text stranded on the page.
19. As a shopper, I want duplicate detection to keep catching a receipt I uploaded twice, so that the new Store model doesn't quietly break a feature that already worked.
20. As a shopper, I want alerts that were already raised under the old cross-chain rule left alone, so that my notification history doesn't rewrite itself underneath me.
21. As a shopper, I want a product I've only bought once at a branch to show no price change there, rather than a change of zero, so that "no data" and "no movement" stay distinguishable.
22. As a Circle member, I want the branch list shared with the rest of my Circle, so that my partner's receipts and mine land on the same Store rows.
23. As a Circle member, I want consumption-rate and low-stock estimates to keep counting every purchase regardless of branch, so that splitting by branch doesn't make the app think I'm running out of things I'm not.
24. As a Global Admin, I want a Circle merge to carry Stores across with everything else, so that merging two households doesn't strand their price history.
25. As a developer, I want the branch-scoping rule to live in exactly one function, so that a future price feature can't accidentally re-introduce cross-store comparison.
26. As a developer, I want purchase history to keep loading in one batched query, so that adding the Store doesn't reintroduce the N+1 that `fetchPurchaseHistories` exists to prevent.
27. As a developer, I want the glossary to define Store and Branch precisely, so that the column names, types, and test names agree on one word per concept.

## Implementation Decisions

Several of these decide a question that wayfinder tickets 24–28 had left open. Each such decision is marked **[assumption → NN]**: it is the spec's answer, taken so implementation isn't blocked, and the named ticket is where to go if it should be revisited.

### The Store entity

- A new `stores` table, **Circle-scoped**, matching how Products already work: `circle_id`, a chain name as a bilingual `_en`/`_zh` pair, and a branch name as a second bilingual pair. The chain is a text column on the Store, not a table of its own — nothing in this spec needs a chain-level record, and inventing one now would be speculative. **[assumption → 24]**
- A **null branch means "branch unknown"**, and is a normal, permanent state rather than an error to be cleaned up later. Because it is a distinct Store row, an unknown-branch Store can never be silently compared against a named one — the separation falls out of the data model rather than needing a rule. **[assumption → 24]**
- Uniqueness is enforced per Circle over the chain plus the branch, treating a null branch as its own distinct value, so one Circle cannot end up with two rows for the same branch.
- `receipts` gains a `store_id` foreign key. The existing `store_name_en`/`store_name_zh` columns **stay**, holding the raw OCR text as read off that particular receipt — the same relationship `receipt_items` already has with `product_id`, where the row keeps its own raw name alongside the resolved link. This preserves the evidence when a resolution later turns out to be wrong. **[assumption → 24]**
- RLS policies for `stores` mirror the `products` policies: a member reads and writes only their own Circle's rows.
  - **Amended during implementation: a member can also delete a Store that no receipt points at.** `products` has no delete policy, and neither did `stores` at first. One was added for the decision below that a Store is created on confirm. To keep that decision true, a confirm or edit that creates a new Store and then fails on a later write deletes the Store again — otherwise a draft abandoned after a failed confirm would leave a Store with no receipts in every member's picker, the junk branch that decision exists to prevent. The policy is as narrow as that need: only a Store in the member's own Circle, and only while no receipt points at it, so a Store with any history can never be deleted. The cleanup is best effort — if the delete fails too, the Store stays, and the user still sees why the confirm failed. One race is left, the same kind as the known one on creating a Store: if another member's confirm finds the new Store in the moment before it is deleted, their confirm then fails, and a retry creates the Store afresh.
- `merge_users_into_new_circle` must carry `stores` over along with products, receipts and alerts. A merge that moves receipts but leaves their Stores behind would break the foreign key and strand the merged household's price history.
- Migration goes in `supabase/migrations/`, applied through the Supabase MCP tools with a local copy saved. `src/types/database.types.ts` is hand-derived, so the new table, the new column, and the new FK `Relationships` entry must land in the same commit or every query involving them silently degrades to `any`.

### Recognizing and resolving a Store

- `recognizeReceipt` returns the chain and the branch as separate bilingual fields, added to both its JSON response schema and its result type. When the header names no branch, the model returns an empty branch rather than guessing one. The existing store-name fields remain, so the raw header text is still captured. **[assumption → 25]**
  - **Amended during implementation: the draft keeps what the AI read, and a cut-off response gets a readable error.** Two things this bullet needed but didn't spell out. First, the chain and branch the AI read are saved on the draft, in four new `receipts` columns (`recognized_chain_en/zh`, `recognized_branch_en/zh`). The server writes a draft once, at recognition, and the preview screen loads it later — possibly after the user has left and come back — so the split has to be stored somewhere in between, or the picker could only start from the printed header instead of "pre-filled with what the AI read". They hold the AI's reading only, never a Store, so they don't conflict with a draft having no Store until it is confirmed. A draft saved before these columns existed has them empty and starts from its header as the chain, branch unknown. Second, Testing Decisions asks for a malformed-response case but not for what should happen in it. A long receipt can hit the response's token limit and come back as cut-off, invalid JSON, which used to reach the user as a raw `SyntaxError`; it now says the result came back incomplete and suggests retrying or photographing a shorter section. The JSON is longer now that it carries the chain/branch split, which makes the cut-off more likely — that is why it was fixed here. Like the app's other fallback messages, it is English only for now.
- A new module, `src/lib/stores.ts`, owns two operations: listing the Circle's Stores (for the picker) and resolving a chain/branch pair to a Store, creating one if it doesn't exist. It gets two callers — the preview UI and the confirm path — which is precisely why it is a module rather than a private helper.
- **Matching is exact, but only after a real normalization pass**, on the chain and branch English text within the Circle. Ticket 23's research found the printed branch has no single form within one chain — suburb, street, mall, format prefix, and suburb-plus-street compounds all occur, with `Rd` and `Road` both in use, separators inconsistent, and word order unsettled ("Church Corner Woolworths" against "Countdown Newmarket"). So normalization must case-fold, collapse whitespace, strip macrons from Māori place names (a thermal printer will very likely print `Mangere`, not `Māngere`), expand common street abbreviations, and normalize separators. **[assumption → 25]**
- **Chain names get an alias table**, because the chain name is unstable over time: the Countdown → Woolworths rebrand completed in December 2025, so one physical branch spans two printed chain names in any multi-year history. Without the alias, the backfill splits a household's longest-running store in two.
- **No fuzzy matching beyond that.** A near-miss offers the user a candidate list rather than guessing. The research's conclusion is that normalization alone cannot make this identity reliable — the human confirmation step is load-bearing, not a convenience, and should not be optimized away later.
- **A printed store number is not the key.** Woolworths NZ has a public four-digit store id, but the other three chains publish none and it is unconfirmed whether any number reaches the printed receipt. If a number turns out to be reliably present, treat it as a signal that strengthens a match, never as the primary identity.
- Foodstuffs stores (New World, PAK'nSAVE) are individually owner-operated, so their receipts likely carry a per-store operating-company name and GST number alongside the brand. The recognition prompt must be explicit that the **brand** is the chain, so the model doesn't return the operating company as the store name.
- **A Store row is created on confirm, not on draft save.** A draft holds the raw text plus, optionally, a `store_id` the user picked from existing Stores. This means an abandoned or deleted draft leaves no junk branch in the picker — which matters, because a misread branch would otherwise pollute the list every household member sees. **[assumption → 25]**
  - **Amended during implementation: a draft does not store the Store the user picked.** Only the half of this decision that matters was built: a Store is still created on confirm, never earlier. The optional picked `store_id` was dropped deliberately, for three reasons. First, the app has no draft-save step to hang it on — the server writes a draft once, at recognition, and the preview screen writes nothing until Confirm — so it would mean a database write on every change of the picker. Second, the pick is only needed within one sitting: review happens on one screen, and a user who leaves and comes back gets the same match again, because the picker re-derives it from what the AI read. Third, a draft with a `store_id` would contradict the glossary, where a Draft has no Store until it is confirmed, and the receipt list and home page would start naming a draft by a Store it doesn't yet have. The reading half is already in place — the picker prefers a draft's `store_id` if it has one — so this can be added later if losing a pick turns out to matter.
  - **Amended during implementation: a blank chain is refused.** The picker lets the user clear the chain field on "new branch" or "branch unknown", and confirming then would have created a Store with an empty chain name and key — blank in every member's picker, another kind of junk this decision is meant to keep out. So the store module refuses to resolve a chain that normalizes to nothing (empty, or only spaces and dots), before looking anything up or creating anything. The Confirm and Save buttons follow the same rule and stay disabled while the chain is blank, so the refusal itself is a backstop the user shouldn't normally meet. While the chain is blank, a hint under the chain field, in both languages, says a chain name is needed to continue, so the disabled button isn't left unexplained. The refusal's own message is English only for now, like the app's other fallback errors.
- The preview screen gains a store picker offering: the Circle's existing Stores, "create this as a new branch" pre-filled with what the AI read, and "branch unknown". It sits where the store-name field sits today.
- Editing a confirmed Receipt may change its Store, reusing the same picker. A Store change is recorded in `EditLog` like every other Correction. Consistent with the precedent already set for edits, changing a Receipt's Store does **not** retroactively re-raise or withdraw alerts. **[assumption → 25]**
  - **Amended during implementation: a receipt's Store or date change and its `EditLog` rows are written in one transaction.** `EditLog` is append-only by design — it has no update or delete policy — so a row, once written, can't be taken back. The app used to write the Store-change row in one request and the receipt update in the next. If the update then failed, the log kept a Store change that never happened, and each retry logged it again; the purchase-date row on edit had the same problem. So migration 0001 adds a Postgres function, `update_receipt_with_log`, that changes the receipt's status, Store and purchase date and inserts their `EditLog` rows in one transaction — both or neither. Both confirm and edit use it. It is security invoker, so the caller's own RLS still applies: only the uploader can change the receipt, and every row is logged as the signed-in user's edit. If the receipt isn't one the caller may change, it raises rather than committing the log rows alone. Item edits keep their own path: their rows record changes that really were saved, and a retry diffs against the saved values, so they never duplicate. Logging after the update instead was ruled out, since a failure between the two would then leave a change with no log at all — the gap an append-only trail exists to prevent.
- **Duplicate detection is unchanged**: it keeps keying on the raw store name plus date plus total. Its job is "did I already upload this receipt", and date plus total is already near-decisive; tightening it to `store_id` would make it miss a genuine duplicate whose branch happened to resolve differently, which is the more costly error. **[assumption → 25]**

### Narrowing the comparison

- `fetchPurchaseHistories` returns a `storeId` on each `Purchase`, alongside the store names it already returns. It remains one batched query; nothing about the Store may turn it into a query per product or per store.
- `priceChange.ts` gains **one** new exported pure function that takes a Product's purchases and returns a Same-Store Price Change per Store. `calculatePriceChange` itself stays store-unaware and unchanged — it keeps answering "what did these two purchases do", and the new function decides which purchases belong together. The branch-scoping rule therefore lives in exactly one place.
  - **Amended during implementation: two exported functions, over one private grouping.** The callers ask two different questions. The leaderboard wants every Store's change, to pick the biggest, so it calls `calculatePriceChangesByStore`. The price-spike check and the product page's headline each want one given Store's change — the confirmed receipt's Store, or the Store of the latest purchase — so they call `priceChangeAtStore`, which also returns the two purchases it compared — the spike check needs them, the baseline's date for its staleness cut-off and the current price for the alert. Having those two callers search the full per-Store list for their one Store would repeat the same lookup in both and compute changes they then throw away. What this bullet protects still holds: neither export groups purchases itself. Both start from one private function, `recordsByStore`, the only code that decides which purchases belong to the same Store, and `calculatePriceChange` stays store-unaware. So the branch-scoping rule still lives in exactly one place — only its entry points are two.
- The **product detail page's headline price-change figure** is the Same-Store Price Change for the Store of the most recent Purchase, and it carries that Store so the UI can label it. Rationale: the page's headline should answer "did my usual shop get more expensive", and the most recent purchase is the best available guess at the usual shop. **[assumption → 27]**
- The **monthly report leaderboard** keeps one row per Product, ranked by that Product's largest increase across its Stores, with the responsible Store named on the row. One product occupying three rows would crowd out the rest of a five-row report. **[assumption → 27]**
  - **Amended during implementation: only the Stores the Product was bought at that month, at normal price, count.** Review found that "across its Stores", taken literally, reaches too far back. The report picks the Products bought this month but reads each one's whole purchase history, so milk bought this month only at Hornby could be listed as "+25% · Riccarton", where both Riccarton purchases were a year ago. Under the old single-pair rule the change always involved the latest purchase, so this gap only opened with the per-Store rule. A row like that contradicts the report's "this month's increases" framing, and story 10's point, that the report tells the shopper where to stop shopping — a Store they haven't been to in a year isn't one. So each Product is ranked only across the Stores it was bought at in the report's month, at normal price. A promotional purchase doesn't make a Store count: promotions are never compared (Section 10), so the change at a Store whose only purchase that month was on promotion still comes from older normal-price purchases — a year-old rise would take the row again, the same stale row this amendment exists to remove. A Store that counts keeps its whole history, so this month's price is still compared with its last price at that same Store, however long ago. One gap from before this branch is left: on a past month's report, purchases made after that month still count toward a Store's change.
- **Price-spike alerts** compare only against earlier Purchases at that Receipt's own Store, which is unambiguous because an alert is raised per Receipt. The threshold stays at 15%, exceeded rather than reached.
- **A staleness cut-off is added to alerts**: if the baseline Purchase at that Store is older than roughly six months, no alert is raised, though the product detail page still shows the change. Narrowing to one branch makes stale baselines far more common, and "this cost 20% less when you last bought it here, ten months ago" is inflation, not a spike. This is the one place the spec adds a rule rather than narrowing an existing one — reverse it first if alerts turn out too quiet. **[assumption → 27]**
- Alerts already raised under the old cross-store rule are left standing, not retro-corrected.
- `compareStores` keys on `storeId` instead of the store's English name. Its "fewer than two entries means show nothing" rule now counts branches, so a household that shops at two branches of one chain gets a comparison it previously didn't.
- `buildPriceTrend` returns points carrying their `storeId`, so the chart can split them into series. Promotional purchases stay plotted and stay excluded from price-change baselines, exactly as now.
- **Consumption rate stays cross-branch.** It reads the same purchase history and must keep ignoring the Store; a test should pin this so a later refactor doesn't narrow it by sympathy. Low-stock alerts inherit this unchanged.

### Existing data

- Backfill creates **one Store per distinct raw store name per Circle**, with the branch left unknown, and points each existing Receipt at its Store. **[assumption → 26]**
- The backfill deliberately does **not** try to split a suburb out of a name like "Countdown Hornby". A wrong split would silently fabricate a branch and corrupt the history it was meant to preserve; leaving it as one unknown-branch Store is recoverable, and the user can correct it by editing receipts afterwards.
- The practical effect is smaller than it first appears: receipts that shared a store name still share a Store, so their comparisons keep working. What stops immediately is comparison *across* names — which is the bug being fixed.
- Before writing the migration, count the existing receipts and distinct store names per Circle and report them. If the numbers are small enough that manual branch assignment is realistic, that is worth raising before the automated backfill is the only option.
  - **Amended during implementation: the backfill uses a hand-confirmed mapping, not the automatic rule above.** The count came back small — 19 confirmed receipts under 11 distinct store names, all in one Circle — so manual assignment was raised, as this bullet asks, and the user confirmed a mapping by hand. It differs from the automatic rule in two ways, both because the user knew where each receipt was actually bought. Spellings of one shop are merged: "Pak n Save Albany", "Pak'nSave Albany" and a bare "PAK'nSAVE" become one Store, where the automatic rule would have split one shop's history three ways. And branches are assigned, including to headers that print the chain alone ("New World" → Hobsonville, "Costco Wholesale" → Westgate) — not by splitting a suburb out of the text, which stays ruled out, but because the user said which branch it was. Names the user couldn't place keep an unknown branch. The mapping is pinned to that one Circle, so a confirmed receipt anywhere else stops the migration rather than inheriting these branches.

### Presentation

- The trend chart draws **one line per Store**. A Store with a single purchase renders as a lone point rather than an invisible zero-length line. **[assumption → 28]**
- Series colours come from new design tokens in the `:root` block, with values for the `prefers-color-scheme: dark` override — not hardcoded colours in a component.
- Legend entries use the branch name, falling back to the chain name when the branch is unknown, so the labels stay short enough for a phone.
  - **Amended during implementation: two Stores whose branch names match are labelled by chain and branch.** Review found a case this bullet doesn't cover. A branch name is only unique within its chain, and one suburb often has several supermarkets, so a product bought at both PAK'nSAVE Albany and New World Albany would get two legend entries both reading "Albany". Only the colour would tell the two lines apart, which defeats the point of a legend. So when two Stores on the same chart would get the same label, both are labelled with the Store's full name, chain then branch ("PAK'nSAVE Albany", "New World Albany"). Every other entry stays short as this bullet asks — the longer label is used only where the short one is ambiguous, so a phone-width legend grows only when it has to. Labels are compared in the language being shown, so two Stores that clash in just one language are told apart in that language.
- The store comparison module and the trend chart sit side by side on the product detail page and are now both keyed by branch. Whether one should absorb the other is a presentation question for the prototype; the spec does not merge them.
- Branch appears in the receipt list, the receipt detail page, the leaderboard rows, and the CSV export.
  - **Amended during implementation: the receipt list's store search also matches the Store's names.** This bullet only asks for the branch to be shown. But once the list names a receipt by its Store rather than its printed header, a search that still matched only the header would contradict what the user sees: a receipt listed as "PAK'nSAVE Albany" but printed "Pak n Save Albany" would not come up for "PAK'nSAVE", and searching for a branch would miss every receipt whose header printed the chain alone. So the search matches the printed header or the Store's chain or branch name, in either language. PostgREST's `.or()` can't filter through the `stores` embed, so the matching Stores are looked up first and the receipts matched by `store_id` — one extra query per search. The matching is the same substring search as before, not the normalized keys: it's a search box, not Store identity.
  - **Amended during implementation: the CSV keeps its `store_name_en`/`store_name_zh` columns, and gains the Store's chain.** Those two columns hold the Receipt Header — the store name as the receipt printed it — and the glossary says not to call that a Store name. They are kept under their old names anyway, on purpose: the CSV is a file the user takes out of the app, into a spreadsheet or a script, and renaming a column silently breaks whatever reads it by name. What they hold has not changed either, since they were always the printed header. The Store goes in new columns instead. Next to the branch this bullet asks for, there is now `chain_name_en`/`chain_name_zh`, the Store's own chain, placed before the branch so the two read as the Store. Without it a row would pair the printed chain with the Store's branch, and a receipt printed "Countdown" but resolved to a Woolworths Store would read as Countdown plus a Woolworths branch. Both new pairs are blank when the receipt has no Store. A Store with an unknown branch still has its chain.
- Store and branch names are Bilingual Names and read through the same mechanism as every other bilingual name, falling back to Source Text when no Translation exists. New fixed UI chrome (picker labels, "branch unknown", legend headings) gets `i18n.ts` keys in both languages.
  - **Amended after implementation: a Store's names are shown in English only.** The AI's Chinese renderings of supermarket names read badly — "羊毛超市" for Woolworths, "好市多批发" for Costco — and a brand name is what the shopper sees on the shop front, so the user chose English for both languages. A new Store is created with `chain_name_zh` and `branch_name_zh` left null, whatever Translation the AI read; the eight backfilled Stores had theirs cleared by a follow-up migration. They still read through the Bilingual Name mechanism, which falls back to the Source Text, so nothing on the display side changed. The columns stay, as does `receipts.store_name_zh`: the Receipt Header keeps its Translation, since it's evidence of what was read, not the Store's name.
- `CONTEXT.md`'s **Store** entry is rewritten — a Store is no longer "just the name printed on its Receipts" — and **Branch** is added as a term. Do this in the same change as the schema, not afterwards.

## Testing Decisions

A good test here asserts what a caller can observe: given this purchase history, what price change comes back; given this receipt, is an alert raised. It does not assert how many queries ran, in what order the filters were applied, or which private helper was called. The branch rule is observable — two purchases at different Stores produce no change between them — so it can be tested entirely through existing public functions.

- **`priceChange.ts`'s new per-Store function** carries the bulk of the coverage, as a pure function with no mocking at all: purchases split across two Stores yield two independent results; a Store with one normal-price purchase yields nothing rather than zero; promotional purchases are excluded at both ends; an unknown-branch Store never merges with a named one. Prior art: the existing `priceChange.test.ts` and `consumptionRate.test.ts`, which are pure-input/pure-output throughout.
- **`priceSpikeAlerts.ts`** gets tests for the cases that were previously wrong: purchases at two different Stores raise nothing; a rise above 15% at one Store raises exactly one alert; a baseline beyond the staleness cut-off raises nothing.
- **`consumptionRate.ts`** gets a test pinning that purchases spread across several Stores are still counted together — a regression guard for a narrowing that must not happen.
- **`purchaseHistory.ts`** gets its existing test extended to assert `storeId` comes through, and to keep pinning that one query is issued for many products. Its test already passes a plain client object as a parameter and needs no `vi.mock`.
- **`stores.ts`** is tested through `src/test/fakeSupabase.ts` (the shared fake from ticket 18, which replays prepared rows and records calls): resolving to an existing Store returns it without inserting; resolving an unseen branch inserts one; normalization means differing whitespace or casing resolves to the same Store.
- **`recognizeReceipt`** already mocks the Anthropic call and asserts on the parsed result; extend those cases for a header with a branch, a header without one, and a malformed response.
- **`productDetail.ts`, `priceChangeLeaderboard.ts`, `storeComparison.ts`, `priceTrend.ts`** keep their current test shapes; only the fixtures and expectations change.
- The boundary-mocking convention is unchanged: mock `@/lib/supabaseClient`, never supabase-js internals, and prefer the shared fake over a hand-rolled chain.
- Follow the repo's TDD practice: a failing test for each behaviour above before the code that satisfies it. `npm run typecheck` covers `src`, `api` and the Vite config, so a missed `database.types.ts` update surfaces there.

## Out of Scope

- **Merging two Store rows that turn out to be the same branch.** OCR variance and chain renames (Countdown → Woolworths) will eventually produce duplicates whose history is split. This spec's exact-match-plus-picker keeps it rare, but a merge tool is its own feature and needs its own decision about who may run it.
- **A chain-level view.** "What do I pay at Woolworths generally" is not answered by anything here. Whether it should exist at all is a consequence of the branch UI, not a prerequisite.
- **Splitting suburbs out of legacy store names automatically.** Explicitly rejected above, not deferred.
- **Store addresses, geolocation, opening hours, or picking a store from a map.** Nothing in the price problem needs them.
- **Per-product or per-store alert muting.** Still not built; narrowing the comparison is the mechanism for reducing noise in this round.
- **Changing the 15% threshold itself.** The staleness cut-off is added; the percentage stays where it is until there's evidence about the new alert volume.
- **Invite links or any non-admin route into a shared Circle.** Unrelated and previously dropped.

## Further Notes

- The uncommitted-at-the-time glossary entry for **Same-Store Price Change** already described the behaviour this spec implements; the code simply never did. Treat that entry as the contract for the new per-Store function.
- The biggest risk is silent scope leakage: a price feature that reads purchase history directly and forgets to group by Store would re-introduce exactly the bug being fixed. Keeping the rule in a single exported function, and keeping `calculatePriceChange` store-unaware, is the structural defence.
- Ticket 23's research is complete (see that ticket's `## Answer` and the linked research document). Its conclusion is that AI-extracted text alone is not enough, that both the normalization pass and the human confirmation are required, and that the confirmation is the load-bearing one. It also rules out a printed store number as the primary key. The matching decisions above already absorb these findings.
- Expect fewer alerts overall, by design. Judge the change by whether the remaining alerts are ones the user acts on, not by their count.
- **Deferred during implementation: bundling a purchase's Store fields into one type.** Review flagged `storeId`, `storeNameEn` and `storeNameZh` as a data clump: the three travel together through about eight types, from `Purchase` through the price trend, store comparison, leaderboard and headline price change, and the receipt list and home page carry the two names on their own. It was left as is, on purpose. Bundling them changes no behaviour but touches every price feature's types, fixtures and tests, on a branch that is already large and still waits on its migrations — so a mistake there would be hard to see in review. The shape also needs a decision of its own: when `storeId` is null the names are the Receipt Header, not a Store's, so it is not obvious the bundle is "a Store". Better done as its own change once this one has merged.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题陈述

一个连锁超市有很多分店，同一件商品在各家分店的价格并不一样。现在的应用分不出它们：一张小票只记了店**名**，所以在应用眼里全国所有 Woolworths 都是同一家 Store。

更糟的是，比价压根不看门店。`calculatePriceChange()` 取的是某商品最近两次正常价 Purchase，不管它们是在哪买的——于是价格异常提醒可能只是因为 PAK'nSAVE 的牛奶比 New World 便宜，这是"两家不同的店"这个事实，不是涨价。不同连锁的商品名往往还对不上，所以其中一些比较，比的甚至根本不是同一件东西。

结果就是一份没人信的提醒列表。用户想知道的只有一件事：**我常去的那家店，这件商品涨价了吗？**

## 解决方案

给 Store 加上分店，并把分店作为一切比价的单位。

扫小票时，AI 把抬头拆成连锁和分店（"Woolworths" / "Hornby"），用户在现有的预览界面里确认——就是他们本来就在用来确认商品的那个界面。确认后的小票指向一条 **Store** 记录：一条真实的、按 Circle 隔离的数据，而不是一串松散的文本。

于是所有回答"这个涨价了吗"的地方都收窄到单一 Store：商品详情页的涨幅数字、15% 的价格异常提醒、月报的涨幅排行榜。两家不同分店的两次购买不再算涨幅；那是门店比价，应用本来就有一个模块干这事。而那个模块和价格趋势图，在新模型下反而**更有用**了——"不同区售价不同"正是它们存在的意义——所以两者也一并从连锁级下沉到分店级。

消耗速度有意不收窄。东西买回来就是要用掉的，跟哪家分店卖的无关。

## 用户故事

1. 作为购物者，我希望应用记录每张小票来自哪家分店，这样我的价格历史才反映我真正去的地方。
2. 作为购物者，我希望 AI 自动从小票抬头读出分店，这样我不用每次购物都手动输入。
3. 作为购物者，我希望在我本来就在改商品名的那个界面里改正分店，这样我不必再学一套新流程。
4. 作为购物者，我希望能从我已经去过的分店里挑选，这样同一家分店不会攒出三种略有出入的写法。
5. 作为购物者，我希望抬头没印分店的小票也能记录，这样一张读不出分店的小票不会把我整张小票都卡住。
6. 作为购物者，我希望"分店未知"的小票与我的具名分店保持隔离，这样应用永远不会宣称一个它站不住脚的涨幅。
7. 作为购物者，我希望只有在同一件商品于同一家分店涨价时才收到提醒，这样我收到的提醒都是能据以行动的。
8. 作为购物者，我希望不再收到因跨连锁价差而产生的提醒，这样通知列表不再狼来了。
9. 作为购物者，我希望商品详情页的涨幅数字标明它说的是哪家分店，这样我知道这个数字在讲哪家店。
10. 作为购物者，我希望月报的涨幅排行榜写明每条涨幅背后的分店，这样报告能告诉我该别去哪儿买。
11. 作为购物者，我希望在三家分店都买过的商品只占排行榜一行而不是三行，这样一个商品不会把报告其余部分挤掉。
12. 作为购物者，我希望价格趋势图按分店画成多条线，这样我能看出某家分店正在比邻近几家越涨越贵。
13. 作为购物者，我希望促销价的购买仍然画在趋势图上、但永远不作为涨幅基准，这样图既诚实，又不会把一次特价误当成降价。
14. 作为购物者，我希望门店比价模块列的是分店而不是连锁，这样"哪儿最便宜"指向的是我真能开车去的那家店。
15. 作为购物者，我希望已有的小票在改动之后继续可用，这样切换到分店模型不会抹掉我已经攒起来的价格历史。
16. 作为购物者，我希望小票列表和小票详情页显示分店，这样我一眼就能分清两次购物。
17. 作为购物者，我希望 CSV 导出里包含分店，这样导出的数据和应用显示的一样精确。
18. 作为购物者，我希望分店名跟应用里其他名字一样按我选的语言显示，这样切到中文时不会有英文孤零零留在页面上。
19. 作为购物者，我希望查重继续能抓到我传了两遍的小票，这样新的 Store 模型不会悄悄弄坏一个本来好用的功能。
20. 作为购物者，我希望在旧的跨连锁规则下已经发出的提醒保持原样，这样我的通知历史不会在我背后被改写。
21. 作为购物者，我希望在某家分店只买过一次的商品在那里显示"没有涨幅"而不是"涨幅为零"，这样"没数据"和"没变化"能区分开。
22. 作为 Circle 成员，我希望分店列表在圈子内共享，这样我伴侣的小票和我的会落到同一批 Store 上。
23. 作为 Circle 成员，我希望消耗速度和库存预估继续把所有分店的购买算在一起，这样按分店切分不会让应用以为我快用完了其实没有的东西。
24. 作为 Global Admin，我希望合并 Circle 时把 Store 一起带过去，这样合并两个家庭不会把它们的价格历史丢在原地。
25. 作为开发者，我希望"按分店收窄"这条规则只活在一个函数里，这样将来新增的价格功能不会又不小心跨店比价。
26. 作为开发者，我希望购买历史仍然一次批量查询加载，这样加了 Store 不会把 `fetchPurchaseHistories` 存在的意义——避免 N+1——重新引回来。
27. 作为开发者，我希望术语表把 Store 和 Branch 定义清楚，这样列名、类型和测试名对同一个概念只用一个词。

## 实现决定

下面有若干条，是在替 wayfinder ticket 24–28 尚未决定的问题拍板。每一条这样的决定都标了 **[假设 → NN]**：这是 spec 给出的答案，目的是不让实现被阻塞；若要推翻，去对应那张 ticket。

### Store 实体

- 新建 `stores` 表，**按 Circle 隔离**，和 Product 现在的做法一致：`circle_id`、连锁名（`_en`/`_zh` 双语一对）、分店名（第二对双语）。连锁是 Store 上的一个文本列，而不是单独一张表——本 spec 里没有任何东西需要连锁级的记录，现在造一个纯属臆测。**[假设 → 24]**
- **分店为空即"分店未知"**，这是一个正常且长期存在的状态，不是一个待清理的错误。因为它是一条独立的 Store 记录，未知分店的 Store 天然不可能被拿去和具名分店比较——这个隔离是数据模型的结果，不需要额外一条规则。**[假设 → 24]**
- 唯一性按 Circle 在"连锁 + 分店"上约束，空分店视作一个独立取值，这样同一个圈子里不会出现两条同一分店的记录。
- `receipts` 新增 `store_id` 外键。现有的 `store_name_en`/`store_name_zh` 两列**保留**，存放这张小票上 OCR 读到的原文——和 `receipt_items` 与 `product_id` 已有的关系一模一样：行自己保留一份原始名字，旁边放解析出来的关联。这样当某次解析事后被发现是错的，证据还在。**[假设 → 24]**
- `stores` 的 RLS 策略照抄 `products`：成员只能读写自己圈子的数据。
  - **实现时修订：成员也可以删除没有小票指向的 Store。** `products` 没有删除策略，`stores` 起初也没有。加上它，是为了下面"Store 在确认时创建"这条决定。为了让那条决定成立，确认或编辑在新建了 Store 之后、后续写入失败时，会把这家 Store 删掉——否则确认失败后被放弃的草稿，会在每个成员的选择器里留下一家没有小票的 Store，正是那条决定要防止的垃圾分店。策略收得和这个需求一样窄：只能删自己圈子里的 Store，而且只在没有小票指向它时才能删，所以有任何历史的 Store 都不可能被删掉。清理是尽力而为——如果删除也失败了，Store 会留下，用户仍会看到确认失败的原因。还剩一种竞态，和新建 Store 时已知的那种同类：如果另一个成员的确认恰好在删除前一刻找到了这家新 Store，他的确认随后会失败，重试会重新创建这家 Store。
- `merge_users_into_new_circle` 必须把 `stores` 和 products、receipts、alerts 一起带过去。只搬小票不搬它们的 Store，会打断外键，把被合并家庭的价格历史丢在原地。
- 迁移写进 `supabase/migrations/`，通过 Supabase MCP 工具应用并在本地留底。`src/types/database.types.ts` 是手工推导的，所以新表、新列和新的外键 `Relationships` 条目必须在同一个 commit 里落地，否则所有相关查询会悄悄退化成 `any`。

### 识别与解析 Store

- `recognizeReceipt` 把连锁和分店作为两组独立的双语字段返回，JSON 响应 schema 和结果类型都要加。抬头没写分店时，模型返回空分店，而不是猜一个。现有的店名字段保留，原始抬头文本仍然被记录。**[假设 → 25]**
  - **实现时修订：草稿保存 AI 识别出的结果，响应被截断时给出看得懂的错误。** 这两件事是这一条需要、但没写明的。第一，AI 识别出的连锁和分店保存在草稿上，放在 `receipts` 新增的四列里（`recognized_chain_en/zh`、`recognized_branch_en/zh`）。服务端只在识别时写一次草稿，预览页之后才加载它——用户可能中途离开再回来——所以这组拆分必须存在中间某处，否则选择器只能从打印的抬头起步，做不到"预填 AI 识别出的内容"。这几列只存 AI 的识别结果，从不指向某个 Store，所以和"草稿在确认之前没有 Store"并不冲突。这几列出现之前保存的草稿，它们是空的，选择器会以抬头作为连锁、分店未知起步。第二，测试决定里要求测"返回格式错误"的情形，但没说那时应该怎样。长小票可能撞上响应的 token 上限，返回被截断的、不合法的 JSON，以前用户看到的是原始的 `SyntaxError`；现在会提示识别结果不完整，建议重试或拍一段更短的部分。如今 JSON 里多了连锁/分店拆分、变得更长，截断更容易发生——这是在这里顺手修掉它的原因。和应用里其他兜底提示一样，它目前只有英文。
- 新模块 `src/lib/stores.ts` 负责两件事：列出本圈子的 Store（供选择器用），以及把一对连锁/分店解析成 Store、不存在就新建。它有两个调用方——预览界面和确认流程——这正是它该是一个模块而不是私有函数的原因。
- **匹配是精确匹配，但必须先经过一轮真正的归一化**，在圈子范围内比对连锁和分店的英文文本。ticket 23 的研究发现：同一个连锁内部，印出来的分店并没有统一形式——区名、街名、商场名、业态前缀、"区名+街名"复合写法都存在，`Rd` 和 `Road` 并用，分隔符不一致，连语序都不固定（"Church Corner Woolworths" 对 "Countdown Newmarket"）。所以归一化必须：忽略大小写、合并空白、去掉毛利地名的长音符（热敏打印机极可能印成 `Mangere` 而不是 `Māngere`）、展开常见街道缩写、统一分隔符。**[假设 → 25]**
- **连锁名需要一张别名表**，因为连锁名本身随时间不稳定：Countdown → Woolworths 的更名 2025 年 12 月才完成，所以在任何跨年度的历史里，同一家实体分店会横跨两个印出来的连锁名。没有别名表，回填会把一个家庭最常去、记录最长的那家店劈成两条。
- **除此之外不做模糊匹配。** 接近但不相等时给用户一个候选列表，而不是替他猜。研究的结论是：光靠归一化没法让这个身份可靠——人工确认那一步是**承重**的，不是锦上添花，将来不要把它优化掉。
- **印在小票上的门店编号不是那个键。** Woolworths NZ 有公开的四位门店编号，但另外三家连锁都不公开，而且有没有任何编号真的印上小票也未经证实。如果将来确认某个编号稳定存在，把它当作加强匹配的信号，绝不当作主身份。
- Foodstuffs 系（New World、PAK'nSAVE）的门店是各自独立业主经营的，所以它们的小票上除了品牌，很可能还印着该店的经营公司名和 GST 号。识别 prompt 必须明确说明**品牌**才是连锁，免得模型把经营公司名当成店名返回。
- **Store 记录在"确认"时创建，而不是在"保存草稿"时。** 草稿里存的是原始文本，外加用户可能从已有 Store 里挑中的 `store_id`。这样被放弃或删掉的草稿不会在选择器里留下垃圾分店——这很重要，否则一次读错的分店会污染圈子里每个成员都看得到的那份列表。**[假设 → 25]**
  - **实现时修订：草稿不保存用户选的门店。** 这条决定里真正要紧的那一半照做了：Store 仍然在确认时创建，绝不提前。可选的那个用户挑中的 `store_id` 是有意不做的，原因有三。第一，应用里没有"保存草稿"这一步可以挂靠——草稿由服务器在识别时写入一次，预览页在点"确认"之前什么都不写——所以做它就意味着选择器每改一次都要写一次数据库。第二，这个选择只在一次操作之内有用：复核在同一个页面里完成，用户离开后再回来，选择器会根据 AI 读到的内容重新推出同样的匹配。第三，带着 `store_id` 的草稿会和术语表矛盾——术语表里 Draft 在确认之前没有 Store——而且小票列表和首页会开始用一家它还没有的 Store 来命名这张草稿。读取的那一半已经就位：草稿要是带着 `store_id`，选择器会优先选它——所以如果日后发现丢掉选择确实碍事，可以再补上。
  - **实现时修订：拒绝空的连锁名。** 选择器允许用户在"新分店"或"分店未知"时清空连锁名，这时确认会建出一家连锁名和 key 都为空的 Store——在每个成员的选择器里显示为空白，是这条决定要挡在外面的另一种垃圾。所以门店模块在连锁名归一化后什么都不剩（为空，或只有空格和句点）时拒绝解析，不做任何查找或创建。"确认"和"保存"按钮遵循同一规则，连锁名为空时保持禁用，所以这个拒绝本身只是兜底，用户正常情况下碰不到。连锁名为空时，连锁输入框下会用中英文提示需要先填写连锁名才能继续，所以按钮不会无缘无故被禁用。拒绝本身的报错信息目前只有英文，和应用里其他兜底错误一样。
- 预览界面新增门店选择器，提供：本圈子已有的 Store、"新建为一家分店"（用 AI 读到的内容预填）、以及"分店未知"。位置就在现在店名输入框所在的地方。
- 编辑已确认的小票可以改它的 Store，复用同一个选择器。Store 的改动像其他 Correction 一样记入 `EditLog`。沿用编辑场景已有的先例：改 Store **不会**追溯地重发或撤回提醒。**[假设 → 25]**
  - **实现时修订：小票的 Store 或日期改动和对应的 `EditLog` 行在同一个事务里写入。** `EditLog` 按设计只能追加——没有更新或删除策略——一行写进去就收不回来。应用以前先发一次请求写 Store 改动的日志，下一次请求再更新小票。如果更新失败，日志里就留下一条从没发生过的 Store 改动，每次重试还会再记一条；编辑时的购买日期日志也有同样的问题。所以 0001 迁移新增一个 Postgres 函数 `update_receipt_with_log`，在同一个事务里改小票的状态、Store 和购买日期，并插入对应的 `EditLog` 行——要么都成功，要么都不做。确认和编辑都改用它。它是 security invoker，调用者自己的 RLS 照常生效：只有上传者能改这张小票，每一行都记为当前登录用户的编辑。如果这张小票不是调用者能改的，函数会报错，而不是只提交日志行。商品改动保留原来的路径：它们的日志记录的是真正保存了的改动，重试时会和已保存的值比较，所以不会重复。先更新、后记日志的做法被排除了，因为两步之间一旦失败，就会留下一条完全没有日志的改动——这正是只追加的审计记录要防止的缺口。
- **查重逻辑不变**：继续按原始店名 + 日期 + 总金额判定。它要回答的是"这张小票我是不是已经传过了"，而日期加总金额本来就接近决定性；收紧到 `store_id` 反而会漏掉一张分店解析结果不同的真重复，而那是代价更大的错误。**[假设 → 25]**

### 收窄比价

- `fetchPurchaseHistories` 在每条 `Purchase` 上返回 `storeId`，与它已经返回的店名并列。它仍然是一次批量查询；Store 的引入绝不能让它变成一个商品一次、或一家门店一次查询。
- `priceChange.ts` 新导出**一个**纯函数，接收某商品的购买记录，按 Store 返回各自的 Same-Store Price Change。`calculatePriceChange` 本身保持不知道门店、保持不变——它继续回答"这两次购买之间发生了什么"，由新函数决定哪些购买该被放在一起。于是"按分店收窄"这条规则只存在于一个地方。
  - **实现时修订：导出两个函数，共用一个私有的分组。** 调用方问的是两个不同的问题。排行榜要每家 Store 的涨幅，从中挑最大的，所以调用 `calculatePriceChangesByStore`。价格异常检测和商品详情页的标题涨幅各自只要某一家指定 Store 的涨幅——刚确认的小票所在的 Store，或最近一次购买所在的 Store——所以调用 `priceChangeAtStore`，它还会返回参与比较的那两次购买——价格异常检测要用到：用基准那次的日期判断是否过期，用现价写进提醒。如果让这两个调用方去完整的按 Store 列表里找自己那一家，两处会重复同样的查找，还会算出一堆随即丢掉的涨幅。这一条要守住的东西仍然成立：两个导出函数都不自己给购买分组，都从同一个私有函数 `recordsByStore` 出发——它是唯一决定哪些购买属于同一家 Store 的代码——而 `calculatePriceChange` 仍然不知道门店。所以"按分店收窄"这条规则仍只存在于一个地方，只是入口有两个。
- **商品详情页的头条涨幅数字**取自最近一次 Purchase 所在 Store 的 Same-Store Price Change，并携带那个 Store 以便界面标注。理由：这一页的头条数字应该回答"我常去的那家店涨了吗"，而最近一次购买是对"常去那家"的最佳可得近似。**[假设 → 27]**
- **月报排行榜**保持一个商品一行，按该商品在各 Store 中最大的那个涨幅排序，并在行上注明是哪家 Store。一个商品占三行会把一份只有五行的报告挤爆。**[假设 → 27]**
  - **实现时修订：只算该商品当月有正常价购买的 Store。** 评审发现"在各 Store 中"照字面理解会往回看得太远。报告挑的是本月买过的商品，读的却是每个商品的全部购买历史，所以本月只在 Hornby 买过的牛奶，可能被列成"+25% · Riccarton"，而 Riccarton 的两次购买都在一年前。旧的单对比较规则下，涨幅总会用到最近一次购买，所以这个缺口是改成按 Store 比较之后才出现的。这样的一行和报告"本月涨幅"的定位矛盾，也违背了用户故事 10 的本意——报告要告诉购物者该别去哪儿买，一家一年没去过的 Store 不在此列。所以每个商品只在报告当月有正常价购买的 Store 之间排名。促销购买不会让一家 Store 被算进来：促销从不参与比较（第 10 节），所以一家当月只有促销购买的 Store，它的涨幅仍来自更早的正常价购买——一年前的涨幅又会占住这一行，正是这条修订要去掉的那种过时的行。被算进来的 Store 保留它的全部历史，所以本月的价格仍会和同一家 Store 的上一次价格比较，无论那是多久以前。还留着一个这个分支之前就有的缺口：看过去某个月的报告时，那个月之后的购买仍会算进 Store 的涨幅。
- **价格异常提醒**只与该小票所属 Store 的更早 Purchase 比较——因为提醒是按小票触发的，门店是明确的。阈值仍是 15%，是"超过"而非"达到"。
- **提醒新增一条时效上限**：如果那家 Store 的基准 Purchase 已经超过大约六个月，就不发提醒，但商品详情页仍然显示这个涨幅。收窄到单一分店会让"基准很旧"变得常见得多，而"你上次在这儿买还便宜 20%，那是十个月前"是通胀，不是异常。这是本 spec 唯一一处**新增**规则而非收窄既有规则的地方——如果提醒变得太安静，第一个该回退的就是它。**[假设 → 27]**
- 在旧的跨店规则下已经发出的提醒保持原样，不做追溯修正。
- `compareStores` 由按店名英文归组改为按 `storeId`。它"少于两条就不显示"的规则现在数的是分店，所以一个在同一连锁两家分店购物的家庭，会看到以前看不到的比价。
- `buildPriceTrend` 返回的点携带 `storeId`，供图表拆成多个序列。促销购买仍然绘制、仍然排除在涨幅基准之外，与现在完全一致。
- **消耗速度保持跨分店。** 它读的是同一份购买历史，必须继续无视 Store；应该写一个测试把这一点钉死，免得后续重构出于"一致性"把它也收窄了。库存提醒随之不变。

### 存量数据

- 回填时，每个 Circle 里每个不同的原始店名建**一条 Store**，分店留空（未知），并把每张已有小票指过去。**[假设 → 26]**
- 回填**有意不去**从 "Countdown Hornby" 这样的名字里拆出区名。拆错会凭空捏造一家分店，把本来要保住的历史反而弄脏；留作一条未知分店的 Store 是可挽回的，用户之后可以通过编辑小票来更正。
- 实际影响比乍看要小：原本店名相同的小票仍然共享同一条 Store，它们之间的比价照常工作。立刻停止的是**跨店名**的比价——而那正是要修的 bug。
- 在写迁移之前，先统计每个 Circle 的现有小票数和不同店名数并报出来。如果数量小到人工指定分店是可行的，那值得在"自动回填是唯一选项"之前先提出来。
  - **实现时修订：回填用的是手工确认的映射，而不是上面的自动规则。** 统计结果很小——11 个不同店名下共 19 张已确认小票，全在同一个 Circle——所以按这一条的要求提出了人工指定，用户手工确认了一份映射。它和自动规则有两处不同，都是因为用户知道每张小票实际是在哪里买的。同一家店的不同拼写被合并："Pak n Save Albany"、"Pak'nSave Albany" 和只印了 "PAK'nSAVE" 的小票归为一条 Store，而自动规则会把同一家店的历史拆成三份。分店也被指定了，包括只印了连锁名的抬头（"New World" → Hobsonville，"Costco Wholesale" → Westgate）——这不是从文字里拆出区名（那依然不做），而是因为用户说了是哪家分店。用户确认不了的店名保留未知分店。映射限定在那一个 Circle，所以其他任何地方的已确认小票都会让迁移中止，而不是继承这些分店。

### 呈现

- 趋势图**按 Store 画成多条线**。只有一次购买的 Store 渲染成一个孤立的点，而不是一条看不见的零长线段。**[假设 → 28]**
- 序列配色来自 `:root` 里新增的设计 token，并在 `prefers-color-scheme: dark` 覆盖块里给出对应值——不在组件里写死颜色。
- 图例条目用分店名，分店未知时回退到连锁名，以保证标签短到能塞进手机屏幕。
  - **实现时修订：两家分店名相同的 Store 用「连锁 分店」标注。** 评审发现了一种这一条没有覆盖的情况。分店名只在同一连锁内唯一，而一个区里常常有好几家超市，所以一件在 PAK'nSAVE Albany 和 New World Albany 都买过的商品，图例里会出现两条都写着 "Albany" 的条目，只能靠颜色区分这两条线，图例也就失去了意义。所以同一张图上两家 Store 会得到相同标签时，这两家都改用 Store 的全名，即连锁加分店（"PAK'nSAVE Albany"、"New World Albany"）。其余条目照这一条的要求保持简短——只有短标签有歧义的地方才用长标签，手机宽度的图例只在必要时变长。比较的是当前显示语言下的标签，所以只在一种语言里撞名的两家 Store，在那种语言下也会被区分开。
- 门店比价模块和趋势图并排放在商品详情页，现在两者都按分店切分。要不要其中一个吸收另一个，是留给原型的呈现问题，spec 不合并它们。
- 分店要出现在小票列表、小票详情页、排行榜行和 CSV 导出里。
  - **实现时修订：小票列表的门店搜索也匹配 Store 的名字。** 这一条只要求显示分店。但列表一旦用 Store 而不是打印的抬头来命名小票，搜索如果还只匹配抬头，就和用户看到的对不上：列表里显示"PAK'nSAVE Albany"、抬头印的是"Pak n Save Albany"的小票，搜"PAK'nSAVE"会搜不到；按分店搜，也会漏掉所有抬头只印了连锁名的小票。所以搜索现在匹配打印的抬头，或 Store 的连锁名、分店名，中英文都算。PostgREST 的 `.or()` 不能穿过 `stores` 嵌入来过滤，所以先查出匹配的 Store，再按 `store_id` 匹配小票——每次搜索多一次查询。匹配方式仍是和以前一样的子串搜索，不用归一化的 key：这是个搜索框，不是 Store 身份识别。
  - **实现时修订：CSV 保留 `store_name_en`/`store_name_zh` 两列，并新增 Store 的连锁名。** 这两列存的是 Receipt Header——小票上印的店名——而术语表说不要把它叫作 Store 名。仍按原名保留，是有意的：CSV 是用户从应用里带走的文件，会进表格或脚本，改列名会悄悄弄坏按列名读取它的东西。它们存的内容也没变，本来就一直是打印的抬头。Store 改放在新增的列里：除了这一条要求的分店，现在还有 `chain_name_en`/`chain_name_zh`，即 Store 自己的连锁名，放在分店前面，两者合起来就是这家 Store。没有它的话，一行会把打印的连锁和 Store 的分店拼在一起——抬头印着 "Countdown"、实际归到一家 Woolworths Store 的小票，会读成 Countdown 加一个 Woolworths 的分店。小票没有 Store 时，这两组新列都留空；分店未知的 Store 仍有连锁名。
- 店名和分店名都是 Bilingual Name，走和其他所有双语名字相同的机制，没有译文时回退到 Source Text。新增的固定界面文案（选择器标签、"分店未知"、图例标题）要在 `i18n.ts` 里补上中英两份 key。
  - **实现后修订：Store 的名字只显示英文。** AI 给超市名起的中文译名很别扭——Woolworths 译成"羊毛超市"、Costco 译成"好市多批发"——而品牌名本来就是购物者在店门口看到的样子，所以用户决定两种语言下都显示英文。新建 Store 时 `chain_name_zh` 和 `branch_name_zh` 一律留空，不管 AI 读出了什么译文；回填的 8 条 Store 的译名由后续一个 migration 清空。它们读取时仍走 Bilingual Name 机制，回退到 Source Text，所以显示端无需改动。这两列保留，`receipts.store_name_zh` 也保留：Receipt Header 仍保留译文，因为它是读取结果的证据，不是 Store 的名字。
- 重写 `CONTEXT.md` 的 **Store** 词条——Store 不再"只是印在它的 Receipt 上的那个名字"——并新增 **Branch** 词条。这件事和改 schema 放在同一次改动里做，不要事后补。

## 测试决定

这里的好测试断言的是调用方能观察到的东西：给定这样一份购买历史，返回什么涨幅；给定这样一张小票，是否触发提醒。它不断言跑了几次查询、过滤器以什么顺序调用、调了哪个私有函数。"按分店"这条规则本身是可观察的——两次在不同 Store 的购买之间不产生涨幅——所以完全可以透过现有公开函数来测。

- **`priceChange.ts` 里新增的按 Store 函数**承担主要覆盖，作为纯函数完全不需要 mock：跨两家 Store 的购买产生两份互不相干的结果；某家 Store 只有一次正常价购买时返回"没有"而不是零；促销购买在两端都被排除；未知分店的 Store 永不与具名分店合并。参照：现有的 `priceChange.test.ts` 和 `consumptionRate.test.ts`，通篇都是纯输入纯输出。
- **`priceSpikeAlerts.ts`** 针对以前算错的那些情形补测试：两次购买在不同 Store 时不触发；在同一家 Store 涨幅超过 15% 时恰好触发一条；基准超出时效上限时不触发。
- **`consumptionRate.ts`** 补一个测试，钉死"分散在多家 Store 的购买仍然合在一起计算"——这是给一个**不该发生**的收窄准备的回归护栏。
- **`purchaseHistory.ts`** 扩展现有测试，断言 `storeId` 被传出来，并继续钉死"多个商品只发一次查询"。它的测试本来就是把一个普通对象作为参数传进去，不需要 `vi.mock`。
- **`stores.ts`** 透过 `src/test/fakeSupabase.ts`（ticket 18 建的共享 fake：回放预置行、记录调用）来测：解析到已有 Store 时直接返回、不插入；解析到没见过的分店时插入一条；空白和大小写不同的写法归一化后解析到同一条 Store。
- **`recognizeReceipt`** 本来就 mock 掉 Anthropic 调用并断言解析结果；为"抬头带分店""抬头不带分店""返回格式错误"三种情形扩展用例。
- **`productDetail.ts`、`priceChangeLeaderboard.ts`、`storeComparison.ts`、`priceTrend.ts`** 保持现有测试形态，只改 fixture 和预期值。
- 边界 mock 的约定不变：mock `@/lib/supabaseClient`，绝不 mock supabase-js 内部；优先用共享 fake，不要手搓 chain。
- 遵循本仓库的 TDD 习惯：上面每一条行为，先写一个失败的测试，再写让它通过的代码。`npm run typecheck` 覆盖 `src`、`api` 和 Vite 配置，所以漏改 `database.types.ts` 会在那里暴露出来。

## 范围之外

- **合并"其实是同一家分店"的两条 Store 记录。** OCR 措辞漂移和连锁改名（Countdown → Woolworths）迟早会产生历史被劈开的重复记录。本 spec 的"精确匹配 + 选择器"让这种情况变得少见，但合并工具本身是一个独立功能，需要它自己关于"谁有权执行"的决定。
- **连锁级视角。** "我在 Woolworths 整体上花多少钱"这里没有任何东西在回答。它该不该存在，是分店界面做完之后的结果，不是它的前提。
- **自动从历史店名里拆出区名。** 上面已明确否决，不是延后。
- **门店地址、定位、营业时间，或在地图上选店。** 价格这个问题里没有任何一环需要它们。
- **按商品或按门店静音提醒。** 仍然不做；这一轮降低噪音的手段就是收窄比价范围。
- **改动 15% 这个阈值本身。** 这次加的是时效上限；百分比维持原样，等有了新提醒量的实际证据再说。
- **邀请链接，或任何非管理员进入共享 Circle 的通道。** 无关，且早已放弃。

## 补充说明

- 当时尚未提交的那条 **Same-Store Price Change** 术语条目，描述的正是本 spec 要实现的行为；只是代码从来没做到。把那条词条当作新函数的契约。
- 最大的风险是范围悄悄泄漏：某个价格功能直接去读购买历史、忘了按 Store 分组，就会把要修的 bug 原样带回来。把规则收在一个导出函数里、让 `calculatePriceChange` 保持不知道门店，是结构上的防线。
- ticket 23 的 research 已完成（见该 ticket 的 `## Answer` 与研究文档）。结论是：仅靠"AI 抽两个文本字段"不够，归一化和人工确认两步都必须有，其中人工确认是承重的。它也排除了"用门店编号当主键"这条路。上面关于匹配的决定已经吸收了这些发现。
- 预期提醒总量会变少，这是设计目标。评判这次改动，看的是剩下的提醒用户会不会据以行动，而不是看它们的条数。
- **实现时暂缓：把一次购入的 Store 字段合成一个类型。** 评审指出 `storeId`、`storeNameEn`、`storeNameZh` 是一组 Data Clumps：这三个字段总是一起出现，贯穿约八个类型——从 `Purchase` 到价格走势、多店比价、涨价排行榜和标题价格变化；小票列表和首页则单独带着那两个名字。这里有意没动。合并它们不改变任何行为，却要改动每个价格功能的类型、测试数据和测试，而这个分支已经很大、还在等迁移落地——在这里出错，评审时很难看出来。合并后的形状本身也需要单独决定：`storeId` 为空时，这两个名字是小票抬头而不是某个 Store 的名字，所以这个合并类型是不是"一个 Store"并不显然。等这次改动合并后，作为独立的改动来做更合适。
