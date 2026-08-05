import { describe, it, expect } from "vitest";
import { rowsToCsv } from "@/lib/exportCsv";

describe("rowsToCsv", () => {
  it("renders a header row followed by one row per line item", () => {
    const csv = rowsToCsv([
      {
        purchaseDate: "2026-08-04",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        productNameEn: "Anchor Blue Milk",
        productNameZh: "安科蓝带牛奶",
        category: "Food - Dairy & Bakery",
        quantity: 1,
        specValue: 2,
        specUnit: "L",
        unitPrice: 4.5,
        isPromotion: false,
        uploader: "eason",
      },
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "purchase_date,store_name_en,store_name_zh,product_name_en,product_name_zh,category,quantity,spec_value,spec_unit,unit_price,is_promotion,uploader"
    );
    expect(lines[1]).toBe(
      "2026-08-04,Countdown,城内城外,Anchor Blue Milk,安科蓝带牛奶,Food - Dairy & Bakery,1,2,L,4.5,false,eason"
    );
  });

  it("quotes and escapes fields containing commas or quotes", () => {
    const csv = rowsToCsv([
      {
        purchaseDate: "2026-08-04",
        storeNameEn: 'Pak"nSave, Newmarket',
        storeNameZh: "帕克超市",
        productNameEn: "Milk",
        productNameZh: "牛奶",
        category: "Food - Dairy & Bakery",
        quantity: 1,
        specValue: 2,
        specUnit: "L",
        unitPrice: 4.5,
        isPromotion: false,
        uploader: "eason",
      },
    ]);

    expect(csv.split("\r\n")[1]).toContain('"Pak""nSave, Newmarket"');
  });

  it("returns just the header for no rows", () => {
    const csv = rowsToCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});
