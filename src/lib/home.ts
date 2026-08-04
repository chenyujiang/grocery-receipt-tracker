import { supabase } from "@/lib/supabaseClient";

export interface CategoryBreakdownItem {
  category: string;
  total: number;
}

export interface RecentReceiptItem {
  id: string;
  storeNameEn: string;
  storeNameZh: string;
  purchaseDate: string;
  totalAmount: number;
  status: string;
}

export interface HomeSummary {
  monthTotal: number;
  categoryBreakdown: CategoryBreakdownItem[];
  pendingAlertsCount: number;
  recentReceipts: RecentReceiptItem[];
}

const RECENT_RECEIPTS_LIMIT = 5;

function monthBounds(today: Date): { start: string; end: string } {
  const year = today.getFullYear();
  const month = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

// Section 15, page 1: Home/Dashboard — this month's total spend, category
// breakdown, a pending-alerts summary, and recent receipts.
export async function fetchHomeSummary(today: Date = new Date()): Promise<HomeSummary> {
  const { start, end } = monthBounds(today);

  const { data: monthRows, error: monthError } = await supabase
    .from("receipts")
    .select("total_amount, receipt_items(subtotal, products(category))")
    .eq("status", "confirmed")
    .gte("purchase_date", start)
    .lte("purchase_date", end);
  if (monthError) {
    throw monthError;
  }

  // Cast at the boundary: without generated Database types, supabase-js
  // infers the nested to-one receipt_items.product_id -> products.id embed
  // as an array, though PostgREST returns a single object at runtime.
  const receipts = (monthRows ?? []) as unknown as Array<{
    total_amount: number;
    receipt_items: Array<{ subtotal: number; products: { category: string } | null }>;
  }>;

  let monthTotal = 0;
  const categoryTotals = new Map<string, number>();
  for (const receipt of receipts) {
    monthTotal += receipt.total_amount;
    for (const item of receipt.receipt_items) {
      const category = item.products?.category ?? "Other / Uncategorized";
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + item.subtotal);
    }
  }
  const categoryBreakdown = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const { count: pendingAlertsCount, error: alertsError } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true });
  if (alertsError) {
    throw alertsError;
  }

  const { data: recentRows, error: recentError } = await supabase
    .from("receipts")
    .select("id, store_name_en, store_name_zh, purchase_date, total_amount, status")
    .order("purchase_date", { ascending: false })
    .limit(RECENT_RECEIPTS_LIMIT);
  if (recentError) {
    throw recentError;
  }

  const recentReceipts = ((recentRows ?? []) as unknown as Array<{
    id: string;
    store_name_en: string;
    store_name_zh: string;
    purchase_date: string;
    total_amount: number;
    status: string;
  }>).map((row) => ({
    id: row.id,
    storeNameEn: row.store_name_en,
    storeNameZh: row.store_name_zh,
    purchaseDate: row.purchase_date,
    totalAmount: row.total_amount,
    status: row.status,
  }));

  return {
    monthTotal,
    categoryBreakdown,
    pendingAlertsCount: pendingAlertsCount ?? 0,
    recentReceipts,
  };
}
