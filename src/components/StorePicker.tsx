import type { ReceiptDraft } from "@/lib/receipts";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, type Language } from "@/lib/bilingual";
import { bilingualName } from "@/lib/bilingualName";
import {
  matchingStore,
  storeChoiceOf,
  storeKey,
  UNKNOWN_BRANCH_NAME,
  type Store,
  type StoreChoice,
} from "@/lib/stores";

// The picker's values for "create this as a new branch" and "branch
// unknown"; any other value is an existing Store's id.
const NEW_BRANCH = "new";
const UNKNOWN_BRANCH = "unknown";

// What the picker holds: which option is picked, plus the chain/branch typed
// into the fields — kept while another option is picked, so switching back
// doesn't lose them.
export interface StorePick {
  pickedStoreId: string;
  typed: StoreChoice;
}

// What the fields start on: the AI's chain/branch split, or — for a draft
// saved before the split existed — the printed header as the chain with the
// branch unknown, the same Store the backfill gives an old receipt.
function initialStore(draft: ReceiptDraft): StoreChoice {
  return (
    draft.recognizedStore ?? {
      chain: { en: draft.receiptHeader.en, zh: draft.receiptHeader.zh },
      branch: UNKNOWN_BRANCH_NAME,
    }
  );
}

// Where the picker starts: the Store a confirmed receipt already points at;
// else the Store matching what the AI read, if the Circle has one; else
// "branch unknown" when no branch was read, else "new branch".
export function initialStorePick(stores: Store[], draft: ReceiptDraft): StorePick {
  const typed = initialStore(draft);
  const match =
    stores.find((store) => store.id === draft.storeId) ?? matchingStore(stores, typed);
  const pickedStoreId = match
    ? match.id
    : storeKey(typed.chain.en, typed.branch.en).branchKey === null
      ? UNKNOWN_BRANCH
      : NEW_BRANCH;
  return { pickedStoreId, typed };
}

// The chain/branch to confirm or save the receipt with.
export function pickedStore(stores: Store[], pick: StorePick): StoreChoice {
  const picked = stores.find((candidate) => candidate.id === pick.pickedStoreId);
  if (picked) return storeChoiceOf(picked);
  if (pick.pickedStoreId === UNKNOWN_BRANCH) {
    return { chain: pick.typed.chain, branch: UNKNOWN_BRANCH_NAME };
  }
  return pick.typed;
}

function storeLabel(store: Store, language: Language, branchUnknown: string): string {
  const chain = bilingualName(store.chainNameEn, store.chainNameZh);
  const name = pickText(chain.en, chain.zh, language);
  if (store.branchNameEn === null) return `${name} (${branchUnknown})`;
  const branch = bilingualName(store.branchNameEn, store.branchNameZh);
  return `${name} ${pickText(branch.en, branch.zh, language)}`;
}

interface StorePickerProps {
  stores: Store[];
  value: StorePick;
  onChange: (pick: StorePick) => void;
}

// Issue 29's store picker, shared by the preview screen and a confirmed
// receipt's edit mode: the Circle's Stores, "new branch" and "branch
// unknown". The Store itself is resolved, or created, by confirmReceipt /
// editConfirmedReceipt — the picker only says which chain and branch.
export default function StorePicker({ stores, value, onChange }: StorePickerProps) {
  const { language, t } = useLanguage();

  // A retyped name no longer matches the AI's translation of the old one, so
  // the Translation is dropped rather than kept stale.
  function rename(part: keyof StoreChoice, en: string) {
    onChange({ ...value, typed: { ...value.typed, [part]: { en, zh: null } } });
  }

  return (
    <fieldset>
      <label>
        {t("review.store")}
        <select
          value={value.pickedStoreId}
          onChange={(event) => onChange({ ...value, pickedStoreId: event.target.value })}
        >
          {stores.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {storeLabel(candidate, language, t("review.branchUnknown"))}
            </option>
          ))}
          <option value={NEW_BRANCH}>{t("review.newBranch")}</option>
          <option value={UNKNOWN_BRANCH}>{t("review.branchUnknown")}</option>
        </select>
      </label>
      {(value.pickedStoreId === NEW_BRANCH || value.pickedStoreId === UNKNOWN_BRANCH) && (
        <label>
          {t("review.chain")}
          <input
            value={value.typed.chain.en}
            onChange={(event) => rename("chain", event.target.value)}
          />
        </label>
      )}
      {value.pickedStoreId === NEW_BRANCH && (
        <label>
          {t("review.branch")}
          <input
            value={value.typed.branch.en}
            onChange={(event) => rename("branch", event.target.value)}
          />
        </label>
      )}
    </fieldset>
  );
}
