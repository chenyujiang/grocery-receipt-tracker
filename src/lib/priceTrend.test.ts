import { describe, it, expect } from "vitest";
import { buildPriceTrend } from "@/lib/priceTrend";

describe("buildPriceTrend", () => {
  it("normalizes each purchase's unit price onto a comparable basis, preserving order and promotion flag", () => {
    const points = buildPriceTrend([
      { purchaseDate: "2026-07-01", unitPrice: 4.0, specValue: 500, specUnit: "g", isPromotion: false },
      { purchaseDate: "2026-07-15", unitPrice: 3.0, specValue: 500, specUnit: "g", isPromotion: true },
      { purchaseDate: "2026-08-01", unitPrice: 5.0, specValue: 1, specUnit: "kg", isPromotion: false },
    ]);

    expect(points).toEqual([
      { purchaseDate: "2026-07-01", basis: "per_100g", value: 0.8, isPromotion: false },
      { purchaseDate: "2026-07-15", basis: "per_100g", value: 0.6, isPromotion: true },
      { purchaseDate: "2026-08-01", basis: "per_100g", value: 0.5, isPromotion: false },
    ]);
  });

  it("returns an empty array for no purchase history", () => {
    expect(buildPriceTrend([])).toEqual([]);
  });
});
