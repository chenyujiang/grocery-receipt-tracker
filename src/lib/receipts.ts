import { supabase } from "@/lib/supabaseClient";
import { detectPriceSpikes, type SpikeCheckReceipt } from "@/lib/priceSpikeAlerts";
import { listStores, resolveStore, storeKey, storeNameOf, type Store, type StoreChoice } from "@/lib/stores";
import { fetchPurchaseHistories } from "@/lib/purchaseHistory";
import { diffReceiptItemFields } from "@/lib/editLog";
import { resizeImageForUpload } from "@/lib/imageResize";
import { bilingualName, type BilingualName } from "@/lib/bilingualName";
import { receiptStoreName, STORE_NAMES_EMBED } from "@/lib/storeName";

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

// Everything a DraftItem carries except `category`: category lives on the
// Product and is read via `product_id` (spec.md Section 5.2), so it must not
// travel back out through a ReceiptItem write. Stating that as an Omit, rather
// than re-listing the fields, means a new DraftItem field can't be forgotten
// here — and `toItemUpdate` below is the one place that performs the strip.
export type ConfirmReceiptItemUpdate = Omit<DraftItem, "category">;

export function toItemUpdate(item: DraftItem): ConfirmReceiptItemUpdate {
  const { category: _category, ...update } = item;
  return update;
}

export interface ReceiptDraft {
  id: string;
  uploadedBy: string;
  // The Receipt Header: the store name exactly as this receipt printed it.
  receiptHeader: BilingualName;
  // What to call the receipt: its Store's own chain and branch, or the
  // printed header while it has no Store (issue 29).
  storeDisplayName: BilingualName;
  // The chain/branch split the AI read off the header, in the shape
  // confirmReceipt takes its Store in. Null for a draft recognized before
  // the split existed (issue 29).
  recognizedStore: StoreChoice | null;
  // The Store a confirmed receipt points at; null for a draft, which gets
  // its Store only on confirm.
  storeId: string | null;
  purchaseDate: string;
  totalAmount: number;
  status: string;
  originalImageUrl: string | null;
  items: DraftItem[];
}

// The preview screen's store picker options: the Circle's Stores, scoped by RLS.
export function fetchStores(): Promise<Store[]> {
  return listStores(supabase);
}

