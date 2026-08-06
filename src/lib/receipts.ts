import { supabase } from "@/lib/supabaseClient";
import { detectPriceSpikes, type ProductPriceHistory } from "@/lib/priceSpikeAlerts";
import { diffReceiptItemFields } from "@/lib/editLog";
import { resizeImageForUpload } from "@/lib/imageResize";

export interface UploadReceiptResult {
  receiptId: string;
}

// Section 6: photo upload -> backend OCR + translation + product-match call.
export async function uploadReceipt(file: File): Promise<UploadReceiptResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw sessionError ?? new Error("Not signed in");
  }

  // Downscaled to a JPEG here (phone camera photos are often too large for
  // the request otherwise, and occasionally in a format Claude rejects).
  const { base64: imageBase64, mediaType } = await resizeImageForUpload(file);

  const response = await fetch("/api/receipts/recognize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({ imageBase64, mediaType }),
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
  productId: string | null;
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
  uploadedBy: string;
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
// (spec.md Section 5.2). `uploadedBy` drives issue 16's edit-permission
// check (only the uploader may edit a confirmed receipt).
export async function fetchReceiptDraft(receiptId: string): Promise<ReceiptDraft> {
  const { data: receiptRow, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, uploaded_by, store_name_en, store_name_zh, purchase_date, total_amount, status, original_image_url"
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
    uploadedBy: receiptRow.uploaded_by,
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

// Shared by confirmReceipt and editConfirmedReceipt (issue 16): diff each
// item against whatever Supabase currently holds, log every changed field
// to EditLog, then write the update — status and price-spike alerts are
// each caller's own concern, not this loop's.
async function updateReceiptItemsWithLog(
  items: ConfirmReceiptItemUpdate[],
  editedBy: string
): Promise<void> {
  for (const item of items) {
    const { data: existingRow, error: fetchError } = await supabase
      .from("receipt_items")
      .select(
        "raw_name_en, raw_name_zh, quantity, unit_spec_value, unit_spec_unit, unit_price, original_price, is_promotion, subtotal"
      )
      .eq("id", item.id)
      .single();
    if (fetchError || !existingRow) {
      throw fetchError ?? new Error("Receipt item not found");
    }

    const changes = diffReceiptItemFields(
      {
        rawNameEn: existingRow.raw_name_en,
        rawNameZh: existingRow.raw_name_zh,
        quantity: existingRow.quantity,
        unitSpecValue: existingRow.unit_spec_value,
        unitSpecUnit: existingRow.unit_spec_unit,
        unitPrice: existingRow.unit_price,
        originalPrice: existingRow.original_price,
        isPromotion: existingRow.is_promotion,
        subtotal: existingRow.subtotal,
      },
      {
        rawNameEn: item.rawNameEn,
        rawNameZh: item.rawNameZh,
        quantity: item.quantity,
        unitSpecValue: item.unitSpecValue,
        unitSpecUnit: item.unitSpecUnit,
        unitPrice: item.unitPrice,
        originalPrice: item.originalPrice,
        isPromotion: item.isPromotion,
        subtotal: item.subtotal,
      }
    );

    if (changes.length > 0) {
      const { error: logError } = await supabase.from("edit_logs").insert(
        changes.map((change) => ({
          receipt_item_id: item.id,
          field_name: change.fieldName,
          old_value: change.oldValue,
          new_value: change.newValue,
          edited_by: editedBy,
        }))
      );
      if (logError) {
        throw logError;
      }
    }

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
}

// Section 6: user reviews/corrects each field, then confirms. Every changed
// field is logged to EditLog (Section 5.4) before the update is applied,
// diffed against whatever Supabase currently holds for that item.
export async function confirmReceipt(
  receiptId: string,
  items: ConfirmReceiptItemUpdate[]
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw userError ?? new Error("Not signed in");
  }

  await updateReceiptItemsWithLog(items, user.id);

  const { data: receiptRow, error: statusError } = await supabase
    .from("receipts")
    .update({ status: "confirmed" })
    .eq("id", receiptId)
    .select("circle_id")
    .single();
  if (statusError || !receiptRow) {
    throw statusError ?? new Error("Failed to confirm receipt");
  }

  await recordPriceSpikeAlerts(receiptRow.circle_id, receiptId, items);
}

// Issue 16: fixing a mistake on an already-confirmed receipt — the uploader
// only (enforced by the existing RLS policies, unchanged). Reuses the same
// per-item diff-then-log-then-update as confirmReceipt, plus the same
// treatment for the receipt-level purchase date. Deliberately does not
// touch status or re-run price-spike detection (issue 16, decision 4) —
// alerts already recorded at confirm-time stand as they are.
export async function editConfirmedReceipt(
  receiptId: string,
  purchaseDate: string,
  items: ConfirmReceiptItemUpdate[]
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw userError ?? new Error("Not signed in");
  }

  await updateReceiptItemsWithLog(items, user.id);

  const { data: existingReceipt, error: fetchError } = await supabase
    .from("receipts")
    .select("purchase_date")
    .eq("id", receiptId)
    .single();
  if (fetchError || !existingReceipt) {
    throw fetchError ?? new Error("Receipt not found");
  }

  if (existingReceipt.purchase_date === purchaseDate) {
    return;
  }

  const { error: logError } = await supabase.from("edit_logs").insert({
    receipt_id: receiptId,
    field_name: "purchase_date",
    old_value: existingReceipt.purchase_date,
    new_value: purchaseDate,
    edited_by: user.id,
  });
  if (logError) {
    throw logError;
  }

  const { error: updateError } = await supabase
    .from("receipts")
    .update({ purchase_date: purchaseDate })
    .eq("id", receiptId);
  if (updateError) {
    throw updateError;
  }
}

// Section 13: after confirming, check each item's product for a >15% price
// spike against its recent normal-price history (now including this
// receipt, since it just flipped to confirmed) and log an alert.
async function recordPriceSpikeAlerts(
  circleId: string,
  receiptId: string,
  items: ConfirmReceiptItemUpdate[]
): Promise<void> {
  const productIds = [
    ...new Set(
      items
        .filter((item) => item.productId && item.unitSpecValue != null && item.unitSpecUnit)
        .map((item) => item.productId as string)
    ),
  ];
  if (productIds.length === 0) {
    return;
  }

  const histories: ProductPriceHistory[] = [];
  for (const productId of productIds) {
    const { data: rows, error } = await supabase
      .from("receipt_items")
      .select(
        "unit_price, unit_spec_value, unit_spec_unit, is_promotion, receipts!inner(purchase_date, status)"
      )
      .eq("product_id", productId)
      .eq("receipts.status", "confirmed")
      .order("purchase_date", { foreignTable: "receipts", ascending: true });
    if (error) {
      throw error;
    }

    const purchases = ((rows ?? []) as unknown as Array<{
      unit_price: number;
      unit_spec_value: number | null;
      unit_spec_unit: string | null;
      is_promotion: boolean;
    }>)
      .filter((row) => row.unit_spec_value != null && row.unit_spec_unit)
      .map((row) => ({
        unitPrice: row.unit_price,
        specValue: row.unit_spec_value as number,
        specUnit: row.unit_spec_unit as string,
        isPromotion: row.is_promotion,
      }));

    histories.push({ productId, purchases });
  }

  const spikes = detectPriceSpikes(histories);
  if (spikes.length === 0) {
    return;
  }

  const { error: alertsError } = await supabase.from("alerts").insert(
    spikes.map((spike) => ({
      circle_id: circleId,
      type: "price_spike",
      product_id: spike.productId,
      receipt_id: receiptId,
      new_price: spike.newPrice,
      change_percent: spike.changePercent,
    }))
  );
  if (alertsError) {
    throw alertsError;
  }
}

// Section 4 + 15 page 3: deletes a receipt (receipt_items cascade via their
// FK to receipts), whether that's a confirmed upload the user removed from
// the receipt list or a suspected-duplicate draft. Also removes its stored
// image from the private "receipts" bucket (Section 3.1) — otherwise the
// original photo is orphaned in storage forever.
export async function deleteReceipt(receiptId: string): Promise<void> {
  const { data, error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", receiptId)
    .select("original_image_url")
    .single();
  if (error) {
    throw error;
  }

  const imagePath = (data as { original_image_url: string | null } | null)?.original_image_url;
  if (imagePath) {
    const { error: storageError } = await supabase.storage.from("receipts").remove([imagePath]);
    if (storageError) {
      throw storageError;
    }
  }
}
