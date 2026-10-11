import { comparedPurchasesAtStore, priceChangeAtStore, type StorePurchaseRecord } from "@/lib/priceChange";

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
  purchases: (StorePurchaseRecord & { purchaseDate: string; receiptId: string })[];
}

// The Receipt that was just confirmed. Only its own Store's purchases are
// compared, so a price difference between two Stores never raises an alert.
export interface SpikeCheckReceipt {
  id: string;
  storeId: string;
  purchaseDate: string; // "YYYY-MM-DD"
}

export function detectPriceSpikes(
  histories: SpikeCheckHistory[],
  receipt: SpikeCheckReceipt
): PriceSpike[] {
  const spikes: PriceSpike[] = [];

  for (const history of histories) {
    // The alert is this Receipt's, so its "current" price must be this
    // Receipt's own normal-price purchase: history is cut just after it. That
    // leaves out later purchases at its Store (a Receipt confirmed late) and
    // another receipt's on the same date; and with no normal-price purchase of
    // this product on this Receipt there is nothing to judge.
    let ownIndex = -1;
    history.purchases.forEach((purchase, index) => {
      if (purchase.receiptId === receipt.id && !purchase.isPromotion) {
        ownIndex = index;
      }
    });
    if (ownIndex === -1) {
      continue;
    }
    const upToReceipt = history.purchases.slice(0, ownIndex + 1);
    const storeChange = priceChangeAtStore(upToReceipt, receipt.storeId);
    if (!storeChange || storeChange.changePercent <= SPIKE_THRESHOLD_PERCENT) {
      continue;
    }

    const { baseline, current } = comparedPurchasesAtStore(upToReceipt, receipt.storeId)!;
    if (daysBetween(baseline.purchaseDate, receipt.purchaseDate) > MAX_BASELINE_AGE_DAYS) {
      continue;
    }

    spikes.push({
      productId: history.productId,
      newPrice: current.unitPrice,
      changePercent: storeChange.changePercent,
    });
  }

  return spikes;
}
