import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase (for the access token / reads / writes), fetch (for the /api
// call), and imageResize (a browser Image/Canvas wrapper, not testable
// under jsdom — see its own file) are the external boundaries — mock them
// here, not the behavior we're testing (Section 6: photo upload, preview,
// and confirm).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/imageResize", () => ({
  resizeImageForUpload: vi.fn(),
}));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { resizeImageForUpload } from "@/lib/imageResize";
import {
  uploadReceipt,
  fetchReceiptDraft,
  confirmReceipt,
  editConfirmedReceipt,
  deleteReceipt,
  toItemUpdate,
} from "@/lib/receipts";
import type { DraftItem } from "@/lib/receipts";

function makeFile(content: string, type: string) {
  return new File([content], "receipt.jpg", { type });
}

/** The methods a table saw, for asserting a write did *not* happen. */
function methodsUsed(calls: Array<[string, ...unknown[]]>) {
  return calls.map(([method]) => method);
}

// Issue 17: the single place that strips `category` on the way from a
// DraftItem to an update payload. The invariant worth pinning down is the
// absence of the key — a field-by-field comparison would still pass if the
// strip broke, since every other field is copied verbatim.
describe("toItemUpdate", () => {
  const DRAFT_ITEM: DraftItem = {
    id: "item-1",
    rawNameEn: "Anchor Blue Milk 2L",
    rawNameZh: "安佳蓝顶牛奶 2升",
    quantity: 1,
    unitSpecValue: 2,
    unitSpecUnit: "L",
    unitPrice: 4.5,
    originalPrice: 5.2,
    isPromotion: true,
    subtotal: 4.5,
    productId: "product-1",
    category: "Food - Dairy & Bakery",
  };

  it("drops category, which belongs to the Product and is never written back through a ReceiptItem", () => {
    expect(toItemUpdate(DRAFT_ITEM)).not.toHaveProperty("category");
  });

  it("carries every other field through untouched", () => {
    const { category: _category, ...rest } = DRAFT_ITEM;

    expect(toItemUpdate(DRAFT_ITEM)).toEqual(rest);
  });
});

describe("uploadReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  // The `fetch` casts below are the HTTP boundary, not the Supabase one.
  it("sends the resized image and access token to the backend, and returns the receiptId", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: { access_token: "tok-1" } }, error: null } },
    });
    vi.mocked(resizeImageForUpload).mockResolvedValue({
      base64: "resized-base64-bytes",
      mediaType: "image/jpeg",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ receiptId: "receipt-1" }),
    } as never);

    const result = await uploadReceipt(makeFile("fake-image-bytes", "image/heic"));

    expect(result).toEqual({ receiptId: "receipt-1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/receipts/recognize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        }),
        body: JSON.stringify({ imageBase64: "resized-base64-bytes", mediaType: "image/jpeg" }),
      })
    );
  });

  it("throws when there is no active session", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: null }, error: null } },
    });

    await expect(uploadReceipt(makeFile("x", "image/jpeg"))).rejects.toThrow("Not signed in");
    expect(fetch).not.toHaveBeenCalled();
    expect(resizeImageForUpload).not.toHaveBeenCalled();
  });

  it("throws with the server's error message when the upload fails", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: { access_token: "tok-1" } }, error: null } },
    });
    vi.mocked(resizeImageForUpload).mockResolvedValue({
      base64: "resized-base64-bytes",
      mediaType: "image/jpeg",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "AI recognition quota used up" }),
    } as never);

    await expect(uploadReceipt(makeFile("x", "image/jpeg"))).rejects.toThrow(
      "AI recognition quota used up"
    );
  });
});

