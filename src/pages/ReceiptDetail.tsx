import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchReceiptDraft, editConfirmedReceipt, type ReceiptDraft, type DraftItem } from "@/lib/receipts";
import { useAuth } from "@/lib/AuthProvider";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";
import MonthPickerField from "@/components/MonthPickerField";

const SPEC_UNITS = ["g", "kg", "ml", "L"];

function parseDateString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Picking a new month must keep the existing day-of-month rather than
// resetting it to the 1st (issue 16) — MonthPickerField only knows about
// months, but purchase_date needs day precision preserved.
function withMonthKeepingDay(newMonth: Date, currentDate: Date): Date {
  const year = newMonth.getFullYear();
  const month = newMonth.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(currentDate.getDate(), lastDayOfMonth));
}

// Section 15, page 3 + issue 16: a confirmed receipt's own uploader can
// toggle an inline edit mode to fix OCR mistakes — name/quantity/unit
// price/promotion (already editable pre-confirm), plus the purchase month
// and the weight/volume spec (only for items that already have one).
// Anyone else still gets the read-only view below.
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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load receipt"));
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
        items.map((item) => ({
          id: item.id,
          productId: item.productId,
          rawNameEn: item.rawNameEn,
          rawNameZh: item.rawNameZh,
          quantity: item.quantity,
          unitSpecValue: item.unitSpecValue,
          unitSpecUnit: item.unitSpecUnit,
          unitPrice: item.unitPrice,
          originalPrice: item.originalPrice,
          isPromotion: item.isPromotion,
          subtotal: item.subtotal,
        }))
      );
      load();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
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
            <MonthPickerField
              label={t("detail.purchaseDate")}
              value={purchaseDate}
              onChange={(newMonth) => {
                if (!newMonth || !purchaseDate) return;
                setPurchaseDate(withMonthKeepingDay(newMonth, purchaseDate));
              }}
            />
          </div>

          {items.map((item, index) => (
            <fieldset key={item.id}>
              <label>
                {t("review.nameEn")}
                <input
                  value={item.rawNameEn}
                  onChange={(event) => updateItem(index, "rawNameEn", event.target.value)}
                />
              </label>
              <label>
                {t("review.nameZh")}
                <input
                  value={item.rawNameZh}
                  onChange={(event) => updateItem(index, "rawNameZh", event.target.value)}
                />
              </label>
              <label>
                {t("review.quantity")}
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, "quantity", Number(event.target.value))}
                />
              </label>
              <label>
                {t("review.unitPrice")}
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value))}
                />
              </label>
              {item.unitSpecUnit !== null && (
                <>
                  <label>
                    {t("detail.specValue")}
                    <input
                      type="number"
                      value={item.unitSpecValue ?? ""}
                      onChange={(event) =>
                        updateItem(index, "unitSpecValue", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    {t("detail.specUnit")}
                    <select
                      value={item.unitSpecUnit}
                      onChange={(event) => updateItem(index, "unitSpecUnit", event.target.value)}
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
                  onChange={(event) => updateItem(index, "isPromotion", event.target.checked)}
                />
                {t("review.promotion")}
              </label>
            </fieldset>
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
