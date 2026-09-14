import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../_lib/requireGlobalAdmin.js", () => ({ requireGlobalAdmin: vi.fn() }));
vi.mock("../../../_lib/adminUsers.js", () => ({ setUserBanned: vi.fn() }));

import { requireGlobalAdmin } from "../../../_lib/requireGlobalAdmin.js";
import { setUserBanned } from "../../../_lib/adminUsers.js";
import { makeReq, makeRes } from "../../../_lib/testHandler.js";
import handler from "./ban.js";

const admin = { ok: true as const, userId: "admin-1" };

function banReq(body: unknown, query: Record<string, string | string[]> = { userId: "user-1" }) {
  return makeReq({ method: "POST", authToken: "tok", body, query });
}

describe("POST /api/admin/users/[userId]/ban", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireGlobalAdmin).mockResolvedValue(admin);
    vi.mocked(setUserBanned).mockResolvedValue(undefined as never);
  });

  it("rejects a non-POST method before checking who's calling", async () => {
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res.res);

    expect(res.statusCode).toBe(405);
    expect(requireGlobalAdmin).not.toHaveBeenCalled();
  });

  it.each([404, 401] as const)("relays the guard's %i with an empty body", async (status) => {
    vi.mocked(requireGlobalAdmin).mockResolvedValue({ ok: false, status });
    const res = makeRes();

    await handler(banReq({ banned: true }), res.res);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({});
    expect(setUserBanned).not.toHaveBeenCalled();
  });

  // The guard runs before the route params are validated, so a malformed
  // request from a stranger still gets the 404, never the 400.
  it("checks the caller before validating the route params", async () => {
    vi.mocked(requireGlobalAdmin).mockResolvedValue({ ok: false, status: 404 });
    const res = makeRes();

    await handler(banReq({}, {}), res.res);

    expect(res.statusCode).toBe(404);
  });

  it("400s when the route param is missing or repeated", async () => {
    const malformed: Array<Record<string, string | string[]>> = [{}, { userId: ["a", "b"] }];
    for (const query of malformed) {
      const res = makeRes();

      await handler(banReq({ banned: true }, query), res.res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Missing userId" });
    }
    expect(setUserBanned).not.toHaveBeenCalled();
  });

  // Issue 15 decision 5: one route driven by a boolean, not separate
  // ban/unban routes — so the boolean has to actually be a boolean.
  it.each([
    ["a missing body", undefined],
    ["an empty body", {}],
    ["a string instead of a boolean", { banned: "true" }],
    ["null", { banned: null }],
  ])("400s on %s rather than guessing an intent", async (_label, body) => {
    const res = makeRes();

    await handler(banReq(body), res.res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing boolean 'banned' in body" });
    expect(setUserBanned).not.toHaveBeenCalled();
  });

  it.each([true, false])("passes banned=%s straight through and echoes it back", async (banned) => {
    const res = makeRes();

    await handler(banReq({ banned }), res.res);

    expect(setUserBanned).toHaveBeenCalledWith("user-1", banned);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ userId: "user-1", banned });
  });

  it("turns a failure to update into a 500 without leaking the underlying error", async () => {
    vi.mocked(setUserBanned).mockRejectedValue(new Error("service_role key rejected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();

    await handler(banReq({ banned: true }), res.res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update ban status" });
  });
});
