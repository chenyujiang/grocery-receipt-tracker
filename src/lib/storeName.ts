// Relative + `.js`, not the `@/` alias: src/lib/purchaseHistory.ts imports
// this, and `api/` imports that at runtime (api/cron/low-stock-check.ts).
import { bilingualName, type BilingualName } from "./bilingualName.js";
import { branchKey } from "./storeKey.js";
import type { Database } from "../types/database.types.js";

// A Store's four name columns, as stored.
export type StoreNames = Pick<
  Database["public"]["Tables"]["stores"]["Row"],
  "chain_name_en" | "chain_name_zh" | "branch_name_en" | "branch_name_zh"
>;

// Whether a branch name names a branch — the one place that decides a
// Store's branch is unknown, by its match key (branchKey): no name at all,
// the empty text the AI writes for a branch it couldn't read, or text that
// keys to nothing, like a stray ".". So a branch is named exactly when it's
// matched as one.
export function isKnownBranch(branchNameEn: string | null): branchNameEn is string {
  return branchKey(branchNameEn) !== null;
}

// A Store's chain and branch names apart — the branch null when it's
// unknown — each falling back to its Source Text when it has no Translation.
export function storeNameParts(store: StoreNames): {
  chain: BilingualName;
  branch: BilingualName | null;
} {
  return {
    chain: bilingualName(store.chain_name_en, store.chain_name_zh),
    branch: isKnownBranch(store.branch_name_en)
      ? bilingualName(store.branch_name_en, store.branch_name_zh)
      : null,
  };
}

// A Store's name as one line: its chain, then its branch if it has one.
export function storeName(store: StoreNames): BilingualName {
  const { chain, branch } = storeNameParts(store);
  if (!branch) {
    return chain;
  }
  return { en: `${chain.en} ${branch.en}`, zh: `${chain.zh} ${branch.zh}` };
}

// What storeName reads, embedded from a receipt's Store. Every select that
// names a receipt by its Store interpolates this, so they all embed alike.
export const STORE_NAMES_EMBED = "stores(chain_name_en, chain_name_zh, branch_name_en, branch_name_zh)";

// A receipt named by its Store, or by its Receipt Header when it has none —
// a draft, or one confirmed before Stores existed and not yet backfilled.
export function receiptStoreName(receipt: {
  store_name_en: string;
  store_name_zh: string | null;
  stores: StoreNames | null;
}): BilingualName {
  return receipt.stores
    ? storeName(receipt.stores)
    : bilingualName(receipt.store_name_en, receipt.store_name_zh);
}

// A Store's name short enough for a phone-width chart legend: its branch
// alone, or its chain when the branch is unknown.
export function storeShortName(store: StoreNames): BilingualName {
  const { chain, branch } = storeNameParts(store);
  return branch ?? chain;
}
