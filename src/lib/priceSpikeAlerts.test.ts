import { describe, it, expect } from "vitest";
import { detectPriceSpikes } from "@/lib/priceSpikeAlerts";

describe("detectPriceSpikes", () => {
  it("flags a product whose price change exceeds the 15% threshold", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [
          { unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false },
          { unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false },
        ],
      },
    ]);

    expect(spikes).toEqual([{ productId: "product-1", newPrice: 5.0, changePercent: 25 }]);
  });

  it("does not flag a product exactly at the 15% threshold (must exceed, not just reach)", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [
          { unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false },
          { unitPrice: 4.6, specValue: 2, specUnit: "L", isPromotion: false },
        ],
      },
    ]);

    expect(spikes).toEqual([]);
  });

  it("ignores a product with fewer than 2 normal-price purchases", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "product-1",
        purchases: [{ unitPrice: 5.0, specValue: 2, specUnit: "L", isPromotion: false }],
      },
    ]);

    expect(spikes).toEqual([]);
  });

  it("checks each product independently and only returns the ones that spiked", () => {
    const spikes = detectPriceSpikes([
      {
        productId: "steady-product",
        purchases: [
          { unitPrice: 4.0, specValue: 2, specUnit: "L", isPromotion: false },
          { unitPrice: 4.1, specValue: 2, specUnit: "L", isPromotion: false },
        ],
      },
      {
        productId: "spiking-product",
        purchases: [
          { unitPrice: 2.0, specValue: 500, specUnit: "g", isPromotion: false },
          { unitPrice: 3.0, specValue: 500, specUnit: "g", isPromotion: false },
        ],
      },
    ]);

    expect(spikes).toEqual([{ productId: "spiking-product", newPrice: 3.0, changePercent: 50 }]);
  });
});
