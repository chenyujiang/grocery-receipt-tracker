import { supabase } from "@/lib/supabaseClient";
import { monthBounds, nextMonthStart } from "@/lib/dateRange";
import { fetchCircleMembers } from "@/lib/circleMembers";
import {
  buildPriceChangeLeaderboard,
  type LeaderboardEntry,
  type LeaderboardInput,
} from "@/lib/priceChangeLeaderboard";
import { fetchPurchaseHistories } from "@/lib/purchaseHistory";
import { bilingualName } from "@/lib/bilingualName";

export interface CategoryProductBreakdownItem {
  productId: string | null;
  nameEn: string;
  nameZh: string;
  total: number;
  // Sum of (original_price - unit_price) * quantity across this product's
  // promotional purchases this month — `total`/`subtotal` already reflect
  // what was actually paid, so this is purely informational, never
  // subtracted back out or stored as a negative amount anywhere.
  promoSavings: number;
}

export interface CategoryBreakdownItem {
  category: string;
  total: number;
  products: CategoryProductBreakdownItem[];
}

export interface UploaderSpend {
  userId: string;
  displayName: string;
  total: number;
}

export interface MonthlyReport {
  totalSpend: number;
  previousMonthSpend: number;
  changePercent: number | null;
  categoryBreakdown: CategoryBreakdownItem[];
  priceChangeLeaderboard: LeaderboardEntry[];
  alertCount: number;
  spendByUploader: UploaderSpend[];
  receiptCount: number;
  lineItemCount: number;
}

async function fetchMonthSpend(start: string, end: string): Promise<number> {
  const { data, error } = await supabase
    .from("receipts")
    .select("total_amount")
    .eq("status", "confirmed")
    .gte("purchase_date", start)
    .lte("purchase_date", end);
  if (error) {
    throw error;
  }
  return (data ?? []).reduce((sum, row) => sum + row.total_amount, 0);
}

// Section 14: the monthly report page — total spend vs. last month, category
// breakdown, the price-change leaderboard (Section 10), this month's alert
// count, and spending by uploader.
export async function fetchMonthlyReport(month: Date): Promise<MonthlyReport> {
  const { start, end } = monthBounds(month);
  const previousMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const previousBounds = monthBounds(previousMonth);

  const { data: monthRows, error: monthError } = await supabase
    .from("receipts")
    .select(
      "total_amount, uploaded_by, receipt_items(subtotal, quantity, original_price, is_promotion, product_id, raw_name_en, raw_name_zh, products(category, canonical_name_en, canonical_name_zh))"
    )
    .eq("status", "confirmed")
    .gte("purchase_date", start)
    .lte("purchase_date", end);
  if (monthError) {
    throw monthError;
  }

  const receipts = monthRows ?? [];

  let totalSpend = 0;
  let lineItemCount = 0;
  const categoryTotals = new Map<string, number>();
  // Nested by category, then by product — product_id when the item is
  // matched to a standardized Product, otherwise its raw recognized name
  // (an item can be left unmatched if its Product was later deleted).
  const categoryProducts = new Map<string, Map<string, CategoryProductBreakdownItem>>();
  const uploaderTotals = new Map<string, number>();
  const productIds = new Set<string>();

  for (const receipt of receipts) {
    totalSpend += receipt.total_amount;
    uploaderTotals.set(
      receipt.uploaded_by,
      (uploaderTotals.get(receipt.uploaded_by) ?? 0) + receipt.total_amount
    );
    for (const item of receipt.receipt_items) {
      lineItemCount += 1;
      const category = item.products?.category ?? "Other / Uncategorized";
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + item.subtotal);
      if (item.product_id) {
        productIds.add(item.product_id);
      }

      let products = categoryProducts.get(category);
      if (!products) {
        products = new Map();
        categoryProducts.set(category, products);
      }
      const productKey = item.product_id ?? `raw:${item.raw_name_en}`;
      const savings =
        item.is_promotion && item.original_price != null
          ? item.original_price * item.quantity - item.subtotal
          : 0;
      const existing = products.get(productKey);
      if (existing) {
        existing.total += item.subtotal;
        existing.promoSavings += savings;
      } else {
        // A matched Product's canonical name wins over the line's own OCR
        // text, per language; the reader then applies the Bilingual Name rule
        // to whatever survived.
        const name = bilingualName(
          item.products?.canonical_name_en ?? item.raw_name_en,
          item.products?.canonical_name_zh ?? item.raw_name_zh
        );
        products.set(productKey, {
          productId: item.product_id,
          nameEn: name.en,
          nameZh: name.zh,
          total: item.subtotal,
          promoSavings: savings,
        });
      }
    }
  }

  const categoryBreakdown = [...categoryTotals.entries()]
    .map(([category, total]) => ({
      category,
      total,
      products: [...(categoryProducts.get(category)?.values() ?? [])].sort(
        (a, b) => b.total - a.total
      ),
    }))
    .sort((a, b) => b.total - a.total);

  const previousMonthSpend = await fetchMonthSpend(previousBounds.start, previousBounds.end);
  const changePercent =
    previousMonthSpend === 0
      ? null
      : Math.round(((totalSpend - previousMonthSpend) / previousMonthSpend) * 10000) / 100;

  const { count: alertCount, error: alertsError } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lt("created_at", nextMonthStart(month));
  if (alertsError) {
    throw alertsError;
  }

  const members = await fetchCircleMembers();
  const nameById = new Map(members.map((member) => [member.userId, member.displayName]));
  const spendByUploader = [...uploaderTotals.entries()]
    .map(([userId, total]) => ({ userId, displayName: nameById.get(userId) ?? userId, total }))
    .sort((a, b) => b.total - a.total);

  let priceChangeLeaderboard: LeaderboardEntry[] = [];
  if (productIds.size > 0) {
    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select("id, canonical_name_en, canonical_name_zh")
      .in("id", [...productIds]);
    if (productsError) {
      throw productsError;
    }
    const productNames = new Map(
      (productRows ?? []).map((row) => [
        row.id,
        bilingualName(row.canonical_name_en, row.canonical_name_zh),
      ])
    );

    const histories = await fetchPurchaseHistories(supabase, [...productIds]);
    const leaderboardInput: LeaderboardInput[] = histories.map((history) => {
      const names = productNames.get(history.productId);
      return {
        productId: history.productId,
        nameEn: names?.en ?? "",
        nameZh: names?.zh ?? "",
        purchases: history.purchases,
      };
    });
    priceChangeLeaderboard = buildPriceChangeLeaderboard(leaderboardInput);
  }

  return {
    totalSpend,
    previousMonthSpend,
    changePercent,
    categoryBreakdown,
    priceChangeLeaderboard,
    alertCount: alertCount ?? 0,
    spendByUploader,
    receiptCount: receipts.length,
    lineItemCount,
  };
}
