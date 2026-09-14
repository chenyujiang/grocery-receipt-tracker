Type: grilling
Status: open
GitHub: #19

## Question

Every module under `src/lib` that reads data calls `supabase.from(...)` directly, so the seam between this app and supabase-js runs through sixteen separate files rather than one. The cost lands in the tests: each of them has to re-fake supabase-js's chainable query builder by hand.

Needs deciding:

- What is the interface of a fake adapter that sits at that seam — one module per table, one per feature, or one query-shaped thing?
- What fidelity does the fake owe the real client? Filtering? Ordering? Embeds? Or is it a fixture store that only replays prepared rows?
- Does the adapter belong in front of `supabaseAdmin` too, or does the service-role client stay where it is?
- What happens to the 22 existing chain factories — converted, or left coexisting?

**Derived information** (from reading the code, 2026-09-13):

- 22 test files carry **~180 `as never` casts**; `src/lib/receipts.test.ts` alone has 45. The cast is needed because a hand-rolled chain object is not structurally a `PostgrestFilterBuilder` — it is missing `url`, `headers`, `method` and dozens of methods.
- **This is not fixed by generated schema types.** Issue 18's predecessor work (see "Already done" below) added a `Database` generic, which deleted all 7 production casts and left every one of the ~180 test casts in place. Typing the schema makes `from()`'s return type *more* specific, not easier to fake. The two problems share an entry point but are not the same problem.
- **22 chain factories live across 13 test files**, in two different shapes:
  - `src/lib/receiptList.test.ts:18` builds one object whose every method returns itself and which is itself thenable. Assertions name the method (`expect(chain.gte).not.toHaveBeenCalled()`), so they do not depend on call order. **Used in exactly one file.**
  - The other 21 (`home.test.ts` ×3, `monthlyReport.test.ts` ×5, `receipts.test.ts` ×3, …) nest a different object per method, so the test encodes the exact call sequence. Reordering two filters in production code breaks them even though the query is unchanged.
- `fetchPurchaseHistories` is already the one module that takes its client as a parameter rather than importing it (CLAUDE.md documents why). Its test passes a plain `{ from }` object straight in, with no `vi.mock` — the cheapest test of the sixteen. That is the shape the rest of the codebase does not have.

## Answer

_Not yet decided._

## Already done (prerequisite, not this issue)

The schema-typing half shipped separately on 2026-09-13:

- `src/types/database.types.ts` — hand-derived from `supabase/migrations/` in the shape `supabase gen types typescript` emits, with FK `Relationships` populated so supabase-js can resolve the to-one embeds.
- `createClient<Database>` at both call sites; `fetchPurchaseHistories` takes `SupabaseClient<Database>`.
- All 7 production `as unknown as` casts deleted.
- `_zh` columns are nullable in Postgres but were typed `string` in `src/types/index.ts`; the casts had been hiding that. Resolved as **Bilingual Name** in `CONTEXT.md` — a missing Translation reads back as its Source Text — with a regression test per read boundary.

## Open follow-ups not covered above

- `src/lib/exportCsv.ts`'s `fetchExportRows` has **no boundary test at all** (`exportCsv.test.ts` only covers `rowsToCsv`). Its Bilingual Name fallback is therefore compiler-checked but not behaviour-checked.
- `src/lib/alerts.ts` still falls back to `""` rather than the Source Text when a Product has no Translation — inconsistent with the rule now in `CONTEXT.md`, left alone because the compiler did not flag it.
- `npm run typecheck` covers `src` only: `tsconfig.app.json` has `"include": ["src"]` and nothing includes `api/`. The `/api` serverless functions are not type-checked by the repo's own command, so the `Database` generic on `supabaseAdmin` buys less than it looks like it does.
- `src/types/index.ts`'s hand-written row interfaces (`Circle`, `Profile`, `Receipt`, `ReceiptItem`, `Product`, `EditLog`, `ReceiptStatus`) are now **entirely unused** — only `Role` and `CATEGORIES` are imported anywhere — and they still declare the `_zh` columns non-nullable, which the database contradicts. They are a second, wrong source of truth for row shapes. Left in place rather than deleted, to keep this change scoped to the casts.
