import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createFakeSupabase, installFakeSupabase } from "@/test/fakeSupabase";

// The fake is a replay-and-record stand-in for supabase-js, not a query
// engine: it records every chained call and returns a prepared result
// verbatim. It never filters, sorts, or resolves an embed — see issue 18.

describe("createFakeSupabase: prepared results", () => {
  it("returns the prepared result when the chain is awaited", async () => {
    const db = createFakeSupabase({
      tables: { receipts: { data: [{ id: "r1" }], error: null } },
    });

    const result = await db.client.from("receipts").select("id").eq("status", "confirmed");

    expect(result).toEqual({ data: [{ id: "r1" }], error: null });
  });

  it("gives every call to a table the same result when prepared with a bare value", async () => {
    const db = createFakeSupabase({ tables: { profiles: { data: [{ id: "p1" }], error: null } } });

    const first = await db.client.from("profiles").select("id");
    const second = await db.client.from("profiles").select("id");

    expect(first).toEqual(second);
  });

  it("consumes a table's queue in order across repeated calls", async () => {
    // fetchHomeSummary reads `receipts` twice for different things, so
    // same-table order is semantic and the fake must answer differently.
    const db = createFakeSupabase({
      tables: {
        receipts: [
          { data: [{ id: "month" }], error: null },
          { data: [{ id: "recent" }], error: null },
        ],
      },
    });

    const month = await db.client.from("receipts").select("total_amount");
    const recent = await db.client.from("receipts").select("id").limit(5);

    expect(month).toEqual({ data: [{ id: "month" }], error: null });
    expect(recent).toEqual({ data: [{ id: "recent" }], error: null });
  });

  it("keeps each table's queue independent of the order tables are queried in", async () => {
    // confirmReceipt writing edit_logs before alerts is an implementation
    // detail; reordering them must not break a test.
    const db = createFakeSupabase({
      tables: {
        edit_logs: [{ data: null, error: null }],
        alerts: [{ data: [{ id: "a1" }], error: null }],
      },
    });

    const alerts = await db.client.from("alerts").select("id");
    const logs = await db.client
      .from("edit_logs")
      .insert({ field_name: "quantity", edited_by: "user-1" });

    expect(alerts).toEqual({ data: [{ id: "a1" }], error: null });
    expect(logs).toEqual({ data: null, error: null });
  });

  it("returns a prepared count for a head request", async () => {
    const db = createFakeSupabase({ tables: { alerts: { count: 3, error: null } } });

    const result = await db.client.from("alerts").select("id", { count: "exact", head: true });

    expect(result).toEqual({ count: 3, error: null });
  });

  it("returns the queued value verbatim however the chain terminates", async () => {
    // .single() gets no special treatment: the test supplies the singular
    // shape it expects, rather than the fake unwrapping an array.
    const db = createFakeSupabase({
      tables: { receipts: { data: { id: "r1" }, error: null } },
    });

    const result = await db.client.from("receipts").select("id").eq("id", "r1").single();

    expect(result).toEqual({ data: { id: "r1" }, error: null });
  });

  it("replays a raw PostgrestError, which is not an Error instance", async () => {
    // This is the shape the errorMessage() convention exists for.
    const postgrestError = {
      message: "new row violates row-level security policy",
      code: "42501",
      details: "",
      hint: null,
    };
    const db = createFakeSupabase({ tables: { circles: { data: null, error: postgrestError } } });

    const { error } = await db.client.from("circles").insert({ name: "Home" });

    expect(error).toBe(postgrestError);
    expect(error instanceof Error).toBe(false);
  });
});