describe("fetchReceiptDraft", () => {
  // Issue 29: the detail page's picker starts on the Store a confirmed
  // receipt already points at.
  it("returns the Store a confirmed receipt points at", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            id: "receipt-1",
            store_id: "store-hornby",
            store_name_en: "Woolworths Hornby",
            store_name_zh: "沃尔沃斯 霍恩比店",
            purchase_date: "2026-08-01",
            total_amount: 4.5,
            status: "confirmed",
            original_image_url: null,
          },
          error: null,
        },
        receipt_items: { data: [], error: null },
      },
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.storeId).toBe("store-hornby");
  });

  // Issue 29, same rule as the receipt list and Home: the detail page names a
  // receipt by its Store. receiptHeader stays the printed header — the preview
  // screen and the duplicate check read that.
  it("names a receipt by its Store's chain and branch, and a draft with no Store by its printed header", async () => {
    const header = {
      id: "receipt-1",
      store_name_en: "Pak n Save Albany",
      store_name_zh: "派克储蓄奥尔巴尼",
      purchase_date: "2026-08-01",
      total_amount: 4.5,
      original_image_url: null,
    };
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            ...header,
            status: "confirmed",
            store_id: "store-albany",
            stores: {
              chain_name_en: "PAK'nSAVE",
              chain_name_zh: "派克储蓄",
              branch_name_en: "Albany",
              branch_name_zh: "奥尔巴尼",
            },
          },
          error: null,
        },
        receipt_items: { data: [], error: null },
      },
    });
    const confirmed = await fetchReceiptDraft("receipt-1");

    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: { ...header, status: "pending_review", store_id: null, stores: null },
          error: null,
        },
        receipt_items: { data: [], error: null },
      },
    });
    const draft = await fetchReceiptDraft("receipt-1");

    expect(confirmed.storeDisplayName).toEqual({ en: "PAK'nSAVE Albany", zh: "派克储蓄 奥尔巴尼" });
    expect(confirmed.receiptHeader.en).toBe("Pak n Save Albany");
    expect(draft.storeDisplayName).toEqual({ en: "Pak n Save Albany", zh: "派克储蓄奥尔巴尼" });
  });

  it("loads the receipt and its items, including each item's category via its matched product", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            id: "receipt-1",
            store_name_en: "Countdown Newmarket",
            store_name_zh: "倒数超市 Newmarket 店",
            purchase_date: "2026-08-01",
            total_amount: 4.5,
            status: "pending_review",
            original_image_url: "circle-1/abc.jpg",
          },
          error: null,
        },
        receipt_items: {
          data: [
            {
              id: "item-1",
              raw_name_en: "Anchor Blue Milk 2L",
              raw_name_zh: "安科蓝带牛奶 2升",
              quantity: 1,
              unit_spec_value: 2,
              unit_spec_unit: "L",
              unit_price: 4.5,
              original_price: null,
              is_promotion: false,
              subtotal: 4.5,
              product_id: "product-1",
              products: { category: "Food - Dairy & Bakery" },
            },
          ],
          error: null,
        },
      },
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.receiptHeader.en).toBe("Countdown Newmarket");
    expect(draft.status).toBe("pending_review");
    expect(draft.items).toEqual([
      {
        id: "item-1",
        rawNameEn: "Anchor Blue Milk 2L",
        rawNameZh: "安科蓝带牛奶 2升",
        quantity: 1,
        unitSpecValue: 2,
        unitSpecUnit: "L",
        unitPrice: 4.5,
        originalPrice: null,
        isPromotion: false,
        subtotal: 4.5,
        productId: "product-1",
        category: "Food - Dairy & Bakery",
      },
    ]);
  });

  // Issue 29: the store picker pre-fills "create this as a new branch" from
  // this, in the same shape confirmReceipt takes its Store in.
  it("returns the chain/branch split the AI read off the header", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            id: "receipt-1",
            store_name_en: "Woolworths Hornby",
            store_name_zh: "沃尔沃斯 霍恩比店",
            recognized_chain_en: "Woolworths",
            recognized_chain_zh: "沃尔沃斯",
            recognized_branch_en: "Hornby",
            recognized_branch_zh: "霍恩比",
            purchase_date: "2026-08-01",
            total_amount: 4.5,
            status: "pending_review",
            original_image_url: null,
          },
          error: null,
        },
        receipt_items: { data: [], error: null },
      },
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.recognizedStore).toEqual({
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: { en: "Hornby", zh: "霍恩比" },
    });
  });

  // CONTEXT.md, Bilingual Name: a Receipt Item or store with no Translation
  // reads back as its Source Text, so the review screen's Chinese fields are
  // never blank.
  it("reads a store and item with no Chinese translation back as their English source text", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: {
          data: {
            id: "receipt-1",
            store_name_en: "Four Square",
            store_name_zh: null,
            purchase_date: "2026-08-01",
            total_amount: 4.5,
            status: "pending_review",
            original_image_url: null,
          },
          error: null,
        },
        receipt_items: {
          data: [
            {
              id: "item-1",
              raw_name_en: "Anchor Blue Milk 2L",
              raw_name_zh: null,
              quantity: 1,
              unit_spec_value: 2,
              unit_spec_unit: "L",
              unit_price: 4.5,
              original_price: null,
              is_promotion: false,
              subtotal: 4.5,
              product_id: null,
              products: null,
            },
          ],
          error: null,
        },
      },
    });

    const draft = await fetchReceiptDraft("receipt-1");

    expect(draft.receiptHeader.zh).toBe("Four Square");
    expect(draft.items[0].rawNameZh).toBe("Anchor Blue Milk 2L");
    // Recognized before the chain/branch split existed.
    expect(draft.recognizedStore).toBeNull();
  });

  it("throws when the receipt can't be found", async () => {
    // `receipt_items` is left unprepared: reading items for a receipt that
    // isn't there would throw rather than pass quietly.
    installFakeSupabase(supabase, { tables: { receipts: { data: null, error: null } } });

    await expect(fetchReceiptDraft("missing-receipt")).rejects.toThrow("Receipt not found");
  });
});

