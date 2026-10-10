import { supabase } from "@/lib/supabaseClient";
import { bilingualName } from "@/lib/bilingualName";
import { storeName } from "@/lib/storeName";

export interface ReceiptFilters {
  storeQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  uploadedBy?: string;
}

export interface ReceiptListItem {
  id: string;
  // The Store's own chain and branch; the printed header only for a
  // receipt with no Store yet, i.e. a draft (issue 29).
  storeNameEn: string;
  storeNameZh: string;
  purchaseDate: string;
  totalAmount: number;
  status: string;
  uploadedBy: string;
}

// PostgREST's .or() filter syntax treats "," "(" ")" as structural — strip
// them from free-text search input so a store name containing one of these
// can't break out of the intended OR clause.
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()]/g, " ").trim();
}

// Section 15, page 3: historical receipts, filterable by store/date/uploader.
export async function fetchReceipts(filters: ReceiptFilters = {}): Promise<ReceiptListItem[]> {
  let query = supabase
    .from("receipts")
    .select("id, store_name_en, store_name_zh, purchase_date, total_amount, status, uploaded_by, stores(chain_name_en, chain_name_zh, branch_name_en, branch_name_zh)");

  if (filters.storeQuery) {
    const term = sanitizeSearchTerm(filters.storeQuery);
    // A receipt matches by its printed header or by its Store's names
    // (issue 29). .or() can't filter through the stores embed, so the
    // matching Stores are looked up first and matched by id.
    const { data: storeRows, error: storeError } = await supabase
      .from("stores")
      .select("id")
      .or(
        `chain_name_en.ilike.%${term}%,chain_name_zh.ilike.%${term}%,branch_name_en.ilike.%${term}%,branch_name_zh.ilike.%${term}%`
      );
    if (storeError) {
      throw storeError;
    }
    const storeIds = (storeRows ?? []).map((row) => row.id);
    const byStore = storeIds.length > 0 ? `,store_id.in.(${storeIds.join(",")})` : "";
    query = query.or(`store_name_en.ilike.%${term}%,store_name_zh.ilike.%${term}%${byStore}`);
  }
  if (filters.dateFrom) {
    query = query.gte("purchase_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("purchase_date", filters.dateTo);
  }
  if (filters.uploadedBy) {
    query = query.eq("uploaded_by", filters.uploadedBy);
  }

  // purchase_date alone can't order same-day receipts consistently (it has
  // no time component) — break ties by upload time, newest first, so the
  // list is always most-recent-first end to end.
  const { data, error } = await query
    .order("purchase_date", { ascending: false })
    .order("uploaded_at", { ascending: false });
  if (error) {
    throw error;
  }

  const rows = data ?? [];

  return rows.map((row) => {
    const name = row.stores
      ? storeName(row.stores)
      : bilingualName(row.store_name_en, row.store_name_zh);
    return {
      id: row.id,
      storeNameEn: name.en,
      storeNameZh: name.zh,
      purchaseDate: row.purchase_date,
      totalAmount: row.total_amount,
      status: row.status,
      uploadedBy: row.uploaded_by,
    };
  });
}
