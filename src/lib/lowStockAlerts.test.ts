import { describe, it, expect } from "vitest";
import { detectLowStock } from "@/lib/lowStockAlerts";

const TODAY = new Date("2026-08-05");

describe("detectLowStock", () => {
  it("flags a product as newly low when estimated days remaining drops below 5 and it wasn't already flagged", () => {
    const result = detectLowStock(
      [
        {
          productId: "product-1",
          lowStockAlertActive: false,
          purchases: [
            { purchaseDate: "2026-07-01", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-08", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-15", quantity: 1, specValue: 500, specUnit: "g" },
          ],
        },
      ],
      TODAY
    );

    expect(result.newAlerts).toHaveLength(1);
    expect(result.newAlerts[0].productId).toBe("product-1");
    expect(result.recoveries).toEqual([]);
  });

  it("does not re-flag a product that's already in an active low-stock episode", () => {
    const result = detectLowStock(
      [
        {
          productId: "product-1",
          lowStockAlertActive: true,
          purchases: [
            { purchaseDate: "2026-07-01", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-08", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-15", quantity: 1, specValue: 500, specUnit: "g" },
          ],
        },
      ],
      TODAY
    );

    expect(result.newAlerts).toEqual([]);
    expect(result.recoveries).toEqual([]);
  });

  it("recovers a product once estimated days remaining rises back above the threshold", () => {
    // Widely-spaced purchases -> a low daily rate, so the amount left right
    // after the latest purchase covers well more than 5 days.
    const result = detectLowStock(
      [
        {
          productId: "product-1",
          lowStockAlertActive: true,
          purchases: [
            { purchaseDate: "2026-07-08", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-22", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-08-05", quantity: 1, specValue: 500, specUnit: "g" },
          ],
        },
      ],
      new Date("2026-08-05")
    );

    expect(result.newAlerts).toEqual([]);
    expect(result.recoveries).toEqual(["product-1"]);
  });

  it("ignores a product with fewer than 3 purchases (insufficient data)", () => {
    const result = detectLowStock(
      [
        {
          productId: "product-1",
          lowStockAlertActive: false,
          purchases: [
            { purchaseDate: "2026-07-01", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-02", quantity: 1, specValue: 500, specUnit: "g" },
          ],
        },
      ],
      TODAY
    );

    expect(result.newAlerts).toEqual([]);
    expect(result.recoveries).toEqual([]);
  });

  it("checks each product independently", () => {
    const result = detectLowStock(
      [
        {
          productId: "low-product",
          lowStockAlertActive: false,
          purchases: [
            { purchaseDate: "2026-07-01", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-08", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-15", quantity: 1, specValue: 500, specUnit: "g" },
          ],
        },
        {
          productId: "well-stocked-product",
          lowStockAlertActive: false,
          purchases: [
            { purchaseDate: "2026-06-01", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-07-01", quantity: 1, specValue: 500, specUnit: "g" },
            { purchaseDate: "2026-08-05", quantity: 20, specValue: 500, specUnit: "g" },
          ],
        },
      ],
      TODAY
    );

    expect(result.newAlerts.map((alert) => alert.productId)).toEqual(["low-product"]);
  });
});
