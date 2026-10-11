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

export interface StorePurchaseRecord extends PurchaseRecord {
  storeId: string | null;
}

export interface StorePriceChange {
  storeId: string;
  change: PriceChange;
}

// The Same-Store Price Change rule, in its one home: purchases are grouped by
// Store before calculatePriceChange ever sees them, so two purchases at two
// different Stores are never compared. calculatePriceChange stays
// store-unaware — it answers "what did these purchases do", this decides
// which purchases belong together. Stores come back in order of first
// appearance. A purchase with no Store is skipped: nothing can prove two of
// them were at the same Store.
export function calculatePriceChangesByStore(
  records: StorePurchaseRecord[]
): StorePriceChange[] {
  const recordsByStore = new Map<string, StorePurchaseRecord[]>();
  for (const record of records) {
    if (record.storeId === null) {
      continue;
    }
    const storeRecords = recordsByStore.get(record.storeId) ?? [];
    storeRecords.push(record);
    recordsByStore.set(record.storeId, storeRecords);
  }

  const changes: StorePriceChange[] = [];
  for (const [storeId, storeRecords] of recordsByStore) {
    const change = calculatePriceChange(storeRecords);
    if (change) {
      changes.push({ storeId, change });
    }
  }
  return changes;
}

// The Same-Store Price Change at one Store, or null when that Store has too
// few normal-price purchases to compare.
export function priceChangeAtStore(
  records: StorePurchaseRecord[],
  storeId: string
): PriceChange | null {
  return (
    calculatePriceChangesByStore(records).find((entry) => entry.storeId === storeId)?.change ?? null
  );
}
