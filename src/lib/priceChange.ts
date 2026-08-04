import { normalizeUnitPrice, type NormalizedUnitPrice } from "@/lib/units";

// A single product's purchase history, in chronological order (oldest first).
export interface PurchaseRecord {
  unitPrice: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

export interface PriceChange {
  changePercent: number;
  baseline: NormalizedUnitPrice;
  current: NormalizedUnitPrice;
}

// Section 10: compares the two most recent *normal-price* purchases —
// promotional rows are filtered out entirely before picking "current" and
// "baseline", so a promo never becomes the baseline and a promo purchase
// never gets evaluated as "current" either.
export function calculatePriceChange(records: PurchaseRecord[]): PriceChange | null {
  const normalPriceRecords = records.filter((record) => !record.isPromotion);
  if (normalPriceRecords.length < 2) {
    return null;
  }
  const [baselineRecord, currentRecord] = normalPriceRecords.slice(-2);

  const baseline = normalizeUnitPrice(
    baselineRecord.unitPrice,
    baselineRecord.specValue,
    baselineRecord.specUnit
  );
  const current = normalizeUnitPrice(
    currentRecord.unitPrice,
    currentRecord.specValue,
    currentRecord.specUnit
  );

  const rawChangePercent = ((current.value - baseline.value) / baseline.value) * 100;

  return {
    // Rounded to avoid floating-point noise (e.g. 19.999999999999996 instead of 20).
    changePercent: Math.round(rawChangePercent * 100) / 100,
    baseline,
    current,
  };
}
