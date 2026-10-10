// Relative + `.js`, not the `@/` alias: src/lib/purchaseHistory.ts imports
// this, and `api/` imports that at runtime (api/cron/low-stock-check.ts).
import { bilingualName, type BilingualName } from "./bilingualName.js";

interface StoreNames {
  chain_name_en: string;
  chain_name_zh: string | null;
  branch_name_en: string | null;
  branch_name_zh: string | null;
}

// A Store's name as one line: its chain, then its branch if it has one —
// each falling back to its Source Text when it has no Translation.
export function storeName(store: StoreNames): BilingualName {
  const chain = bilingualName(store.chain_name_en, store.chain_name_zh);
  if (store.branch_name_en === null) {
    return chain;
  }
  const branch = bilingualName(store.branch_name_en, store.branch_name_zh);
  return { en: `${chain.en} ${branch.en}`, zh: `${chain.zh} ${branch.zh}` };
}

// A Store's name short enough for a phone-width chart legend: its branch
// alone, or its chain when the branch is unknown.
export function storeShortName(store: StoreNames): BilingualName {
  return store.branch_name_en === null
    ? bilingualName(store.chain_name_en, store.chain_name_zh)
    : bilingualName(store.branch_name_en, store.branch_name_zh);
}
