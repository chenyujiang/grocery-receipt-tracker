import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fetchReceipts, type ReceiptListItem, type ReceiptFilters } from "@/lib/receiptList";
import { fetchCircleMembers, type CircleMember } from "@/lib/circleMembers";
import { useLanguage } from "@/lib/LanguageProvider";
import { pickText } from "@/lib/bilingual";

// Section 15, page 3: historical receipts, filterable by store/date/uploader.
export default function ReceiptList() {
  const { language } = useLanguage();
  const [receipts, setReceipts] = useState<ReceiptListItem[] | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [storeQuery, setStoreQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");

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

  return (
    <div className="page">
      <h1>Receipts</h1>

      <form onSubmit={handleSubmit}>
        <label>
          Store
          <input
            type="text"
            value={storeQuery}
            onChange={(event) => setStoreQuery(event.target.value)}
            placeholder="Store name"
          />
        </label>
        <label>
          From
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <label>
          Uploader
          <select value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)}>
            <option value="">All</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {!error && receipts === null && <p>Loading…</p>}

      {!error && receipts !== null && receipts.length === 0 && <p>No receipts found.</p>}

      {!error && receipts !== null && receipts.length > 0 && (
        <ul>
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              {receipt.purchaseDate} · {pickText(receipt.storeNameEn, receipt.storeNameZh, language)} —
              ${receipt.totalAmount.toFixed(2)}
              {receipt.status === "pending_review" && (
                <>
                  {" "}
                  · <Link to={`/receipts/${receipt.id}/review`}>Needs review</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
