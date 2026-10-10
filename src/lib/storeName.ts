// Relative + `.js`, not the `@/` alias: src/lib/purchaseHistory.ts imports
// this, and `api/` imports that at runtime (api/cron/low-stock-check.ts).
import { bilingualName, type BilingualName } from "./bilingualName.js";

// A Store's name as one line: its chain, then its branch if it has one —
// each falling back to its Source Text when it has no Translation.
export function storeName(store: {
  chain_name_en: string;
  chain_name_zh: string | null;
  branch_name_en: string | null;
  branch_name_zh: string | null;
}): BilingualName {
  const chain = bilingualName(store.chain_name_en, store.chain_name_zh);
  if (store.branch_name_en === null) {
    return chain;
  }
  const branch = bilingualName(store.branch_name_en, store.branch_name_zh);
  return { en: `${chain.en} ${branch.en}`, zh: `${chain.zh} ${branch.zh}` };
}
