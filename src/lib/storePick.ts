import type { ReceiptDraft } from "@/lib/receipts";
import { isKnownBranch } from "@/lib/storeName";
import {
  hasChain,
  matchingStore,
  storeAsRead,
  storeChoiceFromNames,
  type Store,
  type StoreChoice,
} from "@/lib/stores";

// The store picker's values for "create this as a new branch" and "branch
// unknown"; any other value is an existing Store's id.
export const NEW_BRANCH = "new";
export const UNKNOWN_BRANCH = "unknown";

// What the picker holds: which option is picked, plus the chain/branch typed
// into the fields — kept while another option is picked, so switching back
// doesn't lose them.
export interface StorePick {
  pickedStoreId: string;
  typed: StoreChoice;
}

// Where the picker starts: the Store a confirmed receipt already points at;
// else the Store matching what the AI read, if the Circle has one; else
// "branch unknown" when no branch was read, else "new branch".
export function initialStorePick(
  stores: Store[],
  draft: Pick<ReceiptDraft, "storeId" | "recognizedStore" | "receiptHeader">
): StorePick {
  const typed = storeAsRead(draft);
  const match =
    stores.find((store) => store.id === draft.storeId) ?? matchingStore(stores, typed);
  const pickedStoreId = match
    ? match.id
    : isKnownBranch(typed.branch?.en ?? null)
      ? NEW_BRANCH
      : UNKNOWN_BRANCH;
  return { pickedStoreId, typed };
}

// The chain/branch to confirm or save the receipt with; none until the
// picker has a pick.
export function storeChoiceFromPick(stores: Store[], pick: StorePick | null): StoreChoice | null {
  if (!pick) return null;
  const picked = stores.find((candidate) => candidate.id === pick.pickedStoreId);
  if (picked) return storeChoiceFromNames(picked);
  if (pick.pickedStoreId === UNKNOWN_BRANCH) {
    return { chain: pick.typed.chain, branch: null };
  }
  return pick.typed;
}

// Whether the pick names a chain, which confirm and save need (resolveStore
// refuses a blank one) — the one check both pages' buttons and the
// picker's hint read, so they can't disagree.
export function pickHasChain(stores: Store[], pick: StorePick | null): boolean {
  const choice = storeChoiceFromPick(stores, pick);
  return choice !== null && hasChain(choice);
}
