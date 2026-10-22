import { supabaseAdmin } from "./supabaseAdmin.js";
import type { Database } from "../../src/types/database.types.js";
import type { RecognizedItem, RecognizedReceipt } from "./recognizeReceipt.js";

// Sections 3.2, 5.2, 5.3: writes the pending_review draft. An item with no
// AI-suggested match gets a new Product row first (category comes from the
// AI's suggestion for this recognition call, per Section 9's "no match yet"
// rule) so ReceiptItem.product_id always points at a real Product.
//
// Ticket 33: the receipt, its new Products and its items are written by one
// Postgres function (save_draft_receipt), so a failure partway leaves nothing
// behind rather than an empty receipt or orphaned Products.
export interface SaveDraftReceiptParams {
  circleId: string;
  uploadedBy: string;
  originalImageUrl: string | null;
  receipt: RecognizedReceipt;
}

export interface SaveDraftReceiptResult {
  receiptId: string;
}

type SaveDraftReceiptArgs = Database["public"]["Functions"]["save_draft_receipt"]["Args"];
type NewProductRow = SaveDraftReceiptArgs["p_new_products"][number];
type ItemRow = SaveDraftReceiptArgs["p_items"][number];

// Two lines on one receipt for the same new product (the same item scanned
// twice) must create one Product, not two. Matched on the English name — the
// OCR source text — ignoring case and surrounding whitespace; the first
// line's spelling, translation and category become the Product's.
function newProductKey(item: RecognizedItem): string {
  return item.rawNameEn.trim().toLowerCase();
}

// Turns the recognized items into both row sets save_draft_receipt takes: the
// deduped Products to create, and one receipt_items row per line, pointing at
// either an existing Product or its new one's index.
function planDraftRows(items: RecognizedItem[]): {
  newProducts: NewProductRow[];
  itemRows: ItemRow[];
} {
  const newProducts: NewProductRow[] = [];
  const indexByKey = new Map<string, number>();

  const itemRows = items.map((item): ItemRow => {
    let newProductIndex: number | null = null;
    if (!item.matchedProductId) {
      const key = newProductKey(item);
      const existing = indexByKey.get(key);
      if (existing === undefined) {
        newProductIndex = newProducts.length;
        indexByKey.set(key, newProductIndex);
        newProducts.push({
          canonical_name_en: item.rawNameEn,
          canonical_name_zh: item.rawNameZh,
          category: item.category,
        });
      } else {
        newProductIndex = existing;
      }
    }

    return {
      raw_name_en: item.rawNameEn,
      raw_name_zh: item.rawNameZh,
      product_id: item.matchedProductId,
      new_product_index: newProductIndex,
      quantity: item.quantity,
      unit_spec_value: item.unitSpecValue,
      unit_spec_unit: item.unitSpecUnit,
      unit_price: item.unitPrice,
      original_price: item.originalPrice,
      is_promotion: item.isPromotion,
      subtotal: item.subtotal,
    };
  });

  return { newProducts, itemRows };
}

export async function saveDraftReceipt(
  params: SaveDraftReceiptParams
): Promise<SaveDraftReceiptResult> {
  const { newProducts, itemRows } = planDraftRows(params.receipt.items);

  const { data: receiptId, error } = await supabaseAdmin.rpc("save_draft_receipt", {
    p_receipt: {
      circle_id: params.circleId,
      uploaded_by: params.uploadedBy,
      store_name_en: params.receipt.storeNameEn,
      store_name_zh: params.receipt.storeNameZh,
      // Issue 29: what the AI read, for the store picker to pre-fill. The
      // Store itself is only resolved on confirm.
      recognized_chain_en: params.receipt.chainNameEn,
      recognized_chain_zh: params.receipt.chainNameZh,
      recognized_branch_en: params.receipt.branchNameEn,
      recognized_branch_zh: params.receipt.branchNameZh,
      purchase_date: params.receipt.purchaseDate,
      total_amount: params.receipt.totalAmount,
      original_image_url: params.originalImageUrl,
    },
    p_new_products: newProducts,
    p_items: itemRows,
  });
  if (error || !receiptId) {
    throw error ?? new Error("Failed to save receipt");
  }

  return { receiptId };
}
