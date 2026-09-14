import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_lib/supabaseAdmin.js", () => ({ supabaseAdmin: {} }));

// getAccessStatus/recordSuccess are stubbed, but FREE_TRIAL_LIMIT stays real —
// the refusal copy is built from it, and a fake limit would make the 402
// assertions vacuous.
vi.mock("../_lib/userAiAccess.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/userAiAccess.js")>()),
  getAccessStatus: vi.fn(),
  recordSuccess: vi.fn(),
}));
vi.mock("../_lib/haikuCost.js", () => ({ calculateHaikuCost: vi.fn() }));
vi.mock("../_lib/recognizeReceipt.js", () => ({ recognizeReceipt: vi.fn() }));
vi.mock("../_lib/saveDraftReceipt.js", () => ({ saveDraftReceipt: vi.fn() }));

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { getAccessStatus, recordSuccess, FREE_TRIAL_LIMIT } from "../_lib/userAiAccess.js";
import { aiAccessRefusalMessage, SUPPORT_EMAIL } from "../_lib/aiAccessRefusal.js";
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
}

function installSupabase({ profiles, products, uploadError = null }: Wiring = {}) {
  const db = installFakeSupabase(supabaseAdmin, {
    auth: { getUser: { data: { user: USER }, error: null } },
    tables: {
      profiles: profiles ?? { data: { circle_id: CIRCLE_ID }, error: null },
      products: products ?? { data: [], error: null },
    },
    storage: { upload: { error: uploadError } },
  });
  return { db, upload: db.storage.upload };
}

function recognizeRequest(overrides: Record<string, unknown> = {}) {
  return makeReq({
    method: "POST",
    authToken: "tok",
    body: { imageBase64: "aGVsbG8=", mediaType: "image/jpeg", ...overrides },
  });
}

/** An AccessStatus in the shape getAccessStatus returns for a blocked user. */
function blocked(mode: "trial" | "cap", extra: Record<string, unknown> = {}) {
  return {
    allowed: false,
    mode,
    spentUsd: mode === "cap" ? 1 : 0,
    capUsd: mode === "cap" ? 1 : null,
    freeTrialCallsUsed: mode === "trial" ? FREE_TRIAL_LIMIT : 0,
    ...extra,
  };
}

const ALLOWED = { allowed: true, mode: "trial" as const, spentUsd: 0, capUsd: null, freeTrialCallsUsed: 0 };

describe("POST /api/receipts/recognize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFakeSupabase(supabaseAdmin);
    vi.mocked(getAccessStatus).mockResolvedValue(ALLOWED as never);
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
      expect(getAccessStatus).not.toHaveBeenCalled();
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

      expect(getAccessStatus).not.toHaveBeenCalled();
      expect(recognizeReceipt).not.toHaveBeenCalled();
    });
  });

  // Issue 15 / spec Section 16. The refusal is the only thing standing between
  // an exhausted user and a billable Claude call, so every assertion here is
  // about it firing *before* recognizeReceipt.
  describe("AI Access refusal (402)", () => {
    beforeEach(() => installSupabase());

    it("402s when the Free Trial is used up, naming the call count", async () => {
      const status = blocked("trial");
      vi.mocked(getAccessStatus).mockResolvedValue(status as never);
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(402);
      expect(res.body).toEqual({ error: aiAccessRefusalMessage(status as never) });
      expect(res.body).toMatchObject({
        error: expect.stringContaining(`all ${FREE_TRIAL_LIMIT} of your free AI recognitions`),
      });
    });

    it("402s when granted AI Credit is used up, naming spend against the cap", async () => {
      const status = blocked("cap", { spentUsd: 0.97, capUsd: 1 });
      vi.mocked(getAccessStatus).mockResolvedValue(status as never);
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(402);
      expect(res.body).toEqual({ error: aiAccessRefusalMessage(status as never) });
      expect(res.body).toMatchObject({ error: expect.stringContaining("($0.97 of $1.00)") });
    });

    // Nothing lifts a block automatically — no auto-reset, no auto-raise — so
    // a refusal that didn't say who to ask would be a dead end for the user.
    it.each(["trial", "cap"] as const)("tells a blocked %s user how to get unblocked", async (mode) => {
      vi.mocked(getAccessStatus).mockResolvedValue(blocked(mode) as never);
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.body).toMatchObject({ error: expect.stringContaining(SUPPORT_EMAIL) });
    });

    it("checks access for the authenticated caller, not the Circle", async () => {
      vi.mocked(getAccessStatus).mockResolvedValue(blocked("trial") as never);

      await handler(recognizeRequest(), makeRes().res);

      expect(getAccessStatus).toHaveBeenCalledWith(USER.id);
    });

    it("spends nothing: no Claude call, no upload, no draft", async () => {
      const { upload } = installSupabase();
      vi.mocked(getAccessStatus).mockResolvedValue(blocked("trial") as never);

      await handler(recognizeRequest(), makeRes().res);

      expect(recognizeReceipt).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      expect(recordSuccess).not.toHaveBeenCalled();
      expect(saveDraftReceipt).not.toHaveBeenCalled();
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
      expect(recordSuccess).toHaveBeenCalledWith(USER.id, 0.0042);
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

    // Supabase's PostgrestError is a plain object, not an Error instance —
    // the reason extractErrorMessage can't just use `instanceof Error`.
    it("surfaces the message of a non-Error rejection too", async () => {
      installSupabase();
      vi.mocked(saveDraftReceipt).mockRejectedValue({ message: "null value in column store_id" });
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "null value in column store_id" });
    });

    it("falls back to a generic message when the rejection carries none", async () => {
      installSupabase();
      vi.mocked(recognizeReceipt).mockRejectedValue("something went sideways");
      const res = makeRes();

      await handler(recognizeRequest(), res.res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Failed to recognize receipt" });
    });

    // A user whose call died after recordSuccess still gets charged for it;
    // one that died before doesn't. Pinned because it decides who pays.
    it("does not charge the caller when the Claude call itself fails", async () => {
      installSupabase();
      vi.mocked(recognizeReceipt).mockRejectedValue(new Error("overloaded_error"));

      await handler(recognizeRequest(), makeRes().res);

      expect(recordSuccess).not.toHaveBeenCalled();
    });
  });
});
