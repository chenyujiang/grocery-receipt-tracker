import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchReceiptDraft, confirmReceipt, type ReceiptDraft, type DraftItem } from "@/lib/receipts";

// Section 6, 15 page 2 (preview/confirm): the review step is the safety net
// for OCR errors — user edits each field before it counts toward statistics.
export default function ReceiptReview() {
  const { receiptId } = useParams<{ receiptId: string }>();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!receiptId) return;
    fetchReceiptDraft(receiptId)
      .then((loaded) => {
        setDraft(loaded);
        setItems(loaded.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load receipt"));
  }, [receiptId]);

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
      await confirmReceipt(
        receiptId,
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
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm receipt");
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
        <p>加载中… Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>确认小票 Confirm Receipt</h1>
      <p>
        {draft.storeNameZh} {draft.storeNameEn} · {draft.purchaseDate}
      </p>

      {items.map((item, index) => (
        <fieldset key={item.id}>
          <label>
            商品名 Name (EN)
            <input
              value={item.rawNameEn}
              onChange={(event) => updateItem(index, "rawNameEn", event.target.value)}
            />
          </label>
          <label>
            商品名 Name (ZH)
            <input
              value={item.rawNameZh}
              onChange={(event) => updateItem(index, "rawNameZh", event.target.value)}
            />
          </label>
          <label>
            数量 Quantity
            <input
              type="number"
              value={item.quantity}
              onChange={(event) => updateItem(index, "quantity", Number(event.target.value))}
            />
          </label>
          <label>
            单价 Unit price
            <input
              type="number"
              value={item.unitPrice}
              onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={item.isPromotion}
              onChange={(event) => updateItem(index, "isPromotion", event.target.checked)}
            />
            促销价 Promotion
          </label>
          <p>分类 Category: {item.category ?? "—"}</p>
        </fieldset>
      ))}

      <button type="button" onClick={handleConfirm} disabled={confirming}>
        {confirming ? "确认中… Confirming…" : "确认 Confirm"}
      </button>
    </div>
  );
}
