import { supabase } from "@/lib/supabaseClient";

export interface UploadReceiptResult {
  receiptId: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => {
      // reader.result is a data URL: "data:image/jpeg;base64,<data>"
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

// Section 6: photo upload -> backend OCR + translation + product-match call.
export async function uploadReceipt(file: File): Promise<UploadReceiptResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw sessionError ?? new Error("Not signed in");
  }

  const imageBase64 = await fileToBase64(file);

  const response = await fetch("/api/receipts/recognize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({ imageBase64, mediaType: file.type }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Upload failed with status ${response.status}`);
  }

  return (await response.json()) as UploadReceiptResult;
}

export interface DraftItem {
  id: string;
  rawNameEn: string;
  rawNameZh: string;
  quantity: number;
  unitSpecValue: number | null;
  unitSpecUnit: string | null;
  unitPrice: number;
  originalPrice: number | null;
  isPromotion: boolean;
  subtotal: number;
  productId: string | null;
  category: string | null;
}

export interface ConfirmReceiptItemUpdate {
  id: string;
  rawNameEn: string;
  rawNameZh: string;
  quantity: number;
  unitSpecValue: number | null;
  unitSpecUnit: string | null;
  unitPrice: number;
  originalPrice: number | null;
  isPromotion: boolean;
  subtotal: number;
}

export interface ReceiptDraft {
  id: string;
  storeNameEn: string;
  storeNameZh: string;
  purchaseDate: string;
  totalAmount: number;
  status: string;
  originalImageUrl: string | null;
  items: DraftItem[];
}

// Section 6: the preview/confirm screen reads the AI-generated draft —
// category comes from the matched Product, not from ReceiptItem itself
// (spec.md Section 5.2).
export async function fetchReceiptDraft(receiptId: string): Promise<ReceiptDraft> {
  const { data: receiptRow, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, store_name_en, store_name_zh, purchase_date, total_amount, status, original_image_url"
    )
    .eq("id", receiptId)
    .single();
  if (receiptError || !receiptRow) {
    throw receiptError ?? new Error("Receipt not found");
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("receipt_items")
    .select(
      "id, raw_name_en, raw_name_zh, quantity, unit_spec_value, unit_spec_unit, unit_price, original_price, is_promotion, subtotal, product_id, products(category)"
    )
    .eq("receipt_id", receiptId);
  if (itemsError) {
    throw itemsError;
  }

  // Cast at the boundary: without generated Database types, supabase-js's
  // select-string parser can't tell this is a to-one embed (receipt_items
  // .product_id -> products.id) and infers `products` as an array type,
  // even though PostgREST returns a single object at runtime here.
  const items = (itemRows ?? []) as unknown as Array<{
    id: string;
    raw_name_en: string;
    raw_name_zh: string;
    quantity: number;
    unit_spec_value: number | null;
    unit_spec_unit: string | null;
    unit_price: number;
    original_price: number | null;
    is_promotion: boolean;
    subtotal: number;
    product_id: string | null;
    products: { category: string } | null;
  }>;

  return {
    id: receiptRow.id,
    storeNameEn: receiptRow.store_name_en,
    storeNameZh: receiptRow.store_name_zh,
    purchaseDate: receiptRow.purchase_date,
    totalAmount: receiptRow.total_amount,
    status: receiptRow.status,
    originalImageUrl: receiptRow.original_image_url,
    items: items.map((row) => ({
      id: row.id,
      rawNameEn: row.raw_name_en,
      rawNameZh: row.raw_name_zh,
      quantity: row.quantity,
      unitSpecValue: row.unit_spec_value,
      unitSpecUnit: row.unit_spec_unit,
      unitPrice: row.unit_price,
      originalPrice: row.original_price,
      isPromotion: row.is_promotion,
      subtotal: row.subtotal,
      productId: row.product_id,
      category: row.products?.category ?? null,
    })),
  };
}

// Section 6: user reviews/corrects each field, then confirms. Field-level
// EditLog history (spec.md Section 5.4) is deferred to a later pass — this
// writes the corrected values and flips status, no audit trail yet.
export async function confirmReceipt(
  receiptId: string,
  items: ConfirmReceiptItemUpdate[]
): Promise<void> {
  for (const item of items) {
    const { error } = await supabase
      .from("receipt_items")
      .update({
        raw_name_en: item.rawNameEn,
        raw_name_zh: item.rawNameZh,
        quantity: item.quantity,
        unit_spec_value: item.unitSpecValue,
        unit_spec_unit: item.unitSpecUnit,
        unit_price: item.unitPrice,
        original_price: item.originalPrice,
        is_promotion: item.isPromotion,
        subtotal: item.subtotal,
      })
      .eq("id", item.id);
    if (error) {
      throw error;
    }
  }

  const { error: statusError } = await supabase
    .from("receipts")
    .update({ status: "confirmed" })
    .eq("id", receiptId);
  if (statusError) {
    throw statusError;
  }
}
