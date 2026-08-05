import { calculatePriceChange, type PurchaseRecord } from "@/lib/priceChange";

export interface ProductPriceHistory {
  productId: string;
  nameEn: string;
  nameZh: string;
  records: PurchaseRecord[];
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
  histories: ProductPriceHistory[],
  limit: number = DEFAULT_LIMIT
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const history of histories) {
    const change = calculatePriceChange(history.records);
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
