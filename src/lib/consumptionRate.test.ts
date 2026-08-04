import { describe, it, expect } from "vitest";
import { calculateConsumption } from "@/lib/consumptionRate";

describe("calculateConsumption", () => {
  it("estimates daily consumption and days remaining from a purchase history", () => {
    // Three 500g purchases, 10 days apart -> 1500g over 20 days = 75g/day.
    // Last purchase (500g) was 4 days before "today" -> 500 - 75*4 = 200g left,
    // 200 / 75 ≈ 2.67 days remaining.
    const result = calculateConsumption(
      [
        { purchaseDate: "2026-01-01", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-11", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-21", quantity: 1, specValue: 500, specUnit: "g" },
      ],
      new Date("2026-01-25")
    );

    expect(result).toEqual({
      basis: "g",
      dailyRate: 75,
      estimatedRemaining: 200,
      estimatedDaysRemaining: 2.67,
    });
  });

  it("returns null with fewer than 3 distinct purchase dates", () => {
    const result = calculateConsumption(
      [
        { purchaseDate: "2026-01-01", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-11", quantity: 1, specValue: 500, specUnit: "g" },
      ],
      new Date("2026-01-15")
    );

    expect(result).toBeNull();
  });

  it("merges same-day purchases before computing the window", () => {
    // 01-01 has two 500g purchases (bought two at once) -> counts as one
    // 1000g purchase for that day, not two separate window entries.
    const result = calculateConsumption(
      [
        { purchaseDate: "2026-01-01", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-01", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-11", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-21", quantity: 1, specValue: 500, specUnit: "g" },
      ],
      new Date("2026-01-25")
    );

    // total = 1000 + 500 + 500 = 2000g over 20 days -> 100g/day
    // last purchase 500g, 4 days ago -> 500 - 400 = 100g left -> 1 day remaining
    expect(result).toEqual({
      basis: "g",
      dailyRate: 100,
      estimatedRemaining: 100,
      estimatedDaysRemaining: 1,
    });
  });

  it("only considers the 5 most recent purchases (sliding window)", () => {
    const result = calculateConsumption(
      [
        // This wildly different outlier is 6th-from-latest and must be excluded.
        { purchaseDate: "2025-12-22", quantity: 1, specValue: 5_000_000, specUnit: "g" },
        { purchaseDate: "2026-01-01", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-11", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-21", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-01-31", quantity: 1, specValue: 500, specUnit: "g" },
        { purchaseDate: "2026-02-10", quantity: 1, specValue: 500, specUnit: "g" },
      ],
      new Date("2026-02-14")
    );

    // window = last 5 (Jan 1 - Feb 10): 2500g over 40 days -> 62.5g/day
    // last purchase 500g, 4 days ago -> 500 - 250 = 250g left -> 4 days remaining
    expect(result).toEqual({
      basis: "g",
      dailyRate: 62.5,
      estimatedRemaining: 250,
      estimatedDaysRemaining: 4,
    });
  });
});
