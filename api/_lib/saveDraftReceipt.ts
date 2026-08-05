import { supabaseAdmin } from "./supabaseAdmin.js";
import type { RecognizedItem, RecognizedReceipt } from "./recognizeReceipt.js";

// Sections 3.2, 5.2, 5.3: writes the pending_review draft. An item with no
// AI-suggested match gets a new Product row first (category comes from the
// AI's suggestion for this recognition call, per Section 9's "no match yet"
// rule) so ReceiptItem.product_id always points at a real Product.
export interface SaveDraftReceiptParams {
  circleId: string;
  uploadedBy: string;
  originalImageUrl: string | null;
  receipt: RecognizedReceipt;
}

export interface SaveDraftReceiptResult {
  receiptId: string;
}

async function resolveProductId(circleId: string, item: RecognizedItem): Promise<string> {
  if (item.matchedProductId) {
    return item.matchedProductId;
  }

  const { data: product, error } = await supabaseAdmin
    .from("products")
    .insert({
      circle_id: circleId,
      canonical_name_en: item.rawNameEn,
      canonical_name_zh: item.rawNameZh,
      category: item.category,
    })
    .select()
    .single();
  if (error || !product) {
    throw error ?? new Error("Failed to create product");
  }
  return product.id;
}

export async function saveDraftReceipt(
  params: SaveDraftReceiptParams
): Promise<SaveDraftReceiptResult> {
  const { data: receipt, error: receiptError } = await supabaseAdmin
    .from("receipts")
    .insert({
      circle_id: params.circleId,
      uploaded_by: params.uploadedBy,
      store_name_en: params.receipt.storeNameEn,
      store_name_zh: params.receipt.storeNameZh,
      purchase_date: params.receipt.purchaseDate,
      total_amount: params.receipt.totalAmount,
      original_image_url: params.originalImageUrl,
      status: "pending_review",
    })
    .select()
    .single();
  if (receiptError || !receipt) {
    throw receiptError ?? new Error("Failed to save receipt");
  }

  const itemRows = await Promise.all(
    params.receipt.items.map(async (item) => ({
      receipt_id: receipt.id,
      raw_name_en: item.rawNameEn,
      raw_name_zh: item.rawNameZh,
      product_id: await resolveProductId(params.circleId, item),
      quantity: item.quantity,
      unit_spec_value: item.unitSpecValue,
      unit_spec_unit: item.unitSpecUnit,
      unit_price: item.unitPrice,
      original_price: item.originalPrice,
      is_promotion: item.isPromotion,
      subtotal: item.subtotal,
    }))
  );

  const { error: itemsError } = await supabaseAdmin.from("receipt_items").insert(itemRows);
  if (itemsError) {
    throw itemsError;
  }

  return { receiptId: receipt.id };
}