const SAMPLE_ITEM_UPDATE = {
  id: "item-1",
  rawNameEn: "Anchor Blue Milk 2L",
  rawNameZh: "安科蓝带牛奶 2升",
  quantity: 1,
  unitSpecValue: 2,
  unitSpecUnit: "L",
  unitPrice: 4.2,
  originalPrice: null,
  isPromotion: false,
  subtotal: 4.2,
  productId: null,
};

const EXISTING_ITEM_ROW = {
  raw_name_en: SAMPLE_ITEM_UPDATE.rawNameEn,
  raw_name_zh: SAMPLE_ITEM_UPDATE.rawNameZh,
  quantity: SAMPLE_ITEM_UPDATE.quantity,
  unit_spec_value: SAMPLE_ITEM_UPDATE.unitSpecValue,
  unit_spec_unit: SAMPLE_ITEM_UPDATE.unitSpecUnit,
  unit_price: SAMPLE_ITEM_UPDATE.unitPrice,
  original_price: SAMPLE_ITEM_UPDATE.originalPrice,
  is_promotion: SAMPLE_ITEM_UPDATE.isPromotion,
  subtotal: SAMPLE_ITEM_UPDATE.subtotal,
};

// confirmReceipt's receipt_items access serves three purposes, in this order
// per run: read the existing row before diffing, write the update, and then
// (once, for price-spike alerts) read every affected product's confirmed
// history through fetchPurchaseHistories. The queue below is that order.
const EXISTING_ITEM = { data: EXISTING_ITEM_ROW, error: null };
const ITEM_UPDATED = { error: null };
const NO_HISTORY = { data: [], error: null };
const WROTE_OK = { error: null };

// receiptId defaults to an earlier receipt; the receipt being confirmed in
// these tests is "receipt-1".
function historyRow(productId: string, unitPrice: number, purchaseDate: string, receiptId = "receipt-earlier") {
  return {
    product_id: productId,
    receipt_id: receiptId,
    unit_price: unitPrice,
    quantity: 1,
    unit_spec_value: 2,
    unit_spec_unit: "L",
    is_promotion: false,
    receipts: {
      purchase_date: purchaseDate,
      store_id: "store-hornby",
      store_name_en: "Countdown",
      store_name_zh: "倒数超市",
    },
  };
}

const SIGNED_IN = { getUser: { data: { user: { id: "user-1" } }, error: null } };

// The Store the user confirmed on the preview screen, and resolveStore's
// lookup finding it already in the circle.
const HORNBY = {
  chain: { en: "Woolworths", zh: "沃尔沃斯" },
  branch: { en: "Hornby", zh: "霍恩比" },
};
const HORNBY_FOUND = {
  data: {
    id: "store-hornby",
    chain_name_en: "Woolworths",
    chain_name_zh: "沃尔沃斯",
    branch_name_en: "Hornby",
    branch_name_zh: "霍恩比",
  },
  error: null,
};
// What the AI read off a receipt that's then confirmed at Hornby, as it
// read it — so confirming there is no Store correction.
const READ_AS_HORNBY = {
  store_name_en: "WOOLWORTHS HORNBY",
  recognized_chain_en: "Woolworths",
  recognized_branch_en: "Hornby",
};
const RICCARTON = {
  chain: { en: "Woolworths", zh: "沃尔沃斯" },
  branch: { en: "Riccarton", zh: "里卡顿" },
};
const RICCARTON_FOUND = {
  data: {
    id: "store-riccarton",
    chain_name_en: "Woolworths",
    chain_name_zh: "沃尔沃斯",
    branch_name_en: "Riccarton",
    branch_name_zh: "里卡顿",
  },
  error: null,
};

