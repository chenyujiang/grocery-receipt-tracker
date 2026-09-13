import { describe, it, expect, vi, beforeEach } from "vitest";

// Handler seam: this route's collaborators are its _lib modules, both already
// tested on their own — see docs/adr/0001. The `.js` suffix must match the
// handler's own import specifier or the mock silently doesn't apply.
vi.mock("../../_lib/requireGlobalAdmin.js", () => ({ requireGlobalAdmin: vi.fn() }));
vi.mock("../../_lib/adminUsers.js", () => ({ listAdminUsers: vi.fn() }));

import { requireGlobalAdmin } from "../../_lib/requireGlobalAdmin.js";
import { listAdminUsers } from "../../_lib/adminUsers.js";
import { makeReq, makeRes } from "../../_lib/testHandler.js";
import handler from "./index.js";

const admin = { ok: true as const, userId: "admin-1" };

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireGlobalAdmin).mockResolvedValue(admin);
  });

  it("rejects a non-GET method before checking who's calling", async () => {
    const res = makeRes();

    await handler(makeReq({ method: "POST" }), res.res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
    expect(requireGlobalAdmin).not.toHaveBeenCalled();
  });

  it("passes the Authorization header to the guard", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([]);

    await handler(makeReq({ method: "GET", authToken: "tok" }), makeRes().res);

    expect(requireGlobalAdmin).toHaveBeenCalledWith("Bearer tok");
  });

  // Issue 15: a non-admin gets the guard's 404, with an empty body, so the
  // route's existence isn't revealed. 401 is relayed the same silent way.
  it.each([404, 401])("relays the guard's %i with an empty body", async (status) => {
    vi.mocked(requireGlobalAdmin).mockResolvedValue({ ok: false, status });
    const res = makeRes();

    await handler(makeReq({ method: "GET", authToken: "tok" }), res.res);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({});
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it("returns the user list to a global admin", async () => {
    const users = [{ userId: "user-1", email: "a@example.com" }];
    vi.mocked(listAdminUsers).mockResolvedValue(users as never);
    const res = makeRes();

    await handler(makeReq({ method: "GET", authToken: "tok" }), res.res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ users });
  });

  it("turns a lookup failure into a 500 without leaking the underlying error", async () => {
    vi.mocked(listAdminUsers).mockRejectedValue(new Error("connection to db refused at 10.0.0.1"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();

    await handler(makeReq({ method: "GET", authToken: "tok" }), res.res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load users" });
  });
});
