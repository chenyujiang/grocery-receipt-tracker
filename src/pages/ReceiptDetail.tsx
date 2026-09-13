import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchReceiptDraft,
  editConfirmedReceipt,
  toItemUpdate,
  type ReceiptDraft,
  type DraftItem,
} from "@/lib/receipts";
import { useAuth } from "@/lib/AuthProvider";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";
import { formatDateString, parseDateString } from "@/lib/dateRange";
import DatePickerField from "@/components/DatePickerField";
import ReceiptItemFields from "@/components/ReceiptItemFields";
import { errorMessage } from "@/lib/errorMessage";

// Section 15, page 3 + issue 16: a confirmed receipt's own uploader can
// toggle an inline edit mode to fix OCR mistakes — the shared
// ReceiptItemFields editor (issue 17), plus the receipt-level purchase date,
// which is this flow's alone. Anyone else still gets the read-only view below.
export default function ReceiptDetail() {
  const { language, t } = useLanguage();
  const { session } = useAuth();
  const { receiptId } = useParams<{ receiptId: string }>();

  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [purchaseDate, setPurchaseDate] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    if (!receiptId) return;
    fetchReceiptDraft(receiptId)
      .then(setDraft)
      .catch((err) => setError(errorMessage(err, "Failed to load receipt")));
  }

  useEffect(load, [receiptId]);

  function startEditing() {
    if (!draft) return;
    setItems(draft.items);
    setPurchaseDate(parseDateString(draft.purchaseDate));
    setEditing(true);
  }

  function updateItem<K extends keyof DraftItem>(index: number, field: K, value: DraftItem[K]) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  }

  async function handleSave() {
    if (!receiptId || !purchaseDate) return;
    setError(null);
    setSaving(true);
    try {
      await editConfirmedReceipt(
        receiptId,
        formatDateString(purchaseDate),
        items.map(toItemUpdate)
      );
      load();
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to save changes"));
    } finally {
      setSaving(false);
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

  const canEdit = draft.uploadedBy === session?.userId;

  return (
    <div className="page">
      <h1>{t("detail.title")}</h1>

      <div className="receipt-detail-header">
        <p className="receipt-detail-store">
          {pickText(draft.storeNameEn, draft.storeNameZh, language)}
        </p>
        <p className="receipt-detail-meta">
          {draft.purchaseDate} · ${draft.totalAmount.toFixed(2)}
        </p>
      </div>

      {editing ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <DatePickerField
              label={t("detail.purchaseDate")}
              value={purchaseDate}
              onChange={setPurchaseDate}
            />
          </div>

          {items.map((item, index) => (
            <ReceiptItemFields
              key={item.id}
              item={item}
              onChange={(field, value) => updateItem(index, field, value)}
            />
          ))}

          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            <button type="button" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? t("detail.saving") : t("detail.save")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              {t("detail.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="receipt-detail-items">
            {draft.items.map((item) => (
              <div key={item.id} className="receipt-detail-item">
                <span className="receipt-detail-item-name">
                  {pickText(item.rawNameEn, item.rawNameZh, language)}
                </span>
                <span className="receipt-detail-item-meta">
                  {item.quantity} × ${item.unitPrice.toFixed(2)}
                  {item.unitSpecUnit !== null && (
                    <>
                      {" "}
                      ({item.unitSpecValue}
                      {item.unitSpecUnit})
                    </>
                  )}
                  {item.isPromotion && <> · {t("review.promotion")}</>}
                  {item.category && <> · {categoryLabel(item.category, language)}</>}
                </span>
              </div>
            ))}
          </section>

          {canEdit && (
            <button type="button" className="btn-block" onClick={startEditing}>
              {t("detail.edit")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
