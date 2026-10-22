import { normalizeUnitPrice, type UnitBasis } from "@/lib/units";

export interface PriceTrendRecord {
  storeId: string | null;
  storeNameEn: string;
  storeNameZh: string;
  storeShortNameEn: string;
  storeShortNameZh: string;
  purchaseDate: string;
  unitPrice: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

export interface PriceTrendPoint {
  // The chart draws one line per Store (issue 29), named in its legend.
  storeId: string | null;
  storeNameEn: string;
  storeNameZh: string;
  // The legend labels each line with this, to stay short on a phone.
  storeShortNameEn: string;
  storeShortNameZh: string;
  purchaseDate: string;
  basis: UnitBasis;
  value: number;
  isPromotion: boolean;
}

// Section 10: the trend chart plots every purchase (promotional included,
// marked with a distinct style), unlike calculatePriceChange which excludes
// them. Assumes records are already in chronological order.
export function buildPriceTrend(records: PriceTrendRecord[]): PriceTrendPoint[] {
  return records.map((record) => {
    const normalized = normalizeUnitPrice(record.unitPrice, record.specValue, record.specUnit);
    return {
      storeId: record.storeId,
      storeNameEn: record.storeNameEn,
      storeNameZh: record.storeNameZh,
      storeShortNameEn: record.storeShortNameEn,
      storeShortNameZh: record.storeShortNameZh,
      purchaseDate: record.purchaseDate,
      basis: normalized.basis,
      value: normalized.value,
      isPromotion: record.isPromotion,
    };
  });
}
