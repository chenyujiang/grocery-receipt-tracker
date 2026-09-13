import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../_lib/requireGlobalAdmin.js", () => ({ requireGlobalAdmin: vi.fn() }));
vi.mock("../../../_lib/adminUsers.js", () => ({ grantCredit: vi.fn() }));

import { requireGlobalAdmin } from "../../../_lib/requireGlobalAdmin.js";
import { grantCredit } from "../../../_lib/adminUsers.js";
import { makeReq, makeRes } from "../../../_lib/testHandler.js";
import handler from "./grant-credit.js";

const admin = { ok: true as const, userId: "admin-1" };

function grantReq(body: unknown, query: Record<string, string | string[]> = { userId: "user-1" }) {
  return makeReq({ method: "POST", authToken: "tok", body, query });
}

describe("POST /api/admin/users/[userId]/grant-credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireGlobalAdmin).mockResolvedValue(admin);
    vi.mocked(grantCredit).mockResolvedValue(undefined as never);
  });

  it("rejects a non-POST method before checking who's calling", async () => {
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(res.statusCode).toBe(405);
    expect(requireGlobalAdmin).not.toHaveBeenCalled();
  });

  it.each([404, 401])("relays the guard's %i with an empty body", async (status) => {
    vi.mocked(requireGlobalAdmin).mockResolvedValue({ ok: false, status });
    const res = makeRes();

    await handler(grantReq({}), res.res);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({});
    expect(grantCredit).not.toHaveBeenCalled();
  });

  it("400s when the route param is missing", async () => {
    const res = makeRes();

    await handler(grantReq({}, {}), res.res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing userId" });
    expect(grantCredit).not.toHaveBeenCalled();
  });

  // Issue 15 decision 4: a grant is always a reset to a fresh cap, never a
  // top-up. Omitting capUsd means "reset to the default", which the route
  // expresses by passing undefined and letting adminUsers.ts pick the amount.
  it.each([
    ["a missing body", undefined],
    ["an empty body", {}],
  ])("defers to the default cap on %s", async (_label, body) => {
    const res = makeRes();

    await handler(grantReq(body), res.res);

    expect(grantCredit).toHaveBeenCalledWith("user-1", undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ userId: "user-1" });
  });

  it("passes a valid custom cap through unchanged", async () => {
    await handler(grantReq({ capUsd: 5.5 }), makeRes().res);

    expect(grantCredit).toHaveBeenCalledWith("user-1", 5.5);
  });

  // CHARACTERIZATION, NOT ENDORSEMENT: an unusable capUsd is silently
  // downgraded to the default cap instead of being refused, so a typo'd
  // grant looks like it succeeded at the amount the admin typed.
  // See .scratch/grocery-receipt-tracker/issues/21-reject-invalid-grant-amounts.md
  it.each([
    ["a numeric string", "5"],
    ["zero", 0],
    ["a negative amount", -5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
  ])("currently falls back to the default cap on %s instead of 400ing", async (_label, capUsd) => {
    const res = makeRes();

    await handler(grantReq({ capUsd }), res.res);

    expect(grantCredit).toHaveBeenCalledWith("user-1", undefined);
    expect(res.statusCode).toBe(200);
  });

  it("turns a failure to grant into a 500 without leaking the underlying error", async () => {
    vi.mocked(grantCredit).mockRejectedValue(new Error("user_ai_access row locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();

    await handler(grantReq({ capUsd: 1 }), res.res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to grant credit" });
  });
});
