import { calculatePriceChange, type PurchaseRecord } from "@/lib/priceChange";

// Section 13: fixed 15% threshold, checked immediately after a receipt is
// confirmed. "Exceeds", not "reaches" — exactly 15% doesn't trigger.
const SPIKE_THRESHOLD_PERCENT = 15;

export interface ProductPriceHistory {
  productId: string;
  purchases: PurchaseRecord[];
}

export interface PriceSpike {
  productId: string;
  newPrice: number;
  changePercent: number;
}

export function detectPriceSpikes(histories: ProductPriceHistory[]): PriceSpike[] {
  const spikes: PriceSpike[] = [];

  for (const history of histories) {
    const change = calculatePriceChange(history.purchases);
    if (!change || change.changePercent <= SPIKE_THRESHOLD_PERCENT) {
      continue;
    }

    const normalPurchases = history.purchases.filter((purchase) => !purchase.isPromotion);
    const latest = normalPurchases[normalPurchases.length - 1];

    spikes.push({
      productId: history.productId,
      newPrice: latest.unitPrice,
      changePercent: change.changePercent,
    });
  }

  return spikes;
}
