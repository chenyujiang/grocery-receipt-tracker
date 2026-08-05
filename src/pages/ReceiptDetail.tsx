import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchReceiptDraft, type ReceiptDraft } from "@/lib/receipts";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText, categoryLabel } from "@/lib/bilingual";

// Read-only view of a confirmed receipt (Section 15, page 3): confirming
// only locks the line items against further edits — the data is still in
// Supabase and stays viewable. Pending-review receipts still go through
// ReceiptReview instead, since those are still editable.
export default function ReceiptDetail() {
  const { language, t } = useLanguage();
  const { receiptId } = useParams<{ receiptId: string }>();

  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptId) return;
    fetchReceiptDraft(receiptId)
      .then(setDraft)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load receipt"));
  }, [receiptId]);

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
      <h1>{t("detail.title")}</h1>

      <div className="receipt-detail-header">
        <p className="receipt-detail-store">
          {pickText(draft.storeNameEn, draft.storeNameZh, language)}
        </p>
        <p className="receipt-detail-meta">
          {draft.purchaseDate} · ${draft.totalAmount.toFixed(2)}
        </p>
      </div>

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
    </div>
  );
}
