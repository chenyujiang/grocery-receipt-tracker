import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_lib/requireGlobalAdmin.js", () => ({ requireGlobalAdmin: vi.fn() }));
vi.mock("../../_lib/adminUsers.js", () => ({ mergeUsersIntoNewCircle: vi.fn() }));

import { requireGlobalAdmin } from "../../_lib/requireGlobalAdmin.js";
import { mergeUsersIntoNewCircle } from "../../_lib/adminUsers.js";
import { makeReq, makeRes } from "../../_lib/testHandler.js";
import handler from "./merge.js";

const admin = { ok: true as const, userId: "admin-1" };
const BAD_USER_IDS = { error: "userIds must be an array of at least 2 user ids" };

function mergeReq(body: unknown) {
  return makeReq({ method: "POST", authToken: "tok", body });
}

describe("POST /api/admin/circles/merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireGlobalAdmin).mockResolvedValue(admin);
    vi.mocked(mergeUsersIntoNewCircle).mockResolvedValue("circle-new" as never);
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

    await handler(mergeReq({ userIds: ["user-1", "user-2"] }), res.res);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({});
    expect(mergeUsersIntoNewCircle).not.toHaveBeenCalled();
  });

  // Merging is the only way people end up sharing a Circle (there's no
  // invite-link flow), and it's destructive-ish — it moves products and
  // receipts. A one-person "merge" is meaningless, hence the minimum of 2.
  it.each([
    ["a missing body", undefined],
    ["an empty body", {}],
    ["an empty array", { userIds: [] }],
    ["a single user", { userIds: ["user-1"] }],
    ["a non-array", { userIds: "user-1,user-2" }],
    ["an array containing a non-string", { userIds: ["user-1", 42] }],
    ["an array of nulls", { userIds: [null, null] }],
  ])("400s on %s without attempting the merge", async (_label, body) => {
    const res = makeRes();

    await handler(mergeReq(body), res.res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(BAD_USER_IDS);
    expect(mergeUsersIntoNewCircle).not.toHaveBeenCalled();
  });

  it("returns the new circle's id when the merge succeeds", async () => {
    const res = makeRes();

    await handler(mergeReq({ userIds: ["user-1", "user-2", "user-3"] }), res.res);

    expect(mergeUsersIntoNewCircle).toHaveBeenCalledWith(["user-1", "user-2", "user-3"]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ circleId: "circle-new" });
  });

  // merge_users_into_new_circle refuses to pull a user out of an already
  // multi-member circle — products are circle-level, so a partial merge
  // would strand the other members. That refusal surfaces here as a 500.
  it("turns the Postgres function's refusal into a 500", async () => {
    vi.mocked(mergeUsersIntoNewCircle).mockRejectedValue(
      new Error("user user-2 is already in a multi-member circle")
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();

    await handler(mergeReq({ userIds: ["user-1", "user-2"] }), res.res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to merge users into a circle" });
  });
});
