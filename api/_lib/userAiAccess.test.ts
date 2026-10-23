import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (issue 15: per-user free-trial-then-dollar-cap
// AI-call access, replacing the old global ai_spend_limit).
vi.mock("./supabaseAdmin", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "./supabaseAdmin";
import { installFakeSupabase, type PreparedResult } from "../../src/test/fakeSupabase.js";
import { FREE_TRIAL_LIMIT } from "../../src/lib/aiAccessPolicy.js";
import { reserveCall } from "./userAiAccess";

/** What reserve_ai_call returns: a one-row set. */
function reservation(row: Record<string, unknown>) {
  return { data: [row], error: null };
}

describe("reserveCall", () => {
  // The check and the increment happen in one UPDATE inside reserve_ai_call,
  // so concurrent uploads can't all pass on the last free call (ticket 37).
  it("reserves a free trial call in the database, passing the trial limit", async () => {
    const db = installFakeSupabase(supabaseAdmin, {
      rpc: {
        reserve_ai_call: reservation({
          allowed: true,
          mode: "trial",
          free_trial_calls_used: 3,
          cap_usd: null,
          spent_usd: 0,
        }),
      },
    });

    const { status } = await reserveCall("user-1");

    expect(db.rpc).toHaveBeenCalledWith("reserve_ai_call", {
      p_user_id: "user-1",
      p_free_trial_limit: FREE_TRIAL_LIMIT,
    });
    expect(status).toEqual({
      allowed: true,
      mode: "trial",
      spentUsd: 0,
      capUsd: null,
      freeTrialCallsUsed: 3,
    });
  });

  it("reports a refusal with the spend and cap the refusal message needs", async () => {
    installFakeSupabase(supabaseAdmin, {
      rpc: {
        reserve_ai_call: reservation({
          allowed: false,
          mode: "cap",
          free_trial_calls_used: 5,
          cap_usd: 1,
          spent_usd: 1.02,
        }),
      },
    });

    const { status } = await reserveCall("user-1");

    expect(status).toEqual({
      allowed: false,
      mode: "cap",
      spentUsd: 1.02,
      capUsd: 1,
      freeTrialCallsUsed: 5,
    });
  });

  it("rethrows a database error rather than treating it as allowed", async () => {
    installFakeSupabase(supabaseAdmin, {
      rpc: { reserve_ai_call: { data: null, error: { message: "permission denied" } } },
    });

    await expect(reserveCall("user-1")).rejects.toEqual({ message: "permission denied" });
  });
});

/** Reserves against a canned reserve_ai_call row, plus any other RPCs. */
async function reserveWith(row: Record<string, unknown>, rpc: Record<string, PreparedResult> = {}) {
  const db = installFakeSupabase(supabaseAdmin, { rpc: { reserve_ai_call: reservation(row), ...rpc } });
  const reserved = await reserveCall("user-1");
  db.rpc.mockClear();
  return { db, reserved };
}

const TRIAL = { allowed: true, mode: "trial", free_trial_calls_used: 3, cap_usd: null, spent_usd: 0 };
const CAP = { allowed: true, mode: "cap", free_trial_calls_used: 5, cap_usd: 1, spent_usd: 0.2 };
const OK = { data: null, error: null };

describe("Reservation.release", () => {
  // Issue 15: the Free Trial counts successful calls only.
  it("hands back a reserved free trial call for the user it was reserved for", async () => {
    const { db, reserved } = await reserveWith(TRIAL, { release_ai_call: OK });

    await reserved.release();

    expect(db.rpc).toHaveBeenCalledWith("release_ai_call", { p_user_id: "user-1" });
  });

  // Dollar-cap mode reserves nothing up front — spend is only added on success.
  it("does nothing for a dollar-cap call", async () => {
    const { db, reserved } = await reserveWith(CAP);

    await reserved.release();

    expect(db.rpc).not.toHaveBeenCalled();
  });

  // A refusal counted nothing, so handing it back would undercount.
  it("does nothing for a refused call", async () => {
    const { db, reserved } = await reserveWith({ ...TRIAL, allowed: false, free_trial_calls_used: 5 });

    await reserved.release();

    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rethrows a database error", async () => {
    const { reserved } = await reserveWith(TRIAL, {
      release_ai_call: { data: null, error: { message: "boom" } },
    });

    await expect(reserved.release()).rejects.toEqual({ message: "boom" });
  });
});

describe("Reservation.recordSpend", () => {
  // The increment happens in SQL (spent_usd = spent_usd + cost), so two
  // concurrent successes can't read the same old value and lose one.
  it("adds the call's cost to spend in the database for a dollar-cap call", async () => {
    const { db, reserved } = await reserveWith(CAP, { record_ai_spend: OK });

    await reserved.recordSpend(0.05);

    expect(db.rpc).toHaveBeenCalledWith("record_ai_spend", { p_user_id: "user-1", p_cost_usd: 0.05 });
  });

  // reserveCall already counted the call; success just keeps that count.
  it("writes nothing more for a free trial call", async () => {
    const { db, reserved } = await reserveWith(TRIAL);

    await reserved.recordSpend(0.002);

    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rethrows a database error", async () => {
    const { reserved } = await reserveWith(CAP, {
      record_ai_spend: { data: null, error: { message: "boom" } },
    });

    await expect(reserved.recordSpend(0.05)).rejects.toEqual({ message: "boom" });
  });
});
