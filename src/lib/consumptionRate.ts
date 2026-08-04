import { toBaseQuantity, type BaseQuantityBasis } from "@/lib/units";

export interface ConsumptionPurchaseRecord {
  purchaseDate: string; // "YYYY-MM-DD"
  quantity: number;
  specValue: number;
  specUnit: string;
}

export interface ConsumptionEstimate {
  basis: BaseQuantityBasis;
  dailyRate: number;
  estimatedRemaining: number;
  estimatedDaysRemaining: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_SIZE = 5;
const MIN_PURCHASES = 3;

interface MergedPurchase {
  date: string;
  baseQuantity: number;
  basis: BaseQuantityBasis;
}

// Multiple ReceiptItems for the same product on the same day (e.g. two
// differently-sized bottles bought in one trip) count as a single purchase.
function mergeSameDayPurchases(records: ConsumptionPurchaseRecord[]): MergedPurchase[] {
  const byDate = new Map<string, number>();
  let basis: BaseQuantityBasis = "each";

  for (const record of records) {
    const base = toBaseQuantity(record.specValue, record.specUnit);
    basis = base.basis;
    const total = base.value * record.quantity;
    byDate.set(record.purchaseDate, (byDate.get(record.purchaseDate) ?? 0) + total);
  }

  return [...byDate.entries()]
    .map(([date, baseQuantity]) => ({ date, baseQuantity, basis }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Section 12: a 5-purchase sliding window (total quantity ÷ total days
// spanned) gives the average daily consumption rate, which projects today's
// estimated remaining stock and days until it runs out. Requires at least 3
// distinct purchase dates; "today" is passed in so this stays a pure function.
export function calculateConsumption(
  records: ConsumptionPurchaseRecord[],
  today: Date
): ConsumptionEstimate | null {
  const merged = mergeSameDayPurchases(records);
  if (merged.length < MIN_PURCHASES) {
    return null;
  }

  const window = merged.slice(-WINDOW_SIZE);
  const totalQuantity = window.reduce((sum, entry) => sum + entry.baseQuantity, 0);

  const firstDate = new Date(window[0].date);
  const lastPurchase = window[window.length - 1];
  const lastDate = new Date(lastPurchase.date);
  const spanDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / MS_PER_DAY));

  const dailyRate = totalQuantity / spanDays;

  const daysSinceLastPurchase = Math.round((today.getTime() - lastDate.getTime()) / MS_PER_DAY);
  const estimatedRemaining = lastPurchase.baseQuantity - dailyRate * daysSinceLastPurchase;
  const estimatedDaysRemaining = estimatedRemaining / dailyRate;

  return {
    basis: lastPurchase.basis,
    dailyRate: round2(dailyRate),
    estimatedRemaining: round2(estimatedRemaining),
    estimatedDaysRemaining: round2(estimatedDaysRemaining),
  };
}
