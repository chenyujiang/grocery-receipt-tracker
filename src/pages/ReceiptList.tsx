import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fetchReceipts, type ReceiptListItem, type ReceiptFilters } from "@/lib/receiptList";
import { fetchCircleMembers, type CircleMember } from "@/lib/circleMembers";
import { deleteReceipt } from "@/lib/receipts";
import { monthBounds, startOfMonth } from "@/lib/dateRange";
import MonthPickerField from "@/components/MonthPickerField";
import { useAuth } from "@/lib/AuthProvider";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText } from "@/lib/bilingual";

const currentMonth = startOfMonth(new Date());

// Section 15, page 3: historical receipts, filterable by store/date/uploader.
export default function ReceiptList() {
  const { language, t } = useLanguage();
  const { session } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptListItem[] | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [storeQuery, setStoreQuery] = useState("");
  const [dateFromMonth, setDateFromMonth] = useState<Date | null>(null);
  const [dateToMonth, setDateToMonth] = useState<Date | null>(null);
  const [uploadedBy, setUploadedBy] = useState("");

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load(filters: ReceiptFilters) {
    setError(null);
    fetchReceipts(filters)
      .then(setReceipts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load receipts"));
  }

  useEffect(() => {
    load({});
    fetchCircleMembers()
      .then(setMembers)
      .catch(() => {
        // Non-fatal: the uploader dropdown just stays empty.
      });
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    load({
      storeQuery: storeQuery || undefined,
      dateFrom: dateFromMonth ? monthBounds(dateFromMonth).start : undefined,
      dateTo: dateToMonth ? monthBounds(dateToMonth).end : undefined,
      uploadedBy: uploadedBy || undefined,
    });
  }

  async function handleDelete(receiptId: string) {
    setError(null);
    setDeletingId(receiptId);
    try {
      await deleteReceipt(receiptId);
      setReceipts((current) => (current ?? []).filter((receipt) => receipt.id !== receiptId));
      setConfirmingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete receipt");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page">
      <h1>{t("receiptList.title")}</h1>

      <form onSubmit={handleSubmit}>
        <label>
          {t("receiptList.store")}
          <input
            type="text"
            value={storeQuery}
            onChange={(event) => setStoreQuery(event.target.value)}
            placeholder={t("receiptList.storePlaceholder")}
          />
        </label>
        <MonthPickerField
          label={t("receiptList.from")}
          value={dateFromMonth}
          onChange={setDateFromMonth}
          maxMonth={currentMonth}
          clearable
        />
        <MonthPickerField
          label={t("receiptList.to")}
          value={dateToMonth}
          onChange={setDateToMonth}
          maxMonth={currentMonth}
          clearable
        />
        <label>
          {t("receiptList.uploader")}
          <select value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)}>
            <option value="">{t("receiptList.all")}</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{t("receiptList.filter")}</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {!error && receipts === null && <p>{t("common.loading")}</p>}

      {!error && receipts !== null && receipts.length === 0 && <p>{t("receiptList.noneFound")}</p>}

      {!error && receipts !== null && receipts.length > 0 && (
        <ul className="receipt-list">
          {receipts.map((receipt) => (
            <li key={receipt.id} className="receipt-card">
              <div className="receipt-card-row">
                <span className="receipt-card-store">
                  {pickText(receipt.storeNameEn, receipt.storeNameZh, language)}
                </span>
                {receipt.status === "pending_review" && (
                  <span className="receipt-card-badge">{t("home.needsReview")}</span>
                )}
              </div>
              <div className="receipt-card-row">
                <span className="receipt-card-date">{receipt.purchaseDate}</span>
                <span className="receipt-card-amount">${receipt.totalAmount.toFixed(2)}</span>
              </div>
              <div className="receipt-card-actions-row">
                <Link
                  to={
                    receipt.status === "pending_review"
                      ? `/receipts/${receipt.id}/review`
                      : `/receipts/${receipt.id}`
                  }
                  className="receipt-card-view-btn"
                >
                  {receipt.status === "pending_review"
                    ? t("home.needsReview")
                    : t("receiptList.viewDetail")}
                </Link>
                {receipt.uploadedBy === session?.userId && (
                  <div className="receipt-card-actions">
                    {confirmingDeleteId === receipt.id ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setConfirmingDeleteId(null)}
                          disabled={deletingId === receipt.id}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => handleDelete(receipt.id)}
                          disabled={deletingId === receipt.id}
                        >
                          {deletingId === receipt.id
                            ? t("receiptList.deleting")
                            : t("receiptList.confirmDelete")}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => setConfirmingDeleteId(receipt.id)}
                      >
                        {t("receiptList.delete")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