describe("createFakeSupabase: recorded calls", () => {
  it("records each chained method with its arguments", async () => {
    const db = createFakeSupabase({ tables: { receipts: { data: [], error: null } } });

    await db.client
      .from("receipts")
      .select("id, total_amount")
      .eq("status", "confirmed")
      .order("purchase_date", { ascending: false });

    expect(db.callsFor("receipts")).toContainEqual(["select", "id, total_amount"]);
    expect(db.callsFor("receipts")).toContainEqual(["eq", "status", "confirmed"]);
    expect(db.callsFor("receipts")).toContainEqual(["order", "purchase_date", { ascending: false }]);
  });

  it("records a write's payload the same way as a filter", async () => {
    const db = createFakeSupabase({ tables: { receipt_items: { data: null, error: null } } });

    await db.client.from("receipt_items").update({ quantity: 2 }).eq("id", "item-1");

    expect(db.callsFor("receipt_items")).toContainEqual(["update", { quantity: 2 }]);
  });

  it("does not couple assertions to the order filters were applied in", async () => {
    const db = createFakeSupabase({ tables: { receipts: { data: [], error: null } } });

    await db.client
      .from("receipts")
      .select("id")
      .lte("purchase_date", "2026-08-31")
      .gte("purchase_date", "2026-08-01");

    expect(db.callsFor("receipts")).toContainEqual(["gte", "purchase_date", "2026-08-01"]);
    expect(db.callsFor("receipts")).toContainEqual(["lte", "purchase_date", "2026-08-31"]);
  });

  it("keeps one table's calls out of another's", async () => {
    const db = createFakeSupabase({
      tables: { receipts: { data: [], error: null }, alerts: { data: [], error: null } },
    });

    await db.client.from("receipts").select("id").eq("status", "confirmed");
    await db.client.from("alerts").select("id").eq("type", "price_spike");

    expect(db.callsFor("receipts")).not.toContainEqual(["eq", "type", "price_spike"]);
    expect(db.callsFor("alerts")).toContainEqual(["eq", "type", "price_spike"]);
  });

  it("reports no calls for a table that was never queried", () => {
    const db = createFakeSupabase({ tables: { receipts: { data: [], error: null } } });

    expect(db.callsFor("receipts")).toEqual([]);
  });
});

describe("createFakeSupabase: running dry", () => {
  it("throws, naming the table, when a query has no prepared result", async () => {
    const db = createFakeSupabase({ tables: { receipts: { data: [], error: null } } });

    await expect(db.client.from("edit_logs").select("id")).rejects.toThrow(/edit_logs/);
  });

  it("throws, naming the table and the call index, when a queue is exhausted", async () => {
    const db = createFakeSupabase({ tables: { receipts: [{ data: [], error: null }] } });

    await db.client.from("receipts").select("id");

    await expect(db.client.from("receipts").select("id")).rejects.toThrow(/receipts.*2/s);
  });

  it("throws rather than returning an empty result, so an unexpected query is loud", async () => {
    const db = createFakeSupabase({ tables: {} });

    await expect(db.client.from("products").select("id")).rejects.toThrow();
  });
});

describe("installFakeSupabase", () => {
  // Stands in for the empty object a `vi.mock` factory returns.
  function mockedModuleClient() {
    return {} as SupabaseClient<Database>;
  }

  it("fills the mocked client so the module under test reaches the fake", async () => {
    const client = mockedModuleClient();

    const db = installFakeSupabase(client, {
      tables: { receipts: { data: [{ id: "r1" }], error: null } },
    });
    const result = await client.from("receipts").select("id");

    expect(result).toEqual({ data: [{ id: "r1" }], error: null });
    expect(db.callsFor("receipts")).toContainEqual(["select", "id"]);
  });

  it("replaces the previous fake when a second test installs its own", async () => {
    const client = mockedModuleClient();
    installFakeSupabase(client, { tables: { receipts: { data: [{ id: "old" }], error: null } } });

    installFakeSupabase(client, { tables: { receipts: { data: [{ id: "new" }], error: null } } });
    const result = await client.from("receipts").select("id");

    expect(result).toEqual({ data: [{ id: "new" }], error: null });
  });

  it("fills auth and storage too, not just from()", async () => {
    const client = mockedModuleClient();

    installFakeSupabase(client, {
      auth: { getUser: { data: { user: { id: "user-1" } }, error: null } },
      storage: { remove: { data: null, error: null } },
    });

    expect((await client.auth.getUser()).data.user).toEqual({ id: "user-1" });
    expect(await client.storage.from("receipts").remove(["a.jpg"])).toEqual({
      data: null,
      error: null,
    });
  });
});

