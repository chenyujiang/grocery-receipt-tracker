import { pickText, type Language } from "@/lib/bilingual";
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

export interface TrendLegendEntry {
  storeId: string;
  label: string;
}

// Issue 29: one legend entry per Store line, in order of the Store's first
// purchase so a product's colours stay put as newer purchases arrive. A
// purchase with no Store belongs to no line, so it gets no entry.
//
// The branch alone keeps the legend short on a phone — unless another Store
// on the chart has the same short name, when chain and branch tell the two
// lines apart.
export function trendLegend(points: PriceTrendPoint[], language: Language): TrendLegendEntry[] {
  const firstPoints = new Map<string, PriceTrendPoint>();
  for (const point of points) {
    if (point.storeId !== null && !firstPoints.has(point.storeId)) {
      firstPoints.set(point.storeId, point);
    }
  }
  const stores = [...firstPoints];
  const shortLabels = stores.map(([, point]) =>
    pickText(point.storeShortNameEn, point.storeShortNameZh, language)
  );
  return stores.map(([storeId, point], index) => {
    const label = shortLabels[index];
    const clashes = shortLabels.filter((other) => other === label).length > 1;
    return { storeId, label: clashes ? pickText(point.storeNameEn, point.storeNameZh, language) : label };
  });
}
