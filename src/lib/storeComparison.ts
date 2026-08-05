import { normalizeUnitPrice, type UnitBasis } from "@/lib/units";

export interface StoreComparisonRecord {
  storeNameEn: string;
  storeNameZh: string;
  purchaseDate: string;
  unitPrice: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

export interface StoreComparisonEntry {
  storeNameEn: string;
  storeNameZh: string;
  basis: UnitBasis;
  value: number;
  purchaseDate: string;
}

// Section 11: compares each store's latest *normal-price* purchase — same
// promotion-exclusion and unit-normalization rules as Section 10's price
// change, just grouped by store instead of taken as a single before/after
// pair. Stores are identified by their English name (there's no separate
// stores table). Callers with fewer than 2 entries should show "no purchase
// records from other stores yet" rather than a comparison.
export function compareStores(records: StoreComparisonRecord[]): StoreComparisonEntry[] {
  const latestByStore = new Map<string, StoreComparisonRecord>();
  for (const record of records) {
    if (record.isPromotion) {
      continue;
    }
    const existing = latestByStore.get(record.storeNameEn);
    if (!existing || record.purchaseDate > existing.purchaseDate) {
      latestByStore.set(record.storeNameEn, record);
    }
  }

  return [...latestByStore.values()]
    .map((record) => {
      const normalized = normalizeUnitPrice(record.unitPrice, record.specValue, record.specUnit);
      return {
        storeNameEn: record.storeNameEn,
        storeNameZh: record.storeNameZh,
        basis: normalized.basis,
        value: normalized.value,
        purchaseDate: record.purchaseDate,
      };
    })
    .sort((a, b) => a.value - b.value);
}
