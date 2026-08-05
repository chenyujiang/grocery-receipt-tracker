import { supabase } from "@/lib/supabaseClient";

export interface DuplicateMatch {
  id: string;
  uploadedAt: string;
}

export interface DuplicateCheckParams {
  storeNameEn: string;
  purchaseDate: string;
  totalAmount: number;
  excludeReceiptId: string;
}

// Section 4: new receipts are auto-checked for suspected duplicates by
// matching store + date + total amount. Matches against any of the
// caller's circle's receipts (RLS-scoped), not just confirmed ones.
export async function findDuplicateReceipt(
  params: DuplicateCheckParams
): Promise<DuplicateMatch | null> {
  const { data, error } = await supabase
    .from("receipts")
    .select("id, uploaded_at")
    .eq("store_name_en", params.storeNameEn)
    .eq("purchase_date", params.purchaseDate)
    .eq("total_amount", params.totalAmount)
    .neq("id", params.excludeReceiptId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const row = data as { id: string; uploaded_at: string };
  return { id: row.id, uploadedAt: row.uploaded_at };
}
