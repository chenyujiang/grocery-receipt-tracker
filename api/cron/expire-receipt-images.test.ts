import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../_lib/supabaseAdmin.js", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { makeReq, makeRes } from "../_lib/testHandler.js";
import { POSTGREST_PAGE_SIZE } from "../../src/lib/postgrestPaging.js";
import handler from "./expire-receipt-images.js";

type Result = { data?: unknown; error: unknown };

interface Wiring {
  /** Results for `from("receipts")`, in order: page reads and the updates after them. */
  receipts?: Result[];
  /**
   * What `storage.from("receipts").remove()` resolves to, on every call.
   * Unset, Storage deletes every path it's asked to.
   */
  remove?: Result;
}

function installSupabase({ receipts = [{ data: [], error: null }], remove }: Wiring = {}) {
  const db = installFakeSupabase(supabaseAdmin, {
    tables: { receipts },
    storage: { remove: remove ?? { data: [], error: null } },
  });
  if (!remove) {
    db.storage.remove.mockImplementation(async (paths: string[]) => ({
      data: paths.map((name) => ({ name })),
      error: null,
    }));
  }
  return db;
}

// What Vercel Cron sends as `Authorization: Bearer $CRON_SECRET`.
const CRON_SECRET = "cron-secret-from-env";

function cronReq() {
  return makeReq({ method: "GET", authToken: CRON_SECRET });
}

describe("GET /api/cron/expire-receipt-images", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // Access control is isCronAuthorized's (api/_lib/cronAuth.ts).
  it.each(["POST", "DELETE", "PUT"])("rejects %s with 405", async (method) => {
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method, authToken: CRON_SECRET }), res.res);

    expect(res.statusCode).toBe(405);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a GET with no Authorization header with 401", async () => {
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(res.statusCode).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a GET carrying the wrong secret with 401", async () => {
    const db = installSupabase();
    const res = makeRes();

    await handler(makeReq({ method: "GET", authToken: "not-the-secret" }), res.res);

    expect(res.statusCode).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("refuses every caller when CRON_SECRET is unset, rather than skipping the check", async () => {
    delete process.env.CRON_SECRET;
    const db = installSupabase();
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(res.statusCode).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("reports nothing expired when no image is past retention", async () => {
    installSupabase();
    const res = makeRes();

    await handler(cronReq(), res.res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ expiredImages: 0 });
  });

  describe("expiring", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-30T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const EXPIRED = [
      { id: "receipt-1", original_image_url: "circle-1/a.jpg" },
      { id: "receipt-2", original_image_url: "circle-2/b.jpg" },
    ];

    it("reads only receipts still holding an image uploaded more than 12 months ago", async () => {
      const db = installSupabase();

      await handler(cronReq(), makeRes().res);

      const read = db.queriesFor("receipts")[0];
      expect(read).toContainEqual(["not", "original_image_url", "is", null]);
      expect(read).toContainEqual(["lt", "uploaded_at", "2025-10-30T12:00:00.000Z"]);
    });

    it("deletes each expired image from the receipts bucket, then clears its column", async () => {
      const db = installSupabase({
        receipts: [
          { data: EXPIRED, error: null },
          { data: null, error: null },
        ],
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(db.storageFrom).toHaveBeenCalledWith("receipts");
      expect(db.storage.remove).toHaveBeenCalledWith(["circle-1/a.jpg", "circle-2/b.jpg"]);
      const update = db.queriesFor("receipts")[1];
      expect(update).toContainEqual(["update", { original_image_url: null }]);
      expect(update).toContainEqual(["in", "id", ["receipt-1", "receipt-2"]]);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ expiredImages: 2 });
    });

    // A failed update after a successful remove leaves a row pointing at an
    // image that's gone, which is harmless. The other order could leave an
    // image in the bucket that no row points to.
    it("removes from Storage before clearing the column", async () => {
      const db = installSupabase({
        receipts: [
          { data: EXPIRED, error: null },
          { data: null, error: null },
        ],
      });

      await handler(cronReq(), makeRes().res);

      const updateOrder = db.from.mock.invocationCallOrder[1];
      expect(db.storage.remove.mock.invocationCallOrder[0]).toBeLessThan(updateOrder);
    });

    // A path Storage didn't report as deleted may still be in the bucket, so
    // its row keeps pointing at it for the next run to try again.
    it("clears only the images Storage reports it deleted", async () => {
      const db = installSupabase({
        receipts: [
          { data: EXPIRED, error: null },
          { data: null, error: null },
        ],
        remove: { data: [{ name: "circle-1/a.jpg" }], error: null },
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      const update = db.queriesFor("receipts")[1];
      expect(update).toContainEqual(["in", "id", ["receipt-1"]]);
      expect(res.body).toEqual({ expiredImages: 1 });
    });

    it("skips the update when Storage reports nothing deleted", async () => {
      const db = installSupabase({
        receipts: [{ data: EXPIRED, error: null }],
        remove: { data: [], error: null },
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(db.queriesFor("receipts")).toHaveLength(1);
      expect(res.body).toEqual({ expiredImages: 0 });
    });

    // PostgREST caps a read at max-rows and drops the rest without an error
    // (ticket 36), so a full page means "read on", keyed after its last id.
    it("reads on past a full page, starting after its last id", async () => {
      const fullPage = Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => ({
        id: `receipt-${index}`,
        original_image_url: `circle-1/${index}.jpg`,
      }));
      const db = installSupabase({
        receipts: [
          { data: fullPage, error: null },
          { data: null, error: null },
          { data: [{ id: "receipt-last", original_image_url: "circle-2/last.jpg" }], error: null },
          { data: null, error: null },
        ],
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      const secondRead = db.queriesFor("receipts")[2];
      expect(secondRead).toContainEqual(["gt", "id", fullPage.at(-1)?.id]);
      expect(db.storage.remove).toHaveBeenLastCalledWith(["circle-2/last.jpg"]);
      expect(res.body).toEqual({ expiredImages: POSTGREST_PAGE_SIZE + 1 });
    });

    it("returns 500 when the receipts read fails", async () => {
      installSupabase({ receipts: [{ data: null, error: { message: "db down" } }] });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
    });

    // The column must stay set while the image may still be in the bucket, or
    // nothing would ever point the next run at it again.
    it("leaves the column set and stops with 500 when the Storage remove fails", async () => {
      const db = installSupabase({
        receipts: [{ data: EXPIRED, error: null }],
        remove: { data: null, error: { message: "storage down" } },
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
      expect(db.queriesFor("receipts")).toHaveLength(1);
    });

    it("stops with 500 when clearing the column fails", async () => {
      installSupabase({
        receipts: [
          { data: EXPIRED, error: null },
          { data: null, error: { message: "db down" } },
        ],
      });
      const res = makeRes();

      await handler(cronReq(), res.res);

      expect(res.statusCode).toBe(500);
    });
  });
});
