import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fetchReceipts, type ReceiptListItem, type ReceiptFilters } from "@/lib/receiptList";
import { fetchCircleMembers, type CircleMember } from "@/lib/circleMembers";
import { deleteReceipt } from "@/lib/receipts";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText } from "@/lib/bilingual";

// Section 15, page 3: historical receipts, filterable by store/date/uploader.
export default function ReceiptList() {
  const { language, t } = useLanguage();
  const [receipts, setReceipts] = useState<ReceiptListItem[] | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [storeQuery, setStoreQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
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
        <label>
          {t("receiptList.from")}
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          {t("receiptList.to")}
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
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
        <ul>
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              {receipt.purchaseDate} · {pickText(receipt.storeNameEn, receipt.storeNameZh, language)} —
              ${receipt.totalAmount.toFixed(2)}
              {receipt.status === "pending_review" && (
                <>
                  {" "}
                  · <Link to={`/receipts/${receipt.id}/review`}>{t("home.needsReview")}</Link>
                </>
              )}
              {" "}
              {confirmingDeleteId === receipt.id ? (
                <>
                  {t("receiptList.confirmDelete")}{" "}
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleDelete(receipt.id)}
                    disabled={deletingId === receipt.id}
                  >
                    {deletingId === receipt.id ? t("receiptList.deleting") : t("receiptList.delete")}
                  </button>{" "}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={deletingId === receipt.id}
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmingDeleteId(receipt.id)}
                >
                  {t("receiptList.delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
