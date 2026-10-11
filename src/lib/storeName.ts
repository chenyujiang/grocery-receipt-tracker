// Relative + `.js`, not the `@/` alias: src/lib/purchaseHistory.ts imports
// this, and `api/` imports that at runtime (api/cron/low-stock-check.ts).
import { bilingualName, type BilingualName } from "./bilingualName.js";

// A Store's four name columns, as stored.
export interface StoreNames {
  chain_name_en: string;
  chain_name_zh: string | null;
  branch_name_en: string | null;
  branch_name_zh: string | null;
}

// Whether a branch name names a branch — the one place that decides a
// Store's branch is unknown: no name at all, or the empty text the AI writes
// for a branch it couldn't read.
export function isKnownBranch(branchNameEn: string | null): branchNameEn is string {
  return Boolean(branchNameEn);
}

// A Store's name as one line: its chain, then its branch if it has one —
// each falling back to its Source Text when it has no Translation.
export function storeName(store: StoreNames): BilingualName {
  const chain = bilingualName(store.chain_name_en, store.chain_name_zh);
  if (!isKnownBranch(store.branch_name_en)) {
    return chain;
  }
  const branch = bilingualName(store.branch_name_en, store.branch_name_zh);
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
  return isKnownBranch(store.branch_name_en)
    ? bilingualName(store.branch_name_en, store.branch_name_zh)
    : bilingualName(store.chain_name_en, store.chain_name_zh);
}
