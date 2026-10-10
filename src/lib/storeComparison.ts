import { normalizeUnitPrice, type UnitBasis } from "@/lib/units";

export interface StoreComparisonRecord {
  storeId: string | null;
  storeNameEn: string;
  storeNameZh: string;
  purchaseDate: string;
  unitPrice: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

export interface StoreComparisonEntry {
  storeId: string;
  storeNameEn: string;
  storeNameZh: string;
  basis: UnitBasis;
  value: number;
  purchaseDate: string;
}

// Section 11: compares each store's latest *normal-price* purchase — same
// promotion-exclusion and unit-normalization rules as Section 10's price
// change, just grouped by store instead of taken as a single before/after
// pair. Grouped by Store (issue 29), so two branches of one chain are two
// entries and one branch is one entry however its receipts spelled it; the
// names shown are those on the Store's latest normal-price receipt. A
// purchase with no Store is skipped, as in the Same-Store Price Change. Callers with fewer than 2 entries should show "no purchase
// records from other stores yet" rather than a comparison.
export function compareStores(records: StoreComparisonRecord[]): StoreComparisonEntry[] {
  const latestByStore = new Map<string, StoreComparisonRecord & { storeId: string }>();
  for (const record of records) {
    if (record.isPromotion || record.storeId === null) {
      continue;
    }
    const existing = latestByStore.get(record.storeId);
    if (!existing || record.purchaseDate > existing.purchaseDate) {
      latestByStore.set(record.storeId, { ...record, storeId: record.storeId });
    }
  }

  return [...latestByStore.values()]
    .map((record) => {
      const normalized = normalizeUnitPrice(record.unitPrice, record.specValue, record.specUnit);
      return {
        storeId: record.storeId,
        storeNameEn: record.storeNameEn,
        storeNameZh: record.storeNameZh,
        basis: normalized.basis,
        value: normalized.value,
        purchaseDate: record.purchaseDate,
      };
    })
    .sort((a, b) => a.value - b.value);
}
