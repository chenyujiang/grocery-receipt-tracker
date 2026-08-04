import { describe, it, expect } from "vitest";
import { normalizeUnitPrice, toBaseQuantity } from "@/lib/units";

describe("normalizeUnitPrice", () => {
  it("normalizes a gram-based product to price per 100g", () => {
    // $5 for a 500g item -> $1 per 100g
    expect(normalizeUnitPrice(5, 500, "g")).toEqual({ basis: "per_100g", value: 1 });
  });

  it("converts kilograms to grams before normalizing", () => {
    // $8 for a 2kg (2000g) item -> $0.4 per 100g
    expect(normalizeUnitPrice(8, 2, "kg")).toEqual({ basis: "per_100g", value: 0.4 });
  });

  it("normalizes a millilitre-based product to price per 100ml", () => {
    // $2 for a 250ml item -> $0.8 per 100ml
    expect(normalizeUnitPrice(2, 250, "ml")).toEqual({ basis: "per_100ml", value: 0.8 });
  });

  it("converts litres to millilitres before normalizing", () => {
    // $3 for a 1L (1000ml) item -> $0.3 per 100ml
    expect(normalizeUnitPrice(3, 1, "L")).toEqual({ basis: "per_100ml", value: 0.3 });
  });

  it("leaves count-based units unconverted, comparing the unit price as-is", () => {
    // $2.50 each -> not weight or volume, so "each" is the smallest comparable unit
    expect(normalizeUnitPrice(2.5, 1, "each")).toEqual({ basis: "each", value: 2.5 });
  });
});

describe("toBaseQuantity", () => {
  it("converts a weight spec to grams", () => {
    expect(toBaseQuantity(2, "kg")).toEqual({ basis: "g", value: 2000 });
  });

  it("converts a volume spec to millilitres", () => {
    expect(toBaseQuantity(1, "L")).toEqual({ basis: "ml", value: 1000 });
  });

  it("leaves count-based specs unconverted", () => {
    expect(toBaseQuantity(3, "each")).toEqual({ basis: "each", value: 3 });
  });
});
