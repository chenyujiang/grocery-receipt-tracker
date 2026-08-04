import { describe, it, expect } from "vitest";
import { calculatePriceChange } from "@/lib/priceChange";

describe("calculatePriceChange", () => {
  it("reports the percentage change between the last two normal-price purchases", () => {
    // $5/500g (=$1 per 100g) then $6/500g (=$1.20 per 100g) -> +20%
    const result = calculatePriceChange([
      { unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { unitPrice: 6, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(result).toEqual({
      changePercent: 20,
      baseline: { basis: "per_100g", value: 1 },
      current: { basis: "per_100g", value: 1.2 },
    });
  });

  it("skips promotional purchases entirely when picking the baseline and current price", () => {
    const result = calculatePriceChange([
      { unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false }, // $1/100g
      { unitPrice: 2, specValue: 500, specUnit: "g", isPromotion: true }, // promo — must be ignored
      { unitPrice: 6, specValue: 500, specUnit: "g", isPromotion: false }, // $1.20/100g
    ]);

    // Same +20% as the first test — if the promo leaked in as the baseline
    // ($0.40/100g), this would come out as a wildly different number.
    expect(result).toEqual({
      changePercent: 20,
      baseline: { basis: "per_100g", value: 1 },
      current: { basis: "per_100g", value: 1.2 },
    });
  });

  it("returns null when there's only one normal-price purchase to go on", () => {
    const result = calculatePriceChange([
      { unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(result).toBeNull();
  });

  it("returns null when every purchase on record is promotional", () => {
    const result = calculatePriceChange([
      { unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: true },
      { unitPrice: 4, specValue: 500, specUnit: "g", isPromotion: true },
    ]);

    expect(result).toBeNull();
  });
});
