import { supabase } from "@/lib/supabaseClient";

export interface ReceiptFilters {
  storeQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  uploadedBy?: string;
}

export interface ReceiptListItem {
  id: string;
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
    .select("id, store_name_en, store_name_zh, purchase_date, total_amount, status, uploaded_by");

  if (filters.storeQuery) {
    const term = sanitizeSearchTerm(filters.storeQuery);
    query = query.or(`store_name_en.ilike.%${term}%,store_name_zh.ilike.%${term}%`);
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

  const rows = (data ?? []) as Array<{
    id: string;
    store_name_en: string;
    store_name_zh: string;
    purchase_date: string;
    total_amount: number;
    status: string;
    uploaded_by: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    storeNameEn: row.store_name_en,
    storeNameZh: row.store_name_zh,
    purchaseDate: row.purchase_date,
    totalAmount: row.total_amount,
    status: row.status,
    uploadedBy: row.uploaded_by,
  }));
}
