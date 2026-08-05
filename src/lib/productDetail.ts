import { supabase } from "@/lib/supabaseClient";
import { calculatePriceChange, type PriceChange } from "@/lib/priceChange";
import { buildPriceTrend, type PriceTrendPoint } from "@/lib/priceTrend";
import { compareStores, type StoreComparisonEntry } from "@/lib/storeComparison";
import { calculateConsumption, type ConsumptionEstimate } from "@/lib/consumptionRate";

export interface PurchaseHistoryEntry {
  purchaseDate: string;
  storeNameEn: string;
  storeNameZh: string;
  unitPrice: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

export interface ProductDetail {
  id: string;
  canonicalNameEn: string;
  canonicalNameZh: string;
  category: string;
  priceChange: PriceChange | null;
  priceTrend: PriceTrendPoint[];
  storeComparison: StoreComparisonEntry[];
  consumption: ConsumptionEstimate | null;
  purchaseHistory: PurchaseHistoryEntry[];
}

// Section 15, page 4: product detail — price trend (S10), multi-store
// comparison (S11), consumption rate / estimated days remaining (S12), and
// purchase history. All four derive from the same confirmed purchase
// history, fetched once and fed into the already-tested pure functions.
export async function fetchProductDetail(
  productId: string,
  today: Date = new Date()
): Promise<ProductDetail> {
  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select("id, canonical_name_en, canonical_name_zh, category")
    .eq("id", productId)
    .single();
  if (productError || !productRow) {
    throw productError ?? new Error("Product not found");
  }

  const { data: rows, error: historyError } = await supabase
    .from("receipt_items")
    .select(
      "unit_price, quantity, unit_spec_value, unit_spec_unit, is_promotion, receipts!inner(purchase_date, store_name_en, store_name_zh, status)"
    )
    .eq("product_id", productId)
    .eq("receipts.status", "confirmed")
    .order("purchase_date", { foreignTable: "receipts", ascending: true });
  if (historyError) {
    throw historyError;
  }

  // Cast at the boundary: without generated Database types, supabase-js
  // infers the to-one receipt_items -> receipts embed as an array, though
  // PostgREST returns a single object at runtime.
  const historyRows = (rows ?? []) as unknown as Array<{
    unit_price: number;
    quantity: number;
    unit_spec_value: number;
    unit_spec_unit: string;
    is_promotion: boolean;
    receipts: { purchase_date: string; store_name_en: string; store_name_zh: string };
  }>;

  const purchaseHistory: PurchaseHistoryEntry[] = historyRows.map((row) => ({
    purchaseDate: row.receipts.purchase_date,
    storeNameEn: row.receipts.store_name_en,
    storeNameZh: row.receipts.store_name_zh,
    unitPrice: row.unit_price,
    specValue: row.unit_spec_value,
    specUnit: row.unit_spec_unit,
    isPromotion: row.is_promotion,
  }));

  const priceChange = calculatePriceChange(
    purchaseHistory.map((entry) => ({
      unitPrice: entry.unitPrice,
      specValue: entry.specValue,
      specUnit: entry.specUnit,
      isPromotion: entry.isPromotion,
    }))
  );

  const priceTrend = buildPriceTrend(
    purchaseHistory.map((entry) => ({
      purchaseDate: entry.purchaseDate,
      unitPrice: entry.unitPrice,
      specValue: entry.specValue,
      specUnit: entry.specUnit,
      isPromotion: entry.isPromotion,
    }))
  );

  const storeComparison = compareStores(purchaseHistory);

  const consumption = calculateConsumption(
    historyRows.map((row) => ({
      purchaseDate: row.receipts.purchase_date,
      quantity: row.quantity,
      specValue: row.unit_spec_value,
      specUnit: row.unit_spec_unit,
    })),
    today
  );

  return {
    id: productRow.id,
    canonicalNameEn: productRow.canonical_name_en,
    canonicalNameZh: productRow.canonical_name_zh,
    category: productRow.category,
    priceChange,
    priceTrend,
    storeComparison,
    consumption,
    purchaseHistory,
  };
}
