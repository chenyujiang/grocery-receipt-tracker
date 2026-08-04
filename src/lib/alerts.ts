import { supabase } from "@/lib/supabaseClient";

export type AlertType = "price_spike" | "low_stock";

export interface AlertListItem {
  id: string;
  type: AlertType;
  productId: string;
  productNameEn: string;
  productNameZh: string;
  newPrice: number | null;
  changePercent: number | null;
  createdAt: string;
}

// Section 13/15: the notification list. RLS already scopes rows to the
// caller's circle (see the alerts table migration) — no circle_id filter
// needed here.
export async function fetchAlerts(): Promise<AlertListItem[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, type, product_id, new_price, change_percent, created_at, products(canonical_name_en, canonical_name_zh)"
    )
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    type: AlertType;
    product_id: string;
    new_price: number | null;
    change_percent: number | null;
    created_at: string;
    products: { canonical_name_en: string; canonical_name_zh: string } | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    productId: row.product_id,
    productNameEn: row.products?.canonical_name_en ?? "",
    productNameZh: row.products?.canonical_name_zh ?? "",
    newPrice: row.new_price,
    changePercent: row.change_percent,
    createdAt: row.created_at,
  }));
}
