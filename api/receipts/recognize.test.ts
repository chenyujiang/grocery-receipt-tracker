import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("../_lib/supabaseAdmin.js", () => ({ supabaseAdmin: {} }));

// reserveCall is stubbed (it hands back a fake Reservation, see reserve());
// the rest of the module stays real.
vi.mock("../_lib/userAiAccess.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/userAiAccess.js")>()),
  reserveCall: vi.fn(),
}));
vi.mock("../_lib/aiAccessRefusal.js", () => ({ aiAccessRefusal: vi.fn() }));
vi.mock("../_lib/haikuCost.js", () => ({ calculateHaikuCost: vi.fn() }));
vi.mock("../_lib/recognizeReceipt.js", () => ({ recognizeReceipt: vi.fn() }));
vi.mock("../_lib/saveDraftReceipt.js", () => ({ saveDraftReceipt: vi.fn() }));

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { FREE_TRIAL_LIMIT } from "../../src/lib/freeTrialLimit.js";
import { reserveCall, type AccessMode, type AccessStatus } from "../_lib/userAiAccess.js";
import { aiAccessRefusal } from "../_lib/aiAccessRefusal.js";
import { calculateHaikuCost } from "../_lib/haikuCost.js";
import { recognizeReceipt } from "../_lib/recognizeReceipt.js";
import { saveDraftReceipt } from "../_lib/saveDraftReceipt.js";
import { makeReq, makeRes } from "../_lib/testHandler.js";
import handler from "./recognize.js";

const CIRCLE_ID = "circle-1";
const USER = { id: "user-1" };
const RECOGNIZED = { receipt: { storeName: "PAK'nSAVE" }, usage: { inputTokens: 900, outputTokens: 300 } };

type Result = { data: unknown; error: unknown };

interface Wiring {
  profiles?: Result;
  products?: Result;
  uploadError?: unknown;
  removeResult?: Result;
}

function installSupabase({
  profiles,
  products,
  uploadError = null,
  removeResult = { data: [], error: null },
}: Wiring = {}) {
  const db = installFakeSupabase(supabaseAdmin, {
    auth: { getUser: { data: { user: USER }, error: null } },
    tables: {
      profiles: profiles ?? { data: { circle_id: CIRCLE_ID }, error: null },
      products: products ?? { data: [], error: null },
    },
    storage: { upload: { error: uploadError }, remove: removeResult },
  });
  return { db, upload: db.storage.upload, remove: db.storage.remove };
}

function recognizeRequest(overrides: Record<string, unknown> = {}) {
  return makeReq({
    method: "POST",
    authToken: "tok",
    body: { imageBase64: "aGVsbG8=", mediaType: "image/jpeg", ...overrides },
  });
}

/** The AccessStatus reserveCall reports for a blocked user. */
function blocked(mode: AccessMode, extra: Partial<AccessStatus> = {}): AccessStatus {
  return {
    allowed: false,
    mode,
    spentUsd: mode === "cap" ? 1 : 0,
    capUsd: mode === "cap" ? 1 : null,
    freeTrialCallsUsed: FREE_TRIAL_LIMIT,
    ...extra,
  };
}

const ALLOWED: AccessStatus = { allowed: true, mode: "trial", spentUsd: 0, capUsd: null, freeTrialCallsUsed: 0 };

/** The fake Reservation the next reserveCall resolves to. */
let reservation: { status: AccessStatus; release: Mock; recordSpend: Mock };

function reserve(status: AccessStatus) {
  reservation = { status, release: vi.fn(), recordSpend: vi.fn() };
  vi.mocked(reserveCall).mockResolvedValue(reservation as never);
  return reservation;
}

