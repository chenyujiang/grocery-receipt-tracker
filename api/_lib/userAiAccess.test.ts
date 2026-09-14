import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (issue 15: per-user free-trial-then-dollar-cap
// AI-call access, replacing the old global ai_spend_limit).
vi.mock("./supabaseAdmin", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "./supabaseAdmin";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { getAccessStatus, recordSuccess } from "./userAiAccess";

/** The one row `user_ai_access` holds for a user, or null if they have none. */
function accessRow(row: unknown) {
  return { data: row, error: null };
}

describe("getAccessStatus", () => {
  it("allows a brand-new user with no row yet (free trial available)", async () => {
    installFakeSupabase(supabaseAdmin, { tables: { user_ai_access: accessRow(null) } });

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({
      allowed: true,
      mode: "trial",
      spentUsd: 0,
      capUsd: null,
      freeTrialCallsUsed: 0,
    });
  });

  it("allows a user whose row exists but hasn't used up their free trial yet", async () => {
    installFakeSupabase(supabaseAdmin, {
      tables: {
        user_ai_access: accessRow({ free_trial_calls_used: 4, cap_usd: null, spent_usd: 0 }),
      },
    });

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({
      allowed: true,
      mode: "trial",
      spentUsd: 0,
      capUsd: null,
      freeTrialCallsUsed: 4,
    });
  });

  it("refuses a user who has used all 5 free trial calls and has no dollar cap yet", async () => {
    installFakeSupabase(supabaseAdmin, {
      tables: {
        user_ai_access: accessRow({ free_trial_calls_used: 5, cap_usd: null, spent_usd: 0 }),
      },
    });

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({
      allowed: false,
      mode: "trial",
      spentUsd: 0,
      capUsd: null,
      freeTrialCallsUsed: 5,
    });
  });

  it("allows a dollar-cap user under their cap", async () => {
    installFakeSupabase(supabaseAdmin, {
      tables: {
        user_ai_access: accessRow({ free_trial_calls_used: 5, cap_usd: 1.0, spent_usd: 0.3 }),
      },
    });

    const status = await getAccessStatus("user-1");

    expect(status).toEqual({
      allowed: true,
      mode: "cap",
      spentUsd: 0.3,
      capUsd: 1.0,
      freeTrialCallsUsed: 0,
    });
  });

  it("refuses a dollar-cap user who has reached their cap", async () => {
    installFakeSupabase(supabaseAdmin, {
      tables: {
        user_ai_access: accessRow({ free_trial_calls_used: 5, cap_usd: 1.0, spent_usd: 1.0 }),
      },
    });

    const status = await getAccessStatus("user-1");

    expect(status.allowed).toBe(false);
  });
});

describe("recordSuccess", () => {
  it("increments the free trial call count when the caller was in trial mode", async () => {
    // The row is read first, then written back — one queue, two entries.
    const db = installFakeSupabase(supabaseAdmin, {
      tables: {
        user_ai_access: [
          accessRow({ free_trial_calls_used: 2, cap_usd: null, spent_usd: 0 }),
          { error: null },
        ],
      },
    });

    await recordSuccess("user-1", 0.002);

    expect(db.callsFor("user_ai_access")).toContainEqual([
      "upsert",
      { user_id: "user-1", free_trial_calls_used: 3 },
    ]);
  });

  it("adds the new cost onto the existing spent_usd when the caller is in dollar-cap mode", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      tables: {
        user_ai_access: [
          accessRow({ free_trial_calls_used: 5, cap_usd: 1.0, spent_usd: 0.3 }),
          { error: null },
        ],
      },
    });

    await recordSuccess("user-1", 0.05);

    expect(db.callsFor("user_ai_access")).toContainEqual(["update", { spent_usd: 0.35 }]);
  });
});