describe("confirmReceipt", () => {
  it("points the confirmed receipt at the Store the user confirmed, in the same write as the status", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED, NO_HISTORY],
        receipts: [
          { data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-08-01" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("stores")).toContainEqual(["eq", "circle_id", "circle-1"]);
    expect(db.callsFor("stores")).toContainEqual(["eq", "branch_key", "hornby"]);
    expect(db.callsFor("receipts")).toContainEqual([
      "update",
      { status: "confirmed", store_id: "store-hornby" },
    ]);
  });

  // User story 3: correcting the branch the AI read is a Correction like
  // correcting an item name, so it goes to EditLog too — from what the AI
  // read to the Store the receipt was confirmed at.
  it("logs a Store the user corrected on the preview screen to EditLog", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED, NO_HISTORY],
        receipts: [
          {
            data: {
              circle_id: "circle-1",
              store_name_en: "WOOLWORTHS HORNBV",
              recognized_chain_en: "Woolworths",
              recognized_branch_en: "Hornbv",
            },
            error: null,
          },
          { data: { purchase_date: "2026-08-01" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_id: "receipt-1",
          field_name: "store",
          old_value: "Woolworths Hornbv",
          new_value: "Woolworths Hornby",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  it("writes each item's edited fields, then marks the receipt confirmed", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED, NO_HISTORY],
        receipts: [
          { data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-07-20" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("receipt_items")).toContainEqual([
      "update",
      {
        raw_name_en: "Anchor Blue Milk 2L",
        raw_name_zh: "安科蓝带牛奶 2升",
        quantity: 1,
        unit_spec_value: 2,
        unit_spec_unit: "L",
        unit_price: 4.2,
        original_price: null,
        is_promotion: false,
        subtotal: 4.2,
      },
    ]);
    expect(db.callsFor("receipt_items")).toContainEqual(["eq", "id", "item-1"]);
    expect(db.callsFor("receipts")).toContainEqual([
      "update",
      expect.objectContaining({ status: "confirmed" }),
    ]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "id", "receipt-1"]);
    // Nothing actually changed vs. EXISTING_ITEM_ROW, so no EditLog entries.
    expect(db.callsFor("edit_logs")).toEqual([]);
  });

  it("logs each changed field to EditLog before writing the update", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          { data: { ...EXISTING_ITEM_ROW, raw_name_en: "Anchor Milk", quantity: 2 }, error: null },
          ITEM_UPDATED,
          NO_HISTORY,
        ],
        receipts: [
          { data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-07-20" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_item_id: "item-1",
          field_name: "rawNameEn",
          old_value: "Anchor Milk",
          new_value: "Anchor Blue Milk 2L",
          edited_by: "user-1",
        },
        {
          receipt_item_id: "item-1",
          field_name: "quantity",
          old_value: "2",
          new_value: "1",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  it("does not mark the receipt confirmed if an item update fails", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, { error: new Error("RLS denied") }],
        // Only the read before the Store is resolved; a status update would
        // have nothing prepared and throw.
        receipts: [{ data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null }],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY)).rejects.toThrow("RLS denied");
    expect(db.callsFor("receipts")).not.toContainEqual(["update", expect.anything()]);
  });

  // Ticket 29: a Store is created on confirm, so a confirm that fails after
  // creating one takes it back — or an abandoned draft would leave a Store
  // with no receipts in every member's picker.
  it("deletes the Store it created if a later write fails, and still throws that write's error", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, { error: new Error("RLS denied") }],
        receipts: [{ data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null }],
        stores: [{ data: null, error: null }, RICCARTON_FOUND, WROTE_OK],
        edit_logs: WROTE_OK,
      },
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], RICCARTON)).rejects.toThrow("RLS denied");
    const cleanup = db.queriesFor("stores")[2];
    expect(cleanup).toContainEqual(["delete"]);
    expect(cleanup).toContainEqual(["eq", "id", "store-riccarton"]);
  });

  it("leaves an existing Store alone if a later write fails", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, { error: new Error("RLS denied") }],
        receipts: [{ data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null }],
        stores: [HORNBY_FOUND, WROTE_OK],
        edit_logs: WROTE_OK,
      },
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY)).rejects.toThrow("RLS denied");
    expect(db.callsFor("stores")).not.toContainEqual(["delete"]);
  });

  // The Store is resolved before anything is written, so a failure there —
  // such as two members creating the same new branch at once — leaves the
  // draft exactly as it was, rather than saving its items while it stays a
  // draft.
  it("writes no item edits if the Store can't be resolved", async () => {
    // `receipt_items` and `edit_logs` are left unprepared: touching either
    // at all would throw.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipts: [{ data: { circle_id: "circle-1", ...READ_AS_HORNBY }, error: null }],
        stores: { data: null, error: new Error("duplicate key value violates unique constraint") },
      },
    });

    await expect(confirmReceipt("receipt-1", [SAMPLE_ITEM_UPDATE], HORNBY)).rejects.toThrow(
      "duplicate key value"
    );
    expect(db.callsFor("receipts")).not.toContainEqual(["update", expect.anything()]);
  });

  it("records a price_spike alert when a confirmed item's price exceeds the 15% threshold", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-07-01"),
              historyRow("product-1", 5.0, "2026-07-20", "receipt-1"),
            ],
            error: null,
          },
        ],
        receipts: [
          { data: { circle_id: "circle-9", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-07-20" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
        alerts: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 5.0 },
    ], HORNBY);

    expect(db.callsFor("receipt_items")).toContainEqual(["in", "product_id", ["product-1"]]);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "eq",
      "receipts.status",
      "confirmed",
    ]);
    expect(db.callsFor("alerts")).toContainEqual([
      "insert",
      [
        {
          circle_id: "circle-9",
          type: "price_spike",
          product_id: "product-1",
          receipt_id: "receipt-1",
          new_price: 5.0,
          change_percent: 25,
        },
      ],
    ]);
  });

  it("does not record an alert when the Store's baseline purchase is more than 183 days before this receipt", async () => {
    // +25% at Hornby, but the baseline is 212 days before the receipt's own
    // purchase date, which only the confirmed receipt row supplies.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-01-01"),
              historyRow("product-1", 5.0, "2026-08-01", "receipt-1"),
            ],
            error: null,
          },
        ],
        receipts: [
          { data: { circle_id: "circle-9", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-08-01" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt(
      "receipt-1",
      [{ ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 5.0 }],
      HORNBY
    );

    expect(db.callsFor("alerts")).toEqual([]);
  });

  it("does not record an alert when the price change is within the threshold", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-07-01"),
              historyRow("product-1", 4.1, "2026-07-20", "receipt-1"),
            ],
            error: null,
          },
        ],
        receipts: [
          { data: { circle_id: "circle-9", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-07-20" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, productId: "product-1", unitPrice: 4.1 },
    ], HORNBY);

    expect(db.callsFor("alerts")).toEqual([]);
  });

  // Under the old one-query-per-product loop this test was unaffordable: each
  // extra product needed its own mock chain spliced into the `from` sequence,
  // which is why the multi-product path had never actually run. It is now a
  // single history read no matter how many products are involved.
  it("checks every affected product in one query and alerts on each spiking one", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          EXISTING_ITEM,
          ITEM_UPDATED,
          EXISTING_ITEM,
          ITEM_UPDATED,
          {
            data: [
              historyRow("product-1", 4.0, "2026-07-01"),
              historyRow("product-2", 4.0, "2026-07-01"),
              historyRow("product-1", 5.0, "2026-07-20", "receipt-1"),
              historyRow("product-2", 4.1, "2026-07-20", "receipt-1"),
            ],
            error: null,
          },
        ],
        receipts: [
          { data: { circle_id: "circle-9", ...READ_AS_HORNBY }, error: null },
          { data: { purchase_date: "2026-07-20" }, error: null },
        ],
        stores: HORNBY_FOUND,
        edit_logs: WROTE_OK,
        alerts: WROTE_OK,
      },
    });

    await confirmReceipt("receipt-1", [
      { ...SAMPLE_ITEM_UPDATE, id: "item-1", productId: "product-1", unitPrice: 5.0 },
      { ...SAMPLE_ITEM_UPDATE, id: "item-2", productId: "product-2", unitPrice: 4.1 },
    ], HORNBY);

    expect(methodsUsed(db.callsFor("receipt_items")).filter((m) => m === "in")).toHaveLength(1);
    expect(db.callsFor("receipt_items")).toContainEqual([
      "in",
      "product_id",
      ["product-1", "product-2"],
    ]);
    expect(db.callsFor("alerts")).toContainEqual([
      "insert",
      [expect.objectContaining({ product_id: "product-1", new_price: 5.0, change_percent: 25 })],
    ]);
  });
});

