// No imports, and relative imports of it only: src/lib/storeName.ts imports
// this, and `api/` imports that at runtime.

// The normalized match keys for a Store, stored as stores.chain_key /
// stores.branch_key. Matching is exact on these keys, so everything that
// should count as "the same branch" has to collapse to the same string here.
export interface StoreKey {
  chainKey: string;
  // Null means branch unknown: its own Store, never matched to a named branch.
  branchKey: string | null;
}

// Street-type abbreviations, spelled out so "Smith St" and "Smith Street"
// key alike. "St" also abbreviates Saint ("St Lukes"); that's harmless, since
// it's expanded the same way wherever it's printed.
const STREET_ABBREVIATIONS: Record<string, string> = {
  rd: "road",
  st: "street",
  ave: "avenue",
  dr: "drive",
};

function normalize(text: string): string {
  return (
    text
      // Decompose ā into a + combining macron, then drop the mark.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // "D.H." and "DH", "Rd." and "Rd", "PAK'nSAVE" and "PAKnSAVE" are the
      // same thing printed differently — straight or curly apostrophe.
      .replace(/[.'‘’]/g, "")
      .replace(/[-–—,/]/g, " ")
      .replace(/\b(rd|st|ave|dr)\b/g, (_, abbreviation: string) => STREET_ABBREVIATIONS[abbreviation])
      .trim()
      .replace(/\s+/g, " ")
  );
}

// Chain names that changed over time, keyed by their normalized form. The
// Countdown -> Woolworths rebrand finished in December 2025, so one physical
// branch appears under both names in any multi-year history. Also catches a
// chain's known alternative spellings.
const CHAIN_ALIASES: Record<string, string> = {
  countdown: "woolworths",
  "pak n save": "paknsave",
  "pakn save": "paknsave",
};

// A branch's match key: null — branch unknown — for no name at all, or one
// that normalizes away to nothing, like a stray "." or "-" OCR read.
export function branchKey(branchEn: string | null): string | null {
  return normalize(branchEn ?? "") || null;
}

export function storeKey(chainEn: string, branchEn: string | null): StoreKey {
  const chain = normalize(chainEn);
  return { chainKey: CHAIN_ALIASES[chain] ?? chain, branchKey: branchKey(branchEn) };
}