// Section 6: the preview/confirm screen reads the AI-generated draft —
// category comes from the matched Product, not from ReceiptItem itself
// (spec.md Section 5.2). `uploadedBy` drives issue 16's edit-permission
// check (only the uploader may edit a confirmed receipt).
export async function fetchReceiptDraft(receiptId: string): Promise<ReceiptDraft> {
  const { data: receiptRow, error: receiptError } = await supabase
    .from("receipts")
    .select(
      `id, uploaded_by, store_id, store_name_en, store_name_zh, recognized_chain_en, recognized_chain_zh, recognized_branch_en, recognized_branch_zh, purchase_date, total_amount, status, original_image_url, ${STORE_NAMES_EMBED}`
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

  const items = itemRows ?? [];

  const header = bilingualName(receiptRow.store_name_en, receiptRow.store_name_zh);

  return {
    id: receiptRow.id,
    uploadedBy: receiptRow.uploaded_by,
    receiptHeader: header,
    storeDisplayName: receiptStoreName(receiptRow),
    recognizedStore:
      receiptRow.recognized_chain_en == null
        ? null
        : {
            chain: { en: receiptRow.recognized_chain_en, zh: receiptRow.recognized_chain_zh },
            // The AI writes a branch it couldn't read as empty text.
            branch: receiptRow.recognized_branch_en
              ? { en: receiptRow.recognized_branch_en, zh: receiptRow.recognized_branch_zh }
              : null,
          },
    storeId: receiptRow.store_id,
    purchaseDate: receiptRow.purchase_date,
    totalAmount: receiptRow.total_amount,
    status: receiptRow.status,
    originalImageUrl: receiptRow.original_image_url,
    items: items.map((row) => {
      const rawName = bilingualName(row.raw_name_en, row.raw_name_zh);
      return {
        id: row.id,
        rawNameEn: rawName.en,
        rawNameZh: rawName.zh,
        quantity: row.quantity,
        unitSpecValue: row.unit_spec_value,
        unitSpecUnit: row.unit_spec_unit,
        unitPrice: row.unit_price,
        originalPrice: row.original_price,
        isPromotion: row.is_promotion,
        subtotal: row.subtotal,
        productId: row.product_id,
        category: row.products?.category ?? null,
      };
    }),
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

    const existingRawName = bilingualName(existingRow.raw_name_en, existingRow.raw_name_zh);

    const changes = diffReceiptItemFields(
      {
        rawNameEn: existingRawName.en,
        rawNameZh: existingRawName.zh,
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

// A chain and branch as English text, compared on the normalized keys.
interface StoreReading {
  chain: string;
  branch: string | null;
}

// The Store the store picker starts a receipt on (StorePicker's
// initialStorePick): the receipt's own Store if it has one; else what the AI
// read; else — a draft saved before the chain/branch split — its header as
// the chain, branch unknown.
function startingStore(receipt: {
  store_name_en: string;
  recognized_chain_en: string | null;
  recognized_branch_en: string | null;
  stores?: { chain_name_en: string; branch_name_en: string | null } | null;
}): StoreReading {
  if (receipt.stores) {
    return { chain: receipt.stores.chain_name_en, branch: receipt.stores.branch_name_en };
  }
  if (receipt.recognized_chain_en != null) {
    return { chain: receipt.recognized_chain_en, branch: receipt.recognized_branch_en || null };
  }
  return { chain: receipt.store_name_en, branch: null };
}

// On the same normalized keys resolveStore matches on.
function sameStore(a: StoreReading, b: StoreReading): boolean {
  const aKey = storeKey(a.chain, a.branch);
  const bKey = storeKey(b.chain, b.branch);
  return aKey.chainKey === bKey.chainKey && aKey.branchKey === bKey.branchKey;
}

// Section 6: user reviews/corrects each field, then confirms. Every changed
// field is logged to EditLog (Section 5.4) before the update is applied,
// diffed against whatever Supabase currently holds for that item.
//
// Issue 29: `store` is the chain/branch the user confirmed on the preview
// screen — an existing Store picked from the list resolves back to itself.
// The Store row is created here, on confirm, never on draft save, and is
// written in the same update as the status so a confirmed receipt never
// lacks one.
export async function confirmReceipt(
  receiptId: string,
  items: ConfirmReceiptItemUpdate[],
  store: StoreChoice
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw userError ?? new Error("Not signed in");
  }

  const { data: receiptCircle, error: circleError } = await supabase
    .from("receipts")
    .select("circle_id, store_name_en, recognized_chain_en, recognized_branch_en")
    .eq("id", receiptId)
    .single();
  if (circleError || !receiptCircle) {
    throw circleError ?? new Error("Receipt not found");
  }

  // Resolved before anything is written, so a failure here leaves the draft
  // as it was instead of saving its items while it stays a draft.
  const confirmedStore = await resolveStore(supabase, receiptCircle.circle_id, store);
  const storeId = confirmedStore.id;

  await updateReceiptItemsWithLog(items, user.id);

  // User story 3: correcting the Store the AI read is a Correction like any
  // other — but confirming the Store the AI's reading matched is not one.
  const read = startingStore(receiptCircle);
  const confirmed = { chain: confirmedStore.chainNameEn, branch: confirmedStore.branchNameEn };
  if (!sameStore(read, confirmed)) {
    const { error: logError } = await supabase.from("edit_logs").insert([
      {
        receipt_id: receiptId,
        field_name: "store",
        old_value: [read.chain, read.branch ?? ""].map((part) => part.trim()).filter(Boolean).join(" "),
        new_value: storeNameOf(confirmedStore).en,
        edited_by: user.id,
      },
    ]);
    if (logError) {
      throw logError;
    }
  }

  const { data: receiptRow, error: statusError } = await supabase
    .from("receipts")
    .update({ status: "confirmed", store_id: storeId })
    .eq("id", receiptId)
    .select("purchase_date")
    .single();
  if (statusError || !receiptRow) {
    throw statusError ?? new Error("Failed to confirm receipt");
  }

  await recordPriceSpikeAlerts(
    receiptCircle.circle_id,
    receiptId,
    { id: receiptId, storeId, purchaseDate: receiptRow.purchase_date },
    items
  );
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
  items: ConfirmReceiptItemUpdate[],
  store: StoreChoice
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
    .select(
      `purchase_date, circle_id, store_id, store_name_en, store_name_zh, recognized_chain_en, recognized_branch_en, ${STORE_NAMES_EMBED}`
    )
    .eq("id", receiptId)
    .single();
  if (fetchError || !existingReceipt) {
    throw fetchError ?? new Error("Receipt not found");
  }

  const changes: { purchase_date?: string; store_id?: string } = {};
  const logs: Array<{ field_name: string; old_value: string | null; new_value: string }> = [];
  // Issue 29: moving a receipt to another Store is logged by the Stores'
  // names, so the log reads on its own, and — like every edit — neither
  // re-raises nor withdraws alerts. Only a choice naming another Store than
  // the picker started on is resolved, so saving just a new date never
  // creates a Store or logs a Store change.
  if (!sameStore(startingStore(existingReceipt), { chain: store.chain.en, branch: store.branch?.en ?? null })) {
    const newStore = await resolveStore(supabase, existingReceipt.circle_id, store);
    if (existingReceipt.store_id !== newStore.id) {
      changes.store_id = newStore.id;
      logs.push({
        field_name: "store",
        old_value: receiptStoreName(existingReceipt).en,
        new_value: storeNameOf(newStore).en,
      });
    }
  }
  if (existingReceipt.purchase_date !== purchaseDate) {
    changes.purchase_date = purchaseDate;
    logs.push({
      field_name: "purchase_date",
      old_value: existingReceipt.purchase_date,
      new_value: purchaseDate,
    });
  }
  if (logs.length === 0) {
    return;
  }

  const { error: logError } = await supabase
    .from("edit_logs")
    .insert(logs.map((log) => ({ receipt_id: receiptId, ...log, edited_by: user.id })));
  if (logError) {
    throw logError;
  }

  const { error: updateError } = await supabase
    .from("receipts")
    .update(changes)
    .eq("id", receiptId);
  if (updateError) {
    throw updateError;
  }
}

// Section 13: after confirming, check each item's product for a >15% price
// spike against its recent normal-price history (now including this
// receipt, since it just flipped to confirmed) and log an alert. Only the
// receipt's own Store's history counts (issue 29).
async function recordPriceSpikeAlerts(
  circleId: string,
  receiptId: string,
  receipt: SpikeCheckReceipt,
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

  const histories = await fetchPurchaseHistories(supabase, productIds);

  const spikes = detectPriceSpikes(histories, receipt);
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
