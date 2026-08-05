import { describe, it, expect } from "vitest";
import { diffReceiptItemFields } from "@/lib/editLog";

const BASE = {
  rawNameEn: "Anchor Blue Milk",
  rawNameZh: "安科蓝带牛奶",
  quantity: 1,
  unitSpecValue: 2,
  unitSpecUnit: "L",
  unitPrice: 4.5,
  originalPrice: null,
  isPromotion: false,
  subtotal: 4.5,
};

describe("diffReceiptItemFields", () => {
  it("returns one entry per changed field, with old and new values stringified", () => {
    const changes = diffReceiptItemFields(BASE, {
      ...BASE,
      rawNameEn: "Anchor Blue Milk 2L",
      quantity: 2,
    });

    expect(changes).toEqual([
      { fieldName: "rawNameEn", oldValue: "Anchor Blue Milk", newValue: "Anchor Blue Milk 2L" },
      { fieldName: "quantity", oldValue: "1", newValue: "2" },
    ]);
  });

  it("returns an empty array when nothing changed", () => {
    expect(diffReceiptItemFields(BASE, { ...BASE })).toEqual([]);
  });

  it("stringifies booleans and nulls", () => {
    const changes = diffReceiptItemFields(BASE, { ...BASE, isPromotion: true, originalPrice: 6.0 });

    expect(changes).toEqual([
      { fieldName: "originalPrice", oldValue: "null", newValue: "6" },
      { fieldName: "isPromotion", oldValue: "false", newValue: "true" },
    ]);
  });
});
