import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase (for the access token) and fetch (for the /api/admin calls) are
// the external boundaries — mock them here, not the behavior we're testing
// (issue 15: the admin dashboard's list/grant-credit/ban calls).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import {
  fetchAdminUsers,
  grantAdminCredit,
  setAdminUserBanned,
  isGlobalAdmin,
  mergeUsersIntoCircle,
} from "@/lib/adminApi";

// The `fetch` casts below are the HTTP boundary, not the Supabase one —
// out of scope for the shared fake.
function installSupabase(globalAdminsRow: unknown = null) {
  return installFakeSupabase(supabase, {
    auth: { getSession: { data: { session: { access_token: "tok-1" } }, error: null } },
    tables: { global_admins: { data: globalAdminsRow, error: null } },
  });
}

describe("adminApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    installSupabase();
  });

  it("fetchAdminUsers sends the access token and returns the user list", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ users: [{ userId: "u1" }] }),
    } as never);

    const users = await fetchAdminUsers();

    expect(users).toEqual([{ userId: "u1" }]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok-1" }),
      })
    );
  });

  it("grantAdminCredit posts a custom cap amount when given", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as never);

    await grantAdminCredit("u1", 5);

    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/users/u1/grant-credit",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ capUsd: 5 }) })
    );
  });

  it("grantAdminCredit posts an empty body when no amount is given (backend defaults to $1)", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as never);

    await grantAdminCredit("u1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/users/u1/grant-credit",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) })
    );
  });

  it("setAdminUserBanned posts the target banned state", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as never);

    await setAdminUserBanned("u1", true);

    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/users/u1/ban",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ banned: true }) })
    );
  });

  it("mergeUsersIntoCircle posts the selected user ids and returns the new circle id", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ circleId: "new-circle-1" }),
    } as never);

    const circleId = await mergeUsersIntoCircle(["u1", "u2"]);

    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/circles/merge",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ userIds: ["u1", "u2"] }) })
    );
    expect(circleId).toBe("new-circle-1");
  });

  it("isGlobalAdmin returns true when the user has a global_admins row", async () => {
    installSupabase({ user_id: "u1" });

    await expect(isGlobalAdmin("u1")).resolves.toBe(true);
  });

  it("isGlobalAdmin returns false when the user has no global_admins row", async () => {
    installSupabase(null);

    await expect(isGlobalAdmin("u1")).resolves.toBe(false);
  });

  it("throws the backend's error message when a request fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "not found" }),
    } as never);

    await expect(fetchAdminUsers()).rejects.toThrow("not found");
  });
});
