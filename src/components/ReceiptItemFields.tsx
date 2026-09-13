import { useLanguage } from "@/lib/LanguageProvider";
import type { DraftItem } from "@/lib/receipts";

// The fixed set src/lib/units.ts actually normalizes (GRAMS_PER_UNIT /
// ML_PER_UNIT). Anything outside it silently falls through to an "each"
// basis in the price-trend and consumption-rate math, with no error — so a
// typo'd unit would quietly corrupt those numbers (issue 16).
const SPEC_UNITS = ["g", "kg", "ml", "L"];

interface ReceiptItemFieldsProps {
  item: DraftItem;
  onChange: <K extends keyof DraftItem>(field: K, value: DraftItem[K]) => void;
}

// Issue 17: one editor for one ReceiptItem, rendered by both flows that edit
// one — ReceiptReview (before confirming) and ReceiptDetail's edit mode
// (after). The two used to keep separate copies of these controls, which is
// how the weight/volume spec ended up editable only post-confirm.
//
// Controlled and stateless: the owning page holds the item list and decides
// what a change means. `category` deliberately isn't here — it belongs to the
// Product, not the ReceiptItem (spec.md Section 5.2), so a page that wants to
// display it renders it itself.
export default function ReceiptItemFields({ item, onChange }: ReceiptItemFieldsProps) {
  const { t } = useLanguage();

  return (
    <fieldset>
      <label>
        {t("review.nameEn")}
        <input
          value={item.rawNameEn}
          onChange={(event) => onChange("rawNameEn", event.target.value)}
        />
      </label>
      <label>
        {t("review.nameZh")}
        <input
          value={item.rawNameZh}
          onChange={(event) => onChange("rawNameZh", event.target.value)}
        />
      </label>
      <label>
        {t("review.quantity")}
        <input
          type="number"
          value={item.quantity}
          onChange={(event) => onChange("quantity", Number(event.target.value))}
        />
      </label>
      <label>
        {t("review.unitPrice")}
        <input
          type="number"
          value={item.unitPrice}
          onChange={(event) => onChange("unitPrice", Number(event.target.value))}
        />
      </label>
      {item.unitSpecUnit !== null && (
        <>
          <label>
            {t("detail.specValue")}
            <input
              type="number"
              value={item.unitSpecValue ?? ""}
              onChange={(event) => onChange("unitSpecValue", Number(event.target.value))}
            />
          </label>
          <label>
            {t("detail.specUnit")}
            <select
              value={item.unitSpecUnit}
              onChange={(event) => onChange("unitSpecUnit", event.target.value)}
            >
              {SPEC_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        <input
          type="checkbox"
          checked={item.isPromotion}
          onChange={(event) => onChange("isPromotion", event.target.checked)}
        />
        {t("review.promotion")}
      </label>
    </fieldset>
  );
}