describe("POST /api/receipts/recognize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFakeSupabase(supabaseAdmin);
    reserve(ALLOWED);
    vi.mocked(recognizeReceipt).mockResolvedValue(RECOGNIZED as never);
    vi.mocked(calculateHaikuCost).mockReturnValue(0.0042);
    vi.mocked(saveDraftReceipt).mockResolvedValue({ receiptId: "receipt-1" } as never);
  });

  describe("guards", () => {
    it("rejects a non-POST method", async () => {
      const res = makeRes();

      await handler(makeReq({ method: "GET" }), res.res);

      expect(res.statusCode).toBe(405);
      expect(supabaseAdmin.auth.getUser).not.toHaveBeenCalled();
    });

    it.each([
      ["no Authorization header", {}],
      ["a non-Bearer scheme", { authorization: "Basic abc" }],
    ])("401s on %s without calling Supabase", async (_label, headers) => {
      const res = makeRes();

      await handler(makeReq({ method: "POST", headers: headers as Record<string, string> }), res.res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Missing Authorization: Bearer <access_token> header" });
      expect(supabaseAdmin.auth.getUser).not.toHaveBeenCalled();
    });

    it("401s when the token doesn't resolve to a user", async () => {
      vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: { message: "expired" },
      } as never);
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Invalid or expired session" });
    });

    it("403s when the account has no Circle", async () => {
      installSupabase({ profiles: { data: null, error: null } });
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "No circle found for this account" });
      expect(reserveCall).not.toHaveBeenCalled();
    });
  });

  describe("body validation", () => {
    beforeEach(() => installSupabase());

    it.each([
      ["a missing image", { imageBase64: undefined }],
      ["an empty image", { imageBase64: "" }],
      ["a non-string image", { imageBase64: 42 }],
    ])("400s on %s", async (_label, overrides) => {
      const res = makeRes();

      await handler(recognizeRequest(overrides), res.res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Missing imageBase64" });
    });

    // A PDF or HEIC would be accepted by Claude but can't be rendered by the
    // review UI, so the allowlist is enforced here rather than downstream.
    it.each(["application/pdf", "image/heic", "image/gif", undefined, 42])(
      "400s on mediaType %s",
      async (mediaType) => {
        const res = makeRes();

        await handler(recognizeRequest({ mediaType }), res.res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({
          error: "mediaType must be one of image/jpeg, image/png, image/webp",
        });
      }
    );

    it.each(["image/jpeg", "image/png", "image/webp"])("accepts mediaType %s", async (mediaType) => {
      const res = makeRes();

      await handler(recognizeRequest({ mediaType }), res.res);

      expect(res.statusCode).toBe(200);
    });

    it("validates the body before spending a Claude call on it", async () => {
      await handler(recognizeRequest({ imageBase64: "" }), makeRes().res);

      expect(reserveCall).not.toHaveBeenCalled();
      expect(recognizeReceipt).not.toHaveBeenCalled();
    });
  });

  // Issue 15 / spec Section 16. The refusal is the only thing standing between
  // an exhausted user and a billable Claude call, so every assertion here is
  // about it firing *before* recognizeReceipt.
  describe("AI Access refusal (402)", () => {
    beforeEach(() => installSupabase());

    // The body is whatever aiAccessRefusal builds from the refused status —
    // its shape is that module's to test (aiAccessRefusal.test.ts), so the
    // route only checks it sends it (docs/adr/0001).
    it("402s with the refusal built from the caller's access status", async () => {
      const status = blocked("cap", { spentUsd: 0.97, capUsd: 1 });
      reserve(status);
      const refusal = { code: "ai_trial_exhausted" } as const;
      vi.mocked(aiAccessRefusal).mockReturnValue(refusal);
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(aiAccessRefusal).toHaveBeenCalledWith(status);
      expect(res.statusCode).toBe(402);
      expect(res.body).toBe(refusal);
    });

    it("checks access for the authenticated caller, not the Circle", async () => {
      reserve(blocked("trial"));

      await handler(recognizeRequest(), makeRes().res);

      expect(reserveCall).toHaveBeenCalledWith(USER.id);
    });

    it("spends nothing: no Claude call, no upload, no draft", async () => {
      const { upload } = installSupabase();
      reserve(blocked("trial"));

      await handler(recognizeRequest(), makeRes().res);

      expect(recognizeReceipt).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      expect(reservation.recordSpend).not.toHaveBeenCalled();
      expect(saveDraftReceipt).not.toHaveBeenCalled();
    });

    // A refusal reserved nothing, so there's nothing to hand back.
    it("releases nothing", async () => {
      reserve(blocked("trial"));

      await handler(recognizeRequest(), makeRes().res);

      expect(reservation.release).not.toHaveBeenCalled();
    });
  });

  describe("the happy path", () => {
    it("stores the image under the caller's Circle with the right extension", async () => {
      const { upload } = installSupabase();

      await handler(recognizeRequest({ mediaType: "image/png" }), makeRes().res);

      expect(supabaseAdmin.storage.from).toHaveBeenCalledWith("receipts");
      const [path, buffer, options] = upload.mock.calls[0];
      expect(path).toMatch(new RegExp(`^${CIRCLE_ID}/[0-9a-f-]{36}\\.png$`));
      expect(buffer).toBeInstanceOf(Buffer);
      expect(options).toEqual({ contentType: "image/png" });
    });

    it("passes the Circle's existing products to the matcher", async () => {
      installSupabase({
        products: {
          data: [{ id: "product-1", canonical_name_en: "Anchor Blue Milk 2L" }],
          error: null,
        },
      });

      await handler(recognizeRequest(), makeRes().res);

      expect(recognizeReceipt).toHaveBeenCalledWith({
        imageBase64: "aGVsbG8=",
        mediaType: "image/jpeg",
        existingProducts: [{ id: "product-1", canonicalNameEn: "Anchor Blue Milk 2L" }],
      });
    });

    it("treats a Circle with no products yet as an empty list, not a failure", async () => {
      installSupabase({ products: { data: null, error: null } });
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(recognizeReceipt).toHaveBeenCalledWith(expect.objectContaining({ existingProducts: [] }));
      expect(res.statusCode).toBe(200);
    });

    it("records the call's real cost against the caller", async () => {
      installSupabase();

      await handler(recognizeRequest(), makeRes().res);

      expect(calculateHaikuCost).toHaveBeenCalledWith({ input_tokens: 900, output_tokens: 300 });
      expect(reserveCall).toHaveBeenCalledWith(USER.id);
      expect(reservation.recordSpend).toHaveBeenCalledWith(0.0042);
    });

    it("keeps the reservation on success", async () => {
      installSupabase();

      await handler(recognizeRequest(), makeRes().res);

      expect(reservation.release).not.toHaveBeenCalled();
    });

    // receipts.uploaded_by is a uuid FK to auth.users, compared against
    // auth.uid() by RLS — an email here would break every policy on the table.
    it("saves the Draft against the caller's user id, and returns its id", async () => {
      const { upload } = installSupabase();
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(saveDraftReceipt).toHaveBeenCalledWith({
        circleId: CIRCLE_ID,
        uploadedBy: USER.id,
        originalImageUrl: upload.mock.calls[0][0],
        receipt: RECOGNIZED.receipt,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ receiptId: "receipt-1" });
    });
  });

  describe("failures after the access check", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("500s when the image can't be stored, before calling Claude", async () => {
      installSupabase({ uploadError: { message: "bucket not found" } });
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to store the receipt image" });
      expect(recognizeReceipt).not.toHaveBeenCalled();
    });

    it("500s when the products lookup fails, before calling Claude", async () => {
      installSupabase({ products: { data: null, error: { message: "permission denied" } } });
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to load this circle's existing products" });
      expect(recognizeReceipt).not.toHaveBeenCalled();
    });

    it("surfaces a thrown Error's message so the client can show something useful", async () => {
      installSupabase();
      vi.mocked(recognizeReceipt).mockRejectedValue(new Error("Image exceeds 5MB limit"));
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Image exceeds 5MB limit" });
    });

    // Ticket 38: a PostgrestError (a plain object, not an Error instance)
    // names tables, columns and constraints. It's logged, not sent; the
    // client gets the generic message instead.
    it("hides a database error's own message behind the generic one", async () => {
      installSupabase();
      const dbError = { message: 'null value in column "store_id" violates not-null constraint' };
      vi.mocked(saveDraftReceipt).mockRejectedValue(dbError);
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to recognize receipt" });
      expect(console.error).toHaveBeenCalledWith(expect.any(String), dbError);
    });

    it("falls back to a generic message when the rejection carries none", async () => {
      installSupabase();
      vi.mocked(recognizeReceipt).mockRejectedValue("something went sideways");
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to recognize receipt" });
    });

    // A user whose call died after recordSpend still gets charged for it;
    // one that died before doesn't. Pinned because it decides who pays.
    it("does not charge the caller when the Claude call itself fails", async () => {
      installSupabase();
      vi.mocked(recognizeReceipt).mockRejectedValue(new Error("overloaded_error"));

      await handler(recognizeRequest(), makeRes().res);

      expect(reservation.recordSpend).not.toHaveBeenCalled();
    });

    // Issue 15: the Free Trial counts successful calls only, so every exit
    // that didn't get a recognized receipt back hands the reservation back.
    // The hand-back must finish *before* the response is written: once it's
    // sent, Vercel may freeze the function and a pending release never runs.
    // The fake release only settles after a macrotask, so a handler that
    // didn't await it would already have responded by then.
    it.each([
      ["the image can't be stored", { uploadError: { message: "bucket not found" } }, null],
      ["the products lookup fails", { products: { data: null, error: { message: "denied" } } }, null],
      ["the Claude call or its parse fails", {}, new Error("overloaded_error")],
    ])("releases the reservation, before responding, when %s", async (_label, wiring, claudeError) => {
      installSupabase(wiring);
      if (claudeError) {
        vi.mocked(recognizeReceipt).mockRejectedValue(claudeError);
      }
      const res = makeRes();
      let statusWhenReleased: number | undefined = -1;
      reservation.release.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        statusWhenReleased = res.statusCode;
      });

      await handler(recognizeRequest(), res.res);

      expect(reservation.release).toHaveBeenCalledTimes(1);
      expect(statusWhenReleased).toBeUndefined();
      expect(res.statusCode).toBe(500);
    });

    // Claude answered, so the call was spent — a later failure saving the
    // Draft doesn't refund it (same line recordSpend draws).
    it("keeps the reservation when only saving the Draft fails", async () => {
      installSupabase();
      vi.mocked(saveDraftReceipt).mockRejectedValue({ message: "insert failed" });

      await handler(recognizeRequest(), makeRes().res);

      expect(reservation.recordSpend).toHaveBeenCalled();
      expect(reservation.release).not.toHaveBeenCalled();
    });

    // A failed hand-back must not replace the user's real error or crash the
    // function. It's logged instead.
    it("still returns the original error when the release itself fails", async () => {
      installSupabase();
      vi.mocked(recognizeReceipt).mockRejectedValue(new Error("overloaded_error"));
      reservation.release.mockRejectedValue({ message: "db down" });
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "overloaded_error" });
    });
  });

  // Ticket 38: the image is stored before Claude is called, so any later
  // failure would leave it in the bucket with no receipt pointing at it.
  describe("the stored image, when a later step fails", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it.each([
      ["the products lookup fails", { products: { data: null, error: { message: "denied" } } }, () => {}],
      [
        "the Claude call fails",
        {},
        () => vi.mocked(recognizeReceipt).mockRejectedValue(new Error("overloaded_error")),
      ],
      [
        "saving the Draft fails",
        {},
        () => vi.mocked(saveDraftReceipt).mockRejectedValue({ message: "insert failed" }),
      ],
    ])("is deleted, before responding, when %s", async (_label, wiring, breakIt) => {
      const { db, upload, remove } = installSupabase(wiring);
      breakIt();
      const res = makeRes();
      let statusWhenRemoved: number | undefined = -1;
      remove.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        statusWhenRemoved = res.statusCode;
        return { data: [], error: null };
      });

      await handler(recognizeRequest(), res.res);

      const [storedPath] = upload.mock.calls[0];
      expect(remove).toHaveBeenCalledWith([storedPath]);
      expect(db.storageFrom).toHaveBeenLastCalledWith("receipts");
      expect(statusWhenRemoved).toBeUndefined();
      expect(res.statusCode).toBe(500);
    });

    it("is kept when the Draft is saved", async () => {
      const { remove } = installSupabase();

      await handler(recognizeRequest(), makeRes().res);

      expect(remove).not.toHaveBeenCalled();
    });

    it("isn't deleted when it was never stored", async () => {
      const { remove } = installSupabase({ uploadError: { message: "bucket not found" } });

      await handler(recognizeRequest(), makeRes().res);

      expect(remove).not.toHaveBeenCalled();
    });

    // Best effort: a failed delete is logged, never allowed to replace the
    // user's real error or crash the function.
    it.each([
      ["reports an error", { removeResult: { data: null, error: { message: "storage down" } } }],
      ["rejects", {}],
    ])("still returns the original error when the delete %s", async (label, wiring) => {
      const { remove } = installSupabase(wiring);
      if (label === "rejects") {
        remove.mockRejectedValue(new Error("network down"));
      }
      vi.mocked(recognizeReceipt).mockRejectedValue(new Error("overloaded_error"));
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "overloaded_error" });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("failed to delete the stored image"),
        expect.anything()
      );
    });
  });
});
