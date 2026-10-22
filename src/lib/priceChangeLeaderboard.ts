import { calculatePriceChangesByStore, type StorePurchaseRecord } from "@/lib/priceChange";

// A purchase as the leaderboard reads it: priced, at a Store, with that
// Store's display name for labelling the row.
export interface LeaderboardPurchase extends StorePurchaseRecord {
  storeNameEn: string;
  storeNameZh: string;
}

// A PurchaseHistory plus the product's display names. The names come from the
// products table, not from the purchases, so this is deliberately its own type
// rather than a second thing called a purchase history.
export interface LeaderboardInput {
  productId: string;
  nameEn: string;
  nameZh: string;
  purchases: LeaderboardPurchase[];
}

export interface LeaderboardEntry {
  productId: string;
  nameEn: string;
  nameZh: string;
  // The branch behind the increase (issue 29).
  storeId: string;
  storeNameEn: string;
  storeNameZh: string;
  changePercent: number;
}

const DEFAULT_LIMIT = 5;

// Section 10 + 14: the monthly report's price-change leaderboard — this
// month's biggest increases, grouped by product. Each product's change is a
// Same-Store Price Change; a product that rose at several branches still
// takes one row, for its biggest rise, so it can't crowd out the rest of the
// report. Keeps only actual increases, ranked descending.
export function buildPriceChangeLeaderboard(
  histories: LeaderboardInput[],
  limit: number = DEFAULT_LIMIT
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const history of histories) {
    const biggestRise = calculatePriceChangesByStore(history.purchases)
      .filter(({ change }) => change.changePercent > 0)
      .sort((a, b) => b.change.changePercent - a.change.changePercent)[0];
    if (!biggestRise) {
      continue;
    }
    // Labelled with the purchase the change's "current" price came from.
    const { current: latestAtStore } = biggestRise;
    entries.push({
      productId: history.productId,
      nameEn: history.nameEn,
      nameZh: history.nameZh,
      storeId: biggestRise.storeId,
      storeNameEn: latestAtStore.storeNameEn,
      storeNameZh: latestAtStore.storeNameZh,
      changePercent: biggestRise.change.changePercent,
    });
  }
  return entries.sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
}
