import { describe, it, expect } from "vitest";
import { calculatePriceChange, calculatePriceChangesByStore } from "@/lib/priceChange";

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

describe("calculatePriceChangesByStore", () => {
  it("compares purchases only within the same Store, never across two Stores", () => {
    // Hornby: $1.00/100g -> $1.10/100g (+10%). Riccarton: $1.50/100g -> $1.80/100g (+20%).
    // Interleaved by date, so a cross-store comparison of the last two rows
    // (Hornby $1.10 -> Riccarton $1.80, +63.64%) would be the bug this exists to prevent.
    const result = calculatePriceChangesByStore([
      { storeId: "hornby", unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "riccarton", unitPrice: 7.5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "hornby", unitPrice: 5.5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "riccarton", unitPrice: 9, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(
      result.map(({ storeId, change }) => ({ storeId, changePercent: change.changePercent }))
    ).toEqual([
      { storeId: "hornby", changePercent: 10 },
      { storeId: "riccarton", changePercent: 20 },
    ]);
  });

  it("leaves out a Store with only one normal-price purchase, rather than reporting no change there", () => {
    const result = calculatePriceChangesByStore([
      { storeId: "hornby", unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "riccarton", unitPrice: 7.5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "hornby", unitPrice: 6, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(result.map(({ storeId }) => storeId)).toEqual(["hornby"]);
  });

  it("never uses a promotional purchase as either end of a Store's comparison", () => {
    const result = calculatePriceChangesByStore([
      { storeId: "hornby", unitPrice: 2, specValue: 500, specUnit: "g", isPromotion: true },
      { storeId: "hornby", unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "hornby", unitPrice: 6, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "hornby", unitPrice: 3, specValue: 500, specUnit: "g", isPromotion: true },
    ]);

    // $5 -> $6 is +20%. Letting either promo in as an end would give +200% or -50%.
    expect(
      result.map(({ storeId, change }) => ({ storeId, changePercent: change.changePercent }))
    ).toEqual([{ storeId: "hornby", changePercent: 20 }]);
  });

  it("keeps an unknown-branch Store apart from a named branch of the same chain", () => {
    // An unknown-branch Store is its own Store row, so it reaches this
    // function as its own storeId — one purchase there and one at Hornby are
    // not two purchases at one Store.
    const result = calculatePriceChangesByStore([
      { storeId: "woolworths-unknown-branch", unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "woolworths-hornby", unitPrice: 6, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(result).toEqual([]);
  });

  it("skips purchases with no Store, rather than comparing them with each other", () => {
    // Two receipts that never got a Store could be from anywhere — a +20%
    // between them is a rise nothing can prove happened at one Store.
    const result = calculatePriceChangesByStore([
      { storeId: null, unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "hornby", unitPrice: 5, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: null, unitPrice: 6, specValue: 500, specUnit: "g", isPromotion: false },
      { storeId: "hornby", unitPrice: 5.5, specValue: 500, specUnit: "g", isPromotion: false },
    ]);

    expect(
      result.map(({ storeId, change }) => ({ storeId, changePercent: change.changePercent }))
    ).toEqual([{ storeId: "hornby", changePercent: 10 }]);
  });
});
