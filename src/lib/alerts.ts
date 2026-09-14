import { supabase } from "@/lib/supabaseClient";
import { bilingualName } from "@/lib/bilingualName";

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

  const rows = data ?? [];

  return rows.map((row) => {
    // `products` is null only to the type checker — `alerts.product_id` is
    // NOT NULL with an FK, so the embed always resolves. The `?? ""` is the
    // unreachable arm; it stands in for a Product with no Source Text at
    // all, and feeding it through the reader is what keeps that case blank
    // in *both* languages. Blank-in-one-language-only is the thing the
    // Bilingual Name rule forbids (CONTEXT.md).
    const productName = bilingualName(
      row.products?.canonical_name_en ?? "",
      row.products?.canonical_name_zh
    );
    return {
      id: row.id,
      type: row.type,
      productId: row.product_id,
      productNameEn: productName.en,
      productNameZh: productName.zh,
      newPrice: row.new_price,
      changePercent: row.change_percent,
      createdAt: row.created_at,
    };
  });
}
