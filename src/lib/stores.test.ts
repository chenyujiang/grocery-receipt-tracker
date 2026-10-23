import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { listStores, resolveStore } from "@/lib/stores";
import { UnexplainedError } from "@/lib/errorMessage";

describe("resolveStore", () => {
  const hornbyRow = {
    id: "store-hornby",
    circle_id: "circle-1",
    chain_name_en: "Woolworths",
    chain_name_zh: "沃尔沃斯",
    branch_name_en: "Hornby",
    branch_name_zh: "霍恩比",
    chain_key: "woolworths",
    branch_key: "hornby",
    created_at: "2026-10-01T00:00:00Z",
  };

  it("returns the circle's existing Store for that branch without creating another", async () => {
    const db = createFakeSupabase({ tables: { stores: { data: hornbyRow, error: null } } });

    const { store } = await resolveStore(db.client, "circle-1", {
      chain: { en: "WOOLWORTHS", zh: "沃尔沃斯" },
      branch: { en: " Hornby ", zh: "霍恩比" },
    });

    expect(store).toMatchObject({
      id: "store-hornby",
      chain_name_en: "Woolworths",
      chain_name_zh: "沃尔沃斯",
      branch_name_en: "Hornby",
      branch_name_zh: "霍恩比",
    });
    // The fake doesn't filter, so pin that the lookup is by normalized key.
    const calls = db.callsFor("stores");
    expect(calls).toContainEqual(["eq", "circle_id", "circle-1"]);
    expect(calls).toContainEqual(["eq", "chain_key", "woolworths"]);
    expect(calls).toContainEqual(["eq", "branch_key", "hornby"]);
    expect(calls.map(([method]) => method)).not.toContain("insert");
  });

  it("creates and returns a new Store when the circle has never seen that branch", async () => {
    const riccartonRow = {
      ...hornbyRow,
      id: "store-riccarton",
      branch_name_en: "Riccarton",
      branch_name_zh: "里卡顿",
      branch_key: "riccarton",
    };
    const db = createFakeSupabase({
      tables: {
        stores: [
          { data: null, error: null },
          { data: riccartonRow, error: null },
        ],
      },
    });

    const { store } = await resolveStore(db.client, "circle-1", {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: { en: "Riccarton", zh: "里卡顿" },
    });

    expect(store).toMatchObject({
      id: "store-riccarton",
      chain_name_en: "Woolworths",
      chain_name_zh: "沃尔沃斯",
      branch_name_en: "Riccarton",
      branch_name_zh: "里卡顿",
    });
    expect(db.callsFor("stores")).toContainEqual([
      "insert",
      {
        circle_id: "circle-1",
        chain_name_en: "Woolworths",
        chain_name_zh: null,
        branch_name_en: "Riccarton",
        branch_name_zh: null,
        chain_key: "woolworths",
        branch_key: "riccarton",
      },
    ]);
  });

  it("looks up, and if need be creates, the chain's unknown-branch Store when no branch was printed", async () => {
    const unknownBranchRow = {
      ...hornbyRow,
      id: "store-woolworths-unknown",
      branch_name_en: null,
      branch_name_zh: null,
      branch_key: null,
    };
    const db = createFakeSupabase({
      tables: {
        stores: [
          { data: null, error: null },
          { data: unknownBranchRow, error: null },
        ],
      },
    });

    const { store } = await resolveStore(db.client, "circle-1", {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: null,
    });

    expect(store).toMatchObject({ id: "store-woolworths-unknown", branch_name_en: null });
    const [lookup, insert] = db.queriesFor("stores");
    // `eq` with null never matches in PostgREST; an unknown branch needs `is`.
    expect(lookup).toContainEqual(["is", "branch_key", null]);
    expect(lookup.filter(([method, column]) => method === "eq" && column === "branch_key")).toEqual([]);
    expect(insert).toContainEqual([
      "insert",
      expect.objectContaining({ branch_name_en: null, branch_name_zh: null, branch_key: null }),
    ]);
  });

  it("stores the names without the stray leading and trailing spaces OCR left on them", async () => {
    const db = createFakeSupabase({
      tables: {
        stores: [
          { data: null, error: null },
          { data: hornbyRow, error: null },
        ],
      },
    });

    await resolveStore(db.client, "circle-1", {
      chain: { en: "  Woolworths ", zh: " 沃尔沃斯" },
      branch: { en: " Hornby\t", zh: "霍恩比 " },
    });

    expect(db.callsFor("stores")).toContainEqual([
      "insert",
      expect.objectContaining({
        chain_name_en: "Woolworths",
        branch_name_en: "Hornby",
      }),
    ]);
  });

  // Store names are shown in English only: a Translation the AI read is
  // dropped, and every name falls back to its Source Text.
  it("stores no Chinese name, even one the AI read", async () => {
    const db = createFakeSupabase({
      tables: {
        stores: [
          { data: null, error: null },
          { data: hornbyRow, error: null },
        ],
      },
    });

    await resolveStore(db.client, "circle-1", {
      chain: { en: "Woolworths", zh: "沃尔沃斯" },
      branch: { en: "Hornby", zh: "霍恩比" },
    });

    expect(db.callsFor("stores")).toContainEqual([
      "insert",
      expect.objectContaining({ chain_name_zh: null, branch_name_zh: null }),
    ]);
  });

  // A Store with no chain would show up blank in every member's picker.
  // The review and detail pages won't submit without a chain, so reaching
  // this is a bug, not something to word for the user.
  it("refuses a chain that's blank, without looking up or creating a Store", async () => {
    const db = createFakeSupabase({ tables: {} });

    const err = await resolveStore(db.client, "circle-1", {
      chain: { en: " . ", zh: null },
      branch: { en: "Hornby", zh: null },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnexplainedError);
    expect(err).toHaveProperty("message", expect.stringMatching(/chain/i));
    expect(db.callsFor("stores")).toEqual([]);
  });
});

describe("listStores", () => {
  function storeRow(id: string, chainEn: string, chainKey: string, branchEn: string | null) {
    return {
      id,
      chain_name_en: chainEn,
      chain_name_zh: null,
      branch_name_en: branchEn,
      branch_name_zh: null,
      chain_key: chainKey,
      branch_key: branchEn?.toLowerCase() ?? null,
    };
  }

  it("lists the circle's Stores by chain then branch, with the unknown branch last in its chain", async () => {
    const db = createFakeSupabase({
      tables: {
        stores: {
          data: [
            storeRow("woolworths-riccarton", "Woolworths", "woolworths", "Riccarton"),
            storeRow("woolworths-unknown", "Woolworths", "woolworths", null),
            storeRow("paknsave-albany", "PAK'nSAVE", "paknsave", "Albany"),
            storeRow("woolworths-hornby", "Woolworths", "woolworths", "Hornby"),
          ],
          error: null,
        },
      },
    });

    const stores = await listStores(db.client);

    expect(stores.map(({ id }) => id)).toEqual([
      "paknsave-albany",
      "woolworths-hornby",
      "woolworths-riccarton",
      "woolworths-unknown",
    ]);
    expect(stores[0]).toEqual({
      id: "paknsave-albany",
      chain_name_en: "PAK'nSAVE",
      chain_name_zh: null,
      branch_name_en: "Albany",
      branch_name_zh: null,
    });
  });
});
