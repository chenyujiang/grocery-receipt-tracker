import { calculatePriceChangesByStore, type StorePurchaseRecord } from "@/lib/priceChange";

// Section 13: fixed 15% threshold, checked immediately after a receipt is
// confirmed. "Exceeds", not "reaches" — exactly 15% doesn't trigger.
const SPIKE_THRESHOLD_PERCENT = 15;

// Issue 29: a baseline more than ~6 months before the Receipt is inflation
// since the last visit, not a spike. The product detail page still shows the
// change; only the alert is suppressed.
const MAX_BASELINE_AGE_DAYS = 183;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromDate: string, toDate: string): number {
  return (Date.parse(toDate) - Date.parse(fromDate)) / MS_PER_DAY;
}

export interface PriceSpike {
  productId: string;
  newPrice: number;
  changePercent: number;
}

export interface SpikeCheckHistory {
  productId: string;
  purchases: (StorePurchaseRecord & { purchaseDate: string })[];
}

// The Receipt that was just confirmed. Only its own Store's purchases are
// compared, so a price difference between two Stores never raises an alert.
export interface SpikeCheckReceipt {
  storeId: string;
  purchaseDate: string; // "YYYY-MM-DD"
}

export function detectPriceSpikes(
  histories: SpikeCheckHistory[],
  receipt: SpikeCheckReceipt
): PriceSpike[] {
  const spikes: PriceSpike[] = [];

  for (const history of histories) {
    // Only purchases up to the Receipt's own date: a Receipt confirmed late
    // is judged against what came before it, not later purchases at its Store.
    const upToReceipt = history.purchases.filter(
      (purchase) => purchase.purchaseDate <= receipt.purchaseDate
    );
    const storeChange = calculatePriceChangesByStore(upToReceipt).find(
      ({ storeId }) => storeId === receipt.storeId
    );
    if (!storeChange || storeChange.change.changePercent <= SPIKE_THRESHOLD_PERCENT) {
      continue;
    }

    const normalPurchases = upToReceipt.filter(
      (purchase) => purchase.storeId === receipt.storeId && !purchase.isPromotion
    );
    const [baseline, latest] = normalPurchases.slice(-2);
    if (daysBetween(baseline.purchaseDate, receipt.purchaseDate) > MAX_BASELINE_AGE_DAYS) {
      continue;
    }

    spikes.push({
      productId: history.productId,
      newPrice: latest.unitPrice,
      changePercent: storeChange.change.changePercent,
    });
  }

  return spikes;
}