// Issue 16: editing a confirmed receipt reuses the same per-item
// diff-then-log-then-update logic as confirmReceipt, plus its own
// diff-then-log-then-update for the receipt-level purchase_date — but never
// touches status or price-spike alerts.
// The edit tests' receipt was confirmed at Hornby and stays there, unless a
// test moves it. A test that keeps it there prepares no `stores`: an
// unchanged Store is never looked up, and looking it up would throw.
const AT_HORNBY_RECEIPT = {
  circle_id: "circle-1",
  store_id: "store-hornby",
  store_name_en: "WOOLWORTHS HORNBY",
  store_name_zh: "沃尔沃斯 霍恩比",
  stores: { chain_name_en: "Woolworths", chain_name_zh: "沃尔沃斯", branch_name_en: "Hornby", branch_name_zh: "霍恩比" },
};

describe("editConfirmedReceipt", () => {
  it("writes each item's edited fields without touching status or alerts", async () => {
    // No `alerts` prepared: reaching for it at all would throw.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [{ data: { purchase_date: "2026-08-05", ...AT_HORNBY_RECEIPT }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("receipt_items")).toContainEqual([
      "update",
      {
        raw_name_en: "Anchor Blue Milk 2L",
        raw_name_zh: "安科蓝带牛奶 2升",
        quantity: 1,
        unit_spec_value: 2,
        unit_spec_unit: "L",
        unit_price: 4.2,
        original_price: null,
        is_promotion: false,
        subtotal: 4.2,
      },
    ]);
    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("update");
  });

  it("logs each changed item field to EditLog, same as confirmReceipt", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [
          { data: { ...EXISTING_ITEM_ROW, quantity: 2 }, error: null },
          ITEM_UPDATED,
        ],
        receipts: [{ data: { purchase_date: "2026-08-05", ...AT_HORNBY_RECEIPT }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_item_id: "item-1",
          field_name: "quantity",
          old_value: "2",
          new_value: "1",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  it("updates and logs the purchase date when it changed", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        // Read for the diff, then written because the date differs.
        receipts: [{ data: { purchase_date: "2026-06-05", ...AT_HORNBY_RECEIPT }, error: null }, WROTE_OK],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(db.callsFor("receipts")).toContainEqual(["update", { purchase_date: "2026-08-05" }]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "id", "receipt-1"]);
    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_id: "receipt-1",
          field_name: "purchase_date",
          old_value: "2026-06-05",
          new_value: "2026-08-05",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  it("does not touch the receipt row when the purchase date is unchanged", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [{ data: { purchase_date: "2026-08-05", ...AT_HORNBY_RECEIPT }, error: null }],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], HORNBY);

    expect(methodsUsed(db.callsFor("receipts"))).not.toContain("update");
  });

  // A receipt the backfill never reached has no Store, so the picker starts
  // it on its header as the chain, branch unknown. Saving only a new date
  // leaves that as it is: no Store created, no Store change logged.
  it("leaves a receipt with no Store alone when only its date changed", async () => {
    // No `stores` prepared: looking a Store up at all would throw.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [
          {
            data: {
              purchase_date: "2026-06-05",
              circle_id: "circle-1",
              store_id: null,
              store_name_en: "Countdown Newmarket",
              store_name_zh: "倒数超市 Newmarket 店",
              recognized_chain_en: null,
              recognized_branch_en: null,
              stores: null,
            },
            error: null,
          },
          WROTE_OK,
        ],
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], {
      chain: { en: "Countdown Newmarket", zh: "倒数超市 Newmarket 店" },
      branch: null,
    });

    expect(db.callsFor("receipts")).toContainEqual(["update", { purchase_date: "2026-08-05" }]);
    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_id: "receipt-1",
          field_name: "purchase_date",
          old_value: "2026-06-05",
          new_value: "2026-08-05",
          edited_by: "user-1",
        },
      ],
    ]);
  });

  // Issue 29: a Store change is a Correction like any other — and, as with
  // every edit, it neither re-raises nor withdraws alerts. Logged by name, so
  // the log reads without looking the Stores up.
  it("moves the receipt to another Store, logging the Store's name old → new", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [
          {
            data: {
              purchase_date: "2026-08-05",
              circle_id: "circle-1",
              store_id: "store-hornby",
              store_name_en: "WOOLWORTHS HORNBY",
              store_name_zh: "沃尔沃斯 霍恩比",
              stores: {
                chain_name_en: "Woolworths",
                chain_name_zh: "沃尔沃斯",
                branch_name_en: "Hornby",
                branch_name_zh: "霍恩比",
              },
            },
            error: null,
          },
          WROTE_OK,
        ],
        stores: RICCARTON_FOUND,
        edit_logs: WROTE_OK,
      },
    });

    await editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], RICCARTON);

    expect(db.callsFor("edit_logs")).toContainEqual([
      "insert",
      [
        {
          receipt_id: "receipt-1",
          field_name: "store",
          old_value: "Woolworths Hornby",
          new_value: "Woolworths Riccarton",
          edited_by: "user-1",
        },
      ],
    ]);
    expect(db.callsFor("receipts")).toContainEqual(["update", { store_id: "store-riccarton" }]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "id", "receipt-1"]);
  });

  // As on confirm, the Store is resolved before anything is written, so a
  // failure there saves none of the edit rather than only its items.
  it("writes no item edits if the Store it moves the receipt to can't be resolved", async () => {
    // `receipt_items` and `edit_logs` are left unprepared: touching either
    // at all would throw.
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipts: [{ data: { purchase_date: "2026-08-05", ...AT_HORNBY_RECEIPT }, error: null }],
        stores: { data: null, error: new Error("duplicate key value violates unique constraint") },
      },
    });

    await expect(
      editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], RICCARTON)
    ).rejects.toThrow("duplicate key value");
    expect(db.callsFor("receipts")).not.toContainEqual(["update", expect.anything()]);
  });

  // As on confirm: an edit that fails after creating the Store it moves the
  // receipt to takes that Store back.
  it("deletes the Store it created if moving the receipt there fails, and still throws that write's error", async () => {
    const db = installFakeSupabase(supabase, {
      auth: SIGNED_IN,
      tables: {
        receipt_items: [EXISTING_ITEM, ITEM_UPDATED],
        receipts: [
          { data: { purchase_date: "2026-08-05", ...AT_HORNBY_RECEIPT }, error: null },
          { error: new Error("RLS denied") },
        ],
        stores: [{ data: null, error: null }, RICCARTON_FOUND, WROTE_OK],
        edit_logs: WROTE_OK,
      },
    });

    await expect(
      editConfirmedReceipt("receipt-1", "2026-08-05", [SAMPLE_ITEM_UPDATE], RICCARTON)
    ).rejects.toThrow("RLS denied");
    const cleanup = db.queriesFor("stores")[2];
    expect(cleanup).toContainEqual(["delete"]);
    expect(cleanup).toContainEqual(["eq", "id", "store-riccarton"]);
  });
});

