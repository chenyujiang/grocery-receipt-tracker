// Section 10: normalize a purchase's unit price onto a common comparable
// basis — weight to price-per-100g, volume to price-per-100ml, count-based
// units are left as-is since "per item" is already the smallest unit.
export type UnitBasis = "per_100g" | "per_100ml" | "each";

export interface NormalizedUnitPrice {
  basis: UnitBasis;
  value: number;
}

const GRAMS_PER_UNIT: Record<string, number> = { g: 1, kg: 1000 };
const ML_PER_UNIT: Record<string, number> = { ml: 1, l: 1000 };

export function normalizeUnitPrice(
  unitPrice: number,
  specValue: number,
  specUnit: string
): NormalizedUnitPrice {
  const unit = specUnit.toLowerCase();

  if (unit in GRAMS_PER_UNIT) {
    const grams = specValue * GRAMS_PER_UNIT[unit];
    return { basis: "per_100g", value: (unitPrice / grams) * 100 };
  }

  if (unit in ML_PER_UNIT) {
    const ml = specValue * ML_PER_UNIT[unit];
    return { basis: "per_100ml", value: (unitPrice / ml) * 100 };
  }

  return { basis: "each", value: unitPrice };
}

export type BaseQuantityBasis = "g" | "ml" | "each";

export interface BaseQuantity {
  basis: BaseQuantityBasis;
  value: number;
}

// Section 12: convert a purchase's spec into a common comparable quantity
// (grams, millilitres, or item count) for summing across purchases.
export function toBaseQuantity(specValue: number, specUnit: string): BaseQuantity {
  const unit = specUnit.toLowerCase();

  if (unit in GRAMS_PER_UNIT) {
    return { basis: "g", value: specValue * GRAMS_PER_UNIT[unit] };
  }
  if (unit in ML_PER_UNIT) {
    return { basis: "ml", value: specValue * ML_PER_UNIT[unit] };
  }
  return { basis: "each", value: specValue };
}
