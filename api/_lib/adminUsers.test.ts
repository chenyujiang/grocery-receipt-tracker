import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here (issue 15: the
// admin dashboard's three operations — list all users, grant credit,
// ban/unban — each against a mocked Supabase/Supabase-Auth-Admin client).
vi.mock("./supabaseAdmin", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "./supabaseAdmin";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { listAdminUsers, grantCredit, setUserBanned, mergeUsersIntoNewCircle } from "./adminUsers";

describe("listAdminUsers", () => {
  it("joins profiles, circles, user_ai_access, and auth users into one row per user", async () => {
    installFakeSupabase(supabaseAdmin, {
      tables: {
        profiles: {
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
        },
        circles: { data: [{ id: "c1", name: "Chen Family" }], error: null },
        user_ai_access: {
          data: [{ user_id: "u1", free_trial_calls_used: 5, cap_usd: 1, spent_usd: 0.3 }],
          error: null,
        },
      },
      auth: {
        admin: {
          listUsers: {
            data: {
              users: [
                { id: "u1", email: "alice@example.com", banned_until: null },
                { id: "u2", email: "ben@example.com", banned_until: "2099-01-01T00:00:00Z" },
              ],
            },
            error: null,
          },
        },
      },
    });

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
  it("defaults to a $1 cap when no amount is given, resetting spent_usd", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      tables: { user_ai_access: { error: null } },
    });

    await grantCredit("u1");

    expect(db.callsFor("user_ai_access")).toContainEqual([
      "upsert",
      expect.objectContaining({
        user_id: "u1",
        cap_usd: 1,
        spent_usd: 0,
        free_trial_calls_used: 5,
      }),
    ]);
  });

  it("uses a custom amount when given", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      tables: { user_ai_access: { error: null } },
    });

    await grantCredit("u1", 5);

    expect(db.callsFor("user_ai_access")).toContainEqual([
      "upsert",
      expect.objectContaining({
        user_id: "u1",
        cap_usd: 5,
        spent_usd: 0,
        free_trial_calls_used: 5,
      }),
    ]);
  });
});

describe("setUserBanned", () => {
  it("bans a user with a long ban_duration", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      auth: { admin: { updateUserById: { error: null } } },
    });

    await setUserBanned("u1", true);

    expect(db.adminAuth.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ ban_duration: expect.any(String) })
    );
    const [, options] = db.adminAuth.updateUserById.mock.calls[0];
    expect(options.ban_duration).not.toBe("none");
  });

  it("unbans a user with ban_duration 'none'", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      auth: { admin: { updateUserById: { error: null } } },
    });

    await setUserBanned("u1", false);

    expect(db.adminAuth.updateUserById).toHaveBeenCalledWith("u1", { ban_duration: "none" });
  });
});

describe("mergeUsersIntoNewCircle", () => {
  it("calls the merge RPC with the given user ids and returns the new circle id", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      rpc: { merge_users_into_new_circle: { data: "new-circle-1", error: null } },
    });

    const circleId = await mergeUsersIntoNewCircle(["u1", "u2", "u3"]);

    expect(db.rpc).toHaveBeenCalledWith("merge_users_into_new_circle", {
      p_user_ids: ["u1", "u2", "u3"],
    });
    expect(circleId).toBe("new-circle-1");
  });

  it("rejects fewer than 2 users without calling the RPC", async () => {
    const db = installFakeSupabase(supabaseAdmin);

    await expect(mergeUsersIntoNewCircle(["u1"])).rejects.toThrow(/at least 2/i);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("throws when the RPC errors", async () => {
    installFakeSupabase(supabaseAdmin, {
      rpc: { merge_users_into_new_circle: { data: null, error: new Error("db error") } },
    });

    await expect(mergeUsersIntoNewCircle(["u1", "u2"])).rejects.toThrow("db error");
  });
});
