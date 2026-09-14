import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here, never Supabase
// internals. `fetchExportRows` also goes through `fetchCircleMembers`, which
// reads `profiles` off the same client, so one fake covers both queries.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { rowsToCsv, fetchExportRows } from "@/lib/exportCsv";

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

  // Not every Receipt Item has a unit spec (an item sold "each" has none).
  // The export is a raw dump, so such a row is still exported — with the two
  // spec columns blank, rather than dropped or filled with "null".
  it("renders an item with no unit spec as blank spec columns", () => {
    const csv = rowsToCsv([
      {
        purchaseDate: "2026-08-04",
        storeNameEn: "Countdown",
        storeNameZh: "城内城外",
        productNameEn: "Avocado",
        productNameZh: "牛油果",
        category: "Food - Fruits",
        quantity: 3,
        specValue: null,
        specUnit: null,
        unitPrice: 1.5,
        isPromotion: false,
        uploader: "eason",
      },
    ]);

    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(
      "2026-08-04,Countdown,城内城外,Avocado,牛油果,Food - Fruits,3,,,1.5,false,eason"
    );
  });

  it("returns just the header for no rows", () => {
    const csv = rowsToCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});

const RANGE = { from: "2026-08-01", to: "2026-08-31" };

const MEMBERS = {
  data: [
    { user_id: "user-1", display_name: "Eason", role: "owner", circle_id: "circle-1" },
    { user_id: "user-2", display_name: "Mia", role: "member", circle_id: "circle-1" },
  ],
  error: null,
};

// One fully-populated row, in the post-embed shape PostgREST returns: the
// two to-one embeds (`products`, `receipts`) arrive as objects, not arrays.
const FULL_ROW = {
  quantity: 1,
  unit_spec_value: 2,
  unit_spec_unit: "L",
  unit_price: 4.5,
  is_promotion: false,
  raw_name_en: "ANCHOR BLUE MILK 2L",
  raw_name_zh: "安佳蓝牛奶 2L",
  products: {
    canonical_name_en: "Anchor Blue Milk",
    canonical_name_zh: "安佳蓝牛奶",
    category: "Food - Dairy & Bakery",
  },
  receipts: {
    purchase_date: "2026-08-04",
    store_name_en: "Countdown",
    store_name_zh: "倒数超市",
    status: "confirmed",
    uploaded_by: "user-1",
  },
};

describe("fetchExportRows", () => {
  it("maps a line item into an export row, resolving the uploader to a display name", async () => {
    installFakeSupabase(supabase, {
      tables: { receipt_items: { data: [FULL_ROW], error: null }, profiles: MEMBERS },
    });

    const rows = await fetchExportRows(RANGE);

    expect(rows).toEqual([
      {
        purchaseDate: "2026-08-04",
        storeNameEn: "Countdown",
        storeNameZh: "倒数超市",
        productNameEn: "Anchor Blue Milk",
        productNameZh: "安佳蓝牛奶",
        category: "Food - Dairy & Bakery",
        quantity: 1,
        specValue: 2,
        specUnit: "L",
        unitPrice: 4.5,
        isPromotion: false,
        uploader: "Eason",
      },
    ]);
  });

  // Section 14: the export covers the whole circle's *confirmed* items in the
  // chosen range. Both range bounds filter through the `receipts` embed, which
  // is why the select uses `receipts!inner`.
  it("asks for confirmed items only, within the range, oldest purchase first", async () => {
    const db = installFakeSupabase(supabase, {
      tables: { receipt_items: { data: [], error: null }, profiles: MEMBERS },
    });

    await fetchExportRows(RANGE);

    const calls = db.callsFor("receipt_items");
    expect(db.from).toHaveBeenCalledWith("receipt_items");
    expect(calls).toContainEqual(["eq", "receipts.status", "confirmed"]);
    expect(calls).toContainEqual(["gte", "receipts.purchase_date", "2026-08-01"]);
    expect(calls).toContainEqual(["lte", "receipts.purchase_date", "2026-08-31"]);
    expect(calls).toContainEqual([
      "order",
      "purchase_date",
      { foreignTable: "receipts", ascending: true },
    ]);
    const [, select] = calls.find(([method]) => method === "select") ?? [];
    expect(select).toContain("receipts!inner");
  });

  // The Bilingual Name rule (CONTEXT.md): a Product's canonical name wins, the
  // Source Text is the fallback — never an empty cell. An item that was never
  // matched to a Product has no canonical name at all.
  it("falls back to the receipt's source text when a product or translation is missing", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipt_items: {
          data: [
            { ...FULL_ROW, products: null },
            {
              ...FULL_ROW,
              raw_name_zh: null,
              products: { ...FULL_ROW.products, canonical_name_zh: null },
            },
            { ...FULL_ROW, receipts: { ...FULL_ROW.receipts, store_name_zh: null } },
          ],
          error: null,
        },
        profiles: MEMBERS,
      },
    });

    const [unmatched, untranslated, storeUntranslated] = await fetchExportRows(RANGE);

    expect(unmatched.productNameEn).toBe("ANCHOR BLUE MILK 2L");
    expect(unmatched.productNameZh).toBe("安佳蓝牛奶 2L");
    expect(unmatched.category).toBe("");

    // No translation anywhere: both name columns fall back to the English.
    expect(untranslated.productNameZh).toBe("Anchor Blue Milk");

    expect(storeUntranslated.storeNameZh).toBe("Countdown");
  });

  // An uploader who has since left the circle has no `profiles` row, so there
  // is no display name to resolve — export the raw id rather than a blank.
  it("falls back to the raw user id when the uploader is not a current member", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipt_items: {
          data: [{ ...FULL_ROW, receipts: { ...FULL_ROW.receipts, uploaded_by: "user-gone" } }],
          error: null,
        },
        profiles: MEMBERS,
      },
    });

    const [row] = await fetchExportRows(RANGE);

    expect(row.uploader).toBe("user-gone");
  });

  it("returns no rows when the range holds nothing, without failing", async () => {
    installFakeSupabase(supabase, {
      tables: { receipt_items: { data: null, error: null }, profiles: MEMBERS },
    });

    await expect(fetchExportRows(RANGE)).resolves.toEqual([]);
  });

  // `PostgrestError` is a plain object, not an Error — rethrown raw so the
  // caller can hand it to `errorMessage()`.
  it("rethrows a Postgrest error verbatim, without reading circle members", async () => {
    const error = { message: "permission denied for table receipt_items", code: "42501" };
    // `profiles` is deliberately unprepared: a failed read must not go on to
    // query members. The fake throws if it is touched.
    const db = installFakeSupabase(supabase, {
      tables: { receipt_items: { data: null, error } },
    });

    await expect(fetchExportRows(RANGE)).rejects.toBe(error);
    expect(db.from).not.toHaveBeenCalledWith("profiles");
  });
});
