import { useId } from "react";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, type Language } from "@/lib/bilingual";
import { isKnownBranch, storeName } from "@/lib/storeName";
import { nearMissStores, type Store, type StoreChoice } from "@/lib/stores";
import { NEW_BRANCH, pickHasChain, UNKNOWN_BRANCH, type StorePick } from "@/lib/storePick";

function storeLabel(store: Store, language: Language, branchUnknown: string): string {
  const name = storeName(store);
  const label = pickText(name.en, name.zh, language);
  return isKnownBranch(store.branch_name_en) ? label : `${label} (${branchUnknown})`;
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
  const candidatesLabelId = useId();
  const chainHintId = useId();
  // Confirm and Save stay disabled on a blank chain (resolveStore refuses
  // one), so the field says why.
  const chainBlank = !pickHasChain(stores, value);
  // Only while no existing Store is picked: a picked Store needs no offer.
  const candidates = stores.some((store) => store.id === value.pickedStoreId)
    ? []
    : nearMissStores(stores, value.typed);

  // A retyped name no longer matches the AI's translation of the old one, so
  // the Translation is dropped rather than kept stale. A cleared branch is
  // branch unknown again.
  function rename(part: keyof StoreChoice, en: string) {
    const name = part === "branch" && en === "" ? null : { en, zh: null };
    onChange({ ...value, typed: { ...value.typed, [part]: name } });
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
        <>
          <label>
            {t("review.chain")}
            <input
              value={value.typed.chain.en}
              onChange={(event) => rename("chain", event.target.value)}
              aria-describedby={chainBlank ? chainHintId : undefined}
            />
          </label>
          {chainBlank && <p id={chainHintId}>{t("review.chainRequired")}</p>}
        </>
      )}
      {value.pickedStoreId === NEW_BRANCH && (
        <label>
          {t("review.branch")}
          <input
            value={value.typed.branch?.en ?? ""}
            onChange={(event) => rename("branch", event.target.value)}
          />
        </label>
      )}
      {candidates.length > 0 && (
        <div role="group" aria-labelledby={candidatesLabelId}>
          <p id={candidatesLabelId}>{t("review.didYouMean")}</p>
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => onChange({ ...value, pickedStoreId: candidate.id })}
            >
              {storeLabel(candidate, language, t("review.branchUnknown"))}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
