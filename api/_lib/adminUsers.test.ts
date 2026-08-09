import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external system boundary — mock it here (issue 15: the
// admin dashboard's three operations — list all users, grant credit,
// ban/unban — each against a mocked Supabase/Supabase-Auth-Admin client).
vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { admin: { listUsers: vi.fn(), updateUserById: vi.fn() } },
  },
}));

import { supabaseAdmin } from "./supabaseAdmin";
import { listAdminUsers, grantCredit, setUserBanned, mergeUsersIntoNewCircle } from "./adminUsers";

function selectChain(result: { data: unknown; error: unknown }) {
  const select = vi.fn(() => Promise.resolve(result));
  return { select };
}

function upsertChain(result: { error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result);
  return { upsert };
}

describe("listAdminUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins profiles, circles, user_ai_access, and auth users into one row per user", async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "profiles") {
        return selectChain({
          data: [
            {
              user_id: "u1",
              circle_id: "c1",
              role: "owner",
              created_at: "2026-01-05T00:00:00Z",
              display_name: "Alice Chen",
            },
            {
              user_id: "u2",
              circle_id: "c1",
              role: "member",
              created_at: "2026-02-10T00:00:00Z",
              display_name: "Ben Wu",
            },
          ],
          error: null,
        }) as never;
      }
      if (table === "circles") {
        return selectChain({ data: [{ id: "c1", name: "Chen Family" }], error: null }) as never;
      }
      if (table === "user_ai_access") {
        return selectChain({
          data: [{ user_id: "u1", free_trial_calls_used: 5, cap_usd: 1, spent_usd: 0.3 }],
          error: null,
        }) as never;
      }
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabaseAdmin.auth.admin.listUsers).mockResolvedValue({
      data: {
        users: [
          { id: "u1", email: "alice@example.com", banned_until: null },
          { id: "u2", email: "ben@example.com", banned_until: "2099-01-01T00:00:00Z" },
        ],
      },
      error: null,
    } as never);

    const users = await listAdminUsers();

    expect(users).toEqual([
      {
        userId: "u1",
        displayName: "Alice Chen",
        email: "alice@example.com",
        circleName: "Chen Family",
        role: "owner",
        joinedAt: "2026-01-05T00:00:00Z",
        banned: false,
        credit: { mode: "cap", capUsd: 1, spentUsd: 0.3 },
      },
      {
        userId: "u2",
        displayName: "Ben Wu",
        email: "ben@example.com",
        circleName: "Chen Family",
        role: "member",
        joinedAt: "2026-02-10T00:00:00Z",
        banned: true,
        credit: { mode: "trial", callsUsed: 0 },
      },
    ]);
  });
});

describe("grantCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to a $1 cap when no amount is given, resetting spent_usd", async () => {
    const chain = upsertChain({ error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as never);

    await grantCredit("u1");

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", cap_usd: 1, spent_usd: 0, free_trial_calls_used: 5 })
    );
  });

  it("uses a custom amount when given", async () => {
    const chain = upsertChain({ error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as never);

    await grantCredit("u1", 5);

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", cap_usd: 5, spent_usd: 0, free_trial_calls_used: 5 })
    );
  });
});

describe("setUserBanned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bans a user with a long ban_duration", async () => {
    vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({ error: null } as never);

    await setUserBanned("u1", true);

    expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ ban_duration: expect.any(String) })
    );
    const [, options] = vi.mocked(supabaseAdmin.auth.admin.updateUserById).mock.calls[0];
    expect(options.ban_duration).not.toBe("none");
  });

  it("unbans a user with ban_duration 'none'", async () => {
    vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({ error: null } as never);

    await setUserBanned("u1", false);

    expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith("u1", { ban_duration: "none" });
  });
});

describe("mergeUsersIntoNewCircle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the merge RPC with the given user ids and returns the new circle id", async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: "new-circle-1", error: null } as never);

    const circleId = await mergeUsersIntoNewCircle(["u1", "u2", "u3"]);

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("merge_users_into_new_circle", {
      p_user_ids: ["u1", "u2", "u3"],
    });
    expect(circleId).toBe("new-circle-1");
  });

  it("rejects fewer than 2 users without calling the RPC", async () => {
    await expect(mergeUsersIntoNewCircle(["u1"])).rejects.toThrow(/at least 2/i);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it("throws when the RPC errors", async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: new Error("db error") } as never);

    await expect(mergeUsersIntoNewCircle(["u1", "u2"])).rejects.toThrow("db error");
  });
});
