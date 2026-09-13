import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchReceiptDraft,
  confirmReceipt,
  deleteReceipt,
  toItemUpdate,
  type ReceiptDraft,
  type DraftItem,
} from "@/lib/receipts";
import { findDuplicateReceipt, type DuplicateMatch } from "@/lib/duplicateCheck";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";
import ReceiptItemFields from "@/components/ReceiptItemFields";
import { errorMessage } from "@/lib/errorMessage";

// Section 6, 15 page 2 (preview/confirm): the review step is the safety net
// for OCR errors — user edits each field before it counts toward statistics.
// The per-item controls are ReceiptItemFields, shared with ReceiptDetail's
// post-confirm edit mode (issue 17).
export default function ReceiptReview() {
  const { language, t } = useLanguage();
  const { receiptId } = useParams<{ receiptId: string }>();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!receiptId) return;
    fetchReceiptDraft(receiptId)
      .then((loaded) => {
        setDraft(loaded);
        setItems(loaded.items);
        return findDuplicateReceipt({
          storeNameEn: loaded.storeNameEn,
          purchaseDate: loaded.purchaseDate,
          totalAmount: loaded.totalAmount,
          excludeReceiptId: loaded.id,
        });
      })
      .then(setDuplicate)
      .catch((err) => setError(errorMessage(err, "Failed to load receipt")));
  }, [receiptId]);

  async function handleDeleteDuplicate() {
    if (!receiptId) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteReceipt(receiptId);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Failed to delete receipt"));
      setDeleting(false);
    }
  }

  function updateItem<K extends keyof DraftItem>(index: number, field: K, value: DraftItem[K]) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  }

  async function handleConfirm() {
    if (!receiptId) return;
    setError(null);
    setConfirming(true);
    try {
      await confirmReceipt(receiptId, items.map(toItemUpdate));
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Failed to confirm receipt"));
    } finally {
      setConfirming(false);
    }
  }

  if (error) {
    return (
      <div className="page">
        <p role="alert">{error}</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="page">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t("review.title")}</h1>
      <p>
        {pickText(draft.storeNameEn, draft.storeNameZh, language)} · {draft.purchaseDate}
      </p>

      {duplicate && !duplicateDismissed && (
        <section>
          <h2>{t("review.duplicateTitle")}</h2>
          <p>
            {t("review.duplicateBody")} {new Date(duplicate.uploadedAt).toLocaleDateString()}.
          </p>
          <button type="button" className="btn-secondary" onClick={() => setDuplicateDismissed(true)}>
            {t("review.notDuplicate")}
          </button>{" "}
          <button type="button" onClick={handleDeleteDuplicate} disabled={deleting}>
            {deleting ? t("review.deleting") : t("review.confirmDuplicate")}
          </button>
        </section>
      )}

      {items.map((item, index) => (
        <div key={item.id}>
          <ReceiptItemFields
            item={item}
            onChange={(field, value) => updateItem(index, field, value)}
          />
          {/* Category is the Product's, not this line's (spec.md 5.2) — shown
              here for context, and deliberately not part of the editor. */}
          <p>
            {t("common.category")}: {item.category ? categoryLabel(item.category, language) : "—"}
          </p>
        </div>
      ))}

      <button type="button" className="btn-block" onClick={handleConfirm} disabled={confirming}>
        {confirming ? t("review.confirming") : t("review.confirm")}
      </button>
    </div>
  );
}
