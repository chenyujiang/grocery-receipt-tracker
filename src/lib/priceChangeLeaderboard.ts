import { calculatePriceChange, type PurchaseRecord } from "@/lib/priceChange";

// A PurchaseHistory plus the product's display names. The names come from the
// products table, not from the purchases, so this is deliberately its own type
// rather than a second thing called a purchase history.
export interface LeaderboardInput {
  productId: string;
  nameEn: string;
  nameZh: string;
  purchases: PurchaseRecord[];
}

export interface LeaderboardEntry {
  productId: string;
  nameEn: string;
  nameZh: string;
  changePercent: number;
}

const DEFAULT_LIMIT = 5;

// Section 10 + 14: the monthly report's price-change leaderboard — this
// month's biggest increases, grouped by product. Reuses calculatePriceChange
// per product and keeps only actual increases, ranked descending.
export function buildPriceChangeLeaderboard(
  histories: LeaderboardInput[],
  limit: number = DEFAULT_LIMIT
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const history of histories) {
    const change = calculatePriceChange(history.purchases);
    if (change && change.changePercent > 0) {
      entries.push({
        productId: history.productId,
        nameEn: history.nameEn,
        nameZh: history.nameZh,
        changePercent: change.changePercent,
      });
    }
  }
  return entries.sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
}
