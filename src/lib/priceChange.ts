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

// A price change with the two purchases it compared, for callers that need
// more of them than their prices — a date, a Store name.
export interface PurchaseComparison<T> {
  change: PriceChange;
  baseline: T;
  current: T;
}

// Section 10: the two most recent *normal-price* purchases — promotional
// rows are filtered out entirely before picking "current" and "baseline", so
// a promo never becomes the baseline and a promo purchase never gets
// evaluated as "current" either. Null with fewer than two.
function comparePurchases<T extends PurchaseRecord>(records: T[]): PurchaseComparison<T> | null {
  const normalPriceRecords = records.filter((record) => !record.isPromotion);
  if (normalPriceRecords.length < 2) {
    return null;
  }
  const [baseline, current] = normalPriceRecords.slice(-2);
  return { change: priceChangeBetween(baseline, current), baseline, current };
}

export function calculatePriceChange(records: PurchaseRecord[]): PriceChange | null {
  return comparePurchases(records)?.change ?? null;
}

function priceChangeBetween(baselineRecord: PurchaseRecord, currentRecord: PurchaseRecord): PriceChange {
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

export interface StorePriceChange<T extends StorePurchaseRecord = StorePurchaseRecord>
  extends PurchaseComparison<T> {
  storeId: string;
}

// The Same-Store Price Change rule, in its one home: purchases are grouped by
// Store before they're ever compared, so two purchases at two
// different Stores are never compared. The comparison stays
// store-unaware — it answers "what did these purchases do", this decides
// which purchases belong together. Every per-Store function below starts
// here. Stores come back in order of first appearance. A purchase with no
// Store is skipped: nothing can prove two of them were at the same Store.
function recordsByStore<T extends StorePurchaseRecord>(records: T[]): Map<string, T[]> {
  const byStore = new Map<string, T[]>();
  for (const record of records) {
    if (record.storeId === null) {
      continue;
    }
    const storeRecords = byStore.get(record.storeId) ?? [];
    storeRecords.push(record);
    byStore.set(record.storeId, storeRecords);
  }
  return byStore;
}

export function calculatePriceChangesByStore<T extends StorePurchaseRecord>(
  records: T[]
): StorePriceChange<T>[] {
  const changes: StorePriceChange<T>[] = [];
  for (const [storeId, storeRecords] of recordsByStore(records)) {
    const comparison = comparePurchases(storeRecords);
    if (comparison) {
      changes.push({ storeId, ...comparison });
    }
  }
  return changes;
}

// The Same-Store Price Change at one Store, with the two purchases it
// compared, or null when that Store has too few normal-price purchases.
export function priceChangeAtStore<T extends StorePurchaseRecord>(
  records: T[],
  storeId: string
): PurchaseComparison<T> | null {
  return comparePurchases(recordsByStore(records).get(storeId) ?? []);
}