describe("createFakeSupabase: auth, storage and rpc", () => {
  it("resolves auth calls to a prepared value", async () => {
    const db = createFakeSupabase({
      auth: { getUser: { data: { user: { id: "user-1" } }, error: null } },
    });

    const result = await db.client.auth.getUser();

    expect(result).toEqual({ data: { user: { id: "user-1" } }, error: null });
  });

  it("throws, naming the method, on an unprepared auth call", async () => {
    const db = createFakeSupabase();

    // Same reason from() is loud: a silent signed-out default turns "the code
    // asked auth a question this test never anticipated" into a mystery.
    await expect(db.client.auth.getSession()).rejects.toThrow(/getSession/);
  });

  it("throws, naming the operation, on an unprepared storage call", async () => {
    const db = createFakeSupabase();

    await expect(db.client.storage.from("receipts").remove(["a.jpg"])).rejects.toThrow(/remove/);
  });

  it("still answers onAuthStateChange unprepared, since every mount subscribes", () => {
    const db = createFakeSupabase();

    const { data } = db.client.auth.onAuthStateChange(() => {});

    expect(data.subscription.unsubscribe).toBeTypeOf("function");
  });

  it("hands back the same spy for an unprepared method each time it is read", async () => {
    const db = createFakeSupabase();

    await expect(db.client.auth.getUser()).rejects.toThrow();

    expect(db.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("exposes auth spies so a test can vary the answer per call", async () => {
    const db = createFakeSupabase({ auth: { getUser: { data: { user: null }, error: null } } });
    db.auth.getUser.mockResolvedValueOnce({ data: { user: { id: "user-2" } }, error: null });

    const first = await db.client.auth.getUser();
    const second = await db.client.auth.getUser();

    expect(first.data.user).toEqual({ id: "user-2" });
    expect(second.data.user).toBeNull();
  });

  it("resolves an admin auth call to a prepared value", async () => {
    const db = createFakeSupabase({
      auth: { admin: { listUsers: { data: { users: [{ id: "user-1" }] }, error: null } } },
    });

    const { data } = await db.client.auth.admin.listUsers({ perPage: 1000 });

    expect(data.users).toEqual([{ id: "user-1" }]);
  });

  it("records the storage bucket and resolves the prepared bucket operation", async () => {
    const db = createFakeSupabase({ storage: { remove: { data: null, error: null } } });

    const result = await db.client.storage.from("receipts").remove(["user-1/photo.jpg"]);

    expect(db.storageFrom).toHaveBeenCalledWith("receipts");
    expect(db.storage.remove).toHaveBeenCalledWith(["user-1/photo.jpg"]);
    expect(result).toEqual({ data: null, error: null });
  });

  it("resolves a prepared rpc by function name", async () => {
    const db = createFakeSupabase({
      rpc: { merge_users_into_new_circle: { data: "circle-1", error: null } },
    });

    const result = await db.client.rpc("merge_users_into_new_circle", { p_user_ids: ["user-1"] });

    expect(result).toEqual({ data: "circle-1", error: null });
    expect(db.rpc).toHaveBeenCalledWith("merge_users_into_new_circle", { p_user_ids: ["user-1"] });
  });

  it("throws, naming the function, on an unprepared rpc", async () => {
    const db = createFakeSupabase();

    await expect(
      db.client.rpc("merge_users_into_new_circle", { p_user_ids: ["user-1"] })
    ).rejects.toThrow(/merge_users_into_new_circle/);
  });
});

describe("createFakeSupabase: queue consumption", () => {
  it("consumes a queue slot on await, not on from()", async () => {
    const db = createFakeSupabase({
      tables: { receipts: [{ data: ["first"], error: null }, { data: ["second"], error: null }] },
    });

    // A builder that is constructed and abandoned must not burn a slot —
    // production does this whenever it branches after starting a query.
    db.client.from("receipts").select("*");
    const { data } = await db.client.from("receipts").select("*");

    expect(data).toEqual(["first"]);
  });

  it("does not throw for an unprepared table until the query is actually awaited", async () => {
    const db = createFakeSupabase();

    expect(() => db.client.from("receipts")).not.toThrow();
    await expect(db.client.from("receipts").select("*")).rejects.toThrow(/receipts/);
  });
});

describe("createFakeSupabase: queriesFor", () => {
  it("groups calls by query, so two reads of one table stay apart", async () => {
    const db = createFakeSupabase({
      tables: { receipts: [{ data: [], error: null }, { data: [], error: null }] },
    });

    await db.client.from("receipts").select("id").eq("status", "confirmed");
    await db.client.from("receipts").select("total_amount").gte("purchase_date", "2026-01-01");

    expect(db.queriesFor("receipts")).toEqual([
      [
        ["select", "id"],
        ["eq", "status", "confirmed"],
      ],
      [
        ["select", "total_amount"],
        ["gte", "purchase_date", "2026-01-01"],
      ],
    ]);
  });

  it("reports no queries for a table that was never touched", () => {
    expect(createFakeSupabase().queriesFor("receipts")).toEqual([]);
  });

  it("keeps callsFor as the flattened view over the same calls", async () => {
    const db = createFakeSupabase({ tables: { receipts: { data: [], error: null } } });

    await db.client.from("receipts").select("id").eq("id", "r1");

    expect(db.callsFor("receipts")).toEqual([
      ["select", "id"],
      ["eq", "id", "r1"],
    ]);
  });
});