describe("deleteReceipt", () => {
  it("deletes the receipt row (receipt_items cascade via the FK) and its stored image", async () => {
    const db = installFakeSupabase(supabase, {
      tables: {
        receipts: { data: { original_image_url: "circle-1/receipt-1.jpg" }, error: null },
      },
      storage: { remove: { error: null } },
    });

    await deleteReceipt("receipt-1");

    expect(db.from).toHaveBeenCalledWith("receipts");
    expect(db.storageFrom).toHaveBeenCalledWith("receipts");
    expect(db.storage.remove).toHaveBeenCalledWith(["circle-1/receipt-1.jpg"]);
  });

  it("skips storage cleanup when the receipt had no stored image", async () => {
    const db = installFakeSupabase(supabase, {
      tables: { receipts: { data: { original_image_url: null }, error: null } },
    });

    await deleteReceipt("receipt-1");

    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("throws when the row delete fails", async () => {
    const db = installFakeSupabase(supabase, {
      tables: { receipts: { data: null, error: new Error("network error") } },
    });

    await expect(deleteReceipt("receipt-1")).rejects.toThrow("network error");
    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("throws when the row is deleted but the storage cleanup fails", async () => {
    installFakeSupabase(supabase, {
      tables: {
        receipts: { data: { original_image_url: "circle-1/receipt-1.jpg" }, error: null },
      },
      storage: { remove: { error: new Error("storage error") } },
    });

    await expect(deleteReceipt("receipt-1")).rejects.toThrow("storage error");
  });
});
