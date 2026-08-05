import { normalizeUnitPrice, type UnitBasis } from "@/lib/units";

export interface PriceTrendRecord {
  purchaseDate: string;
  unitPrice: number;
  specValue: number;
  specUnit: string;
  isPromotion: boolean;
}

export interface PriceTrendPoint {
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
      purchaseDate: record.purchaseDate,
      basis: normalized.basis,
      value: normalized.value,
      isPromotion: record.isPromotion,
    };
  });
}
