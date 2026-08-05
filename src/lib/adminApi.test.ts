import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase (for the access token) and fetch (for the /api/admin calls) are
// the external boundaries — mock them here, not the behavior we're testing
// (issue 15: the admin dashboard's list/grant-credit/ban calls).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchAdminUsers, grantAdminCredit, setAdminUserBanned, isGlobalAdmin } from "@/lib/adminApi";

function globalAdminsChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select };
}

describe("adminApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-1" } },
      error: null,
    } as never);
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

  it("isGlobalAdmin returns true when the user has a global_admins row", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      globalAdminsChain({ data: { user_id: "u1" }, error: null }) as never
    );

    await expect(isGlobalAdmin("u1")).resolves.toBe(true);
  });

  it("isGlobalAdmin returns false when the user has no global_admins row", async () => {
    vi.mocked(supabase.from).mockReturnValue(globalAdminsChain({ data: null, error: null }) as never);

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
