// Deliberately import-free. `api/cron/low-stock-check.ts` reaches this
// through src/lib/purchaseHistory.ts, so anything this module pulls in
// lands in the serverless bundle — which is why it lives here rather
// than beside pickText/categoryLabel in bilingual.ts, whose CATEGORIES
// import would drag the `@/` alias along with it.

/** A Bilingual Name read back: both languages present, neither ever blank. */
export type BilingualName = { en: string; zh: string };

// The one place the Bilingual Name read rule lives (CONTEXT.md): a Product,
// Store, or Receipt Item whose Translation was never produced reads back as
// its Source Text, not as blank. Every read of a `_en`/`_zh` column pair goes
// through here — before this existed the `?? source` rung was hand-written at
// eleven sites and four of them had quietly dropped it, rendering a nameless
// row in Chinese mode.
//
// Where a caller has two candidate pairs (a matched Product's canonical name
// and the receipt line's own OCR text), it picks per language on the way in —
// `bilingualName(canonical_en ?? raw_en, canonical_zh ?? raw_zh)` — rather
// than this taking a list. `??` associates, so that is the same expression
// the long hand-written chains spelled out.
export function bilingualName(
  sourceText: string,
  translation?: string | null
): BilingualName {
  return { en: sourceText, zh: translation ?? sourceText };
}
