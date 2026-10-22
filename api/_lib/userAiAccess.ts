import { supabaseAdmin } from "./supabaseAdmin.js";

// Issue 15: per-user AI-call access, replacing ai_spend_limit's single
// global cap (see supabase/migrations/..._admin_dashboard_and_user_ai_access.sql).
// Mode is derived from cap_usd, not stored as a separate enum: no row (or
// cap_usd null) means the user is still in their free trial; once cap_usd
// is set (by an admin grant), the user is in dollar-cap mode.
//
// Ticket 37: every check and every increment happens inside a Postgres
// function (supabase/migrations/20261022000003_atomic_ai_access.sql), each a
// single row-locking UPDATE, so concurrent uploads from one user can't all
// pass the last free call and concurrent successes can't lose an increment.
// The route's lifecycle is: reserveCall before Claude, then exactly one of
// recordSuccess (the call succeeded) or releaseReservation (it didn't).
export const FREE_TRIAL_LIMIT = 5;

export type AccessMode = "trial" | "cap";

export interface AccessStatus {
  allowed: boolean;
  mode: AccessMode;
  spentUsd: number;
  capUsd: number | null;
  freeTrialCallsUsed: number;
}

// Check-and-reserve in one atomic database call, made before the Claude
// call. When the result is `allowed` in trial mode, the call has already
// been counted and must be handed back with releaseReservation if it doesn't
// succeed. Dollar-cap mode only checks spent_usd < cap_usd here — the cost
// isn't known until Claude answers, so it's added afterwards by recordSuccess.
export async function reserveCall(userId: string): Promise<AccessStatus> {
  const { data, error } = await supabaseAdmin.rpc("reserve_ai_call", {
    p_user_id: userId,
    p_free_trial_limit: FREE_TRIAL_LIMIT,
  });
  if (error) {
    throw error;
  }
  const row = data[0];
  return {
    allowed: row.allowed,
    mode: row.mode,
    spentUsd: row.spent_usd,
    capUsd: row.cap_usd,
    freeTrialCallsUsed: row.free_trial_calls_used,
  };
}

// Hands back a reservation whose call didn't succeed (issue 15: the Free
// Trial counts successful calls only). Dollar-cap mode reserves nothing up
// front, so there's nothing to hand back.
export async function releaseReservation(userId: string, mode: AccessMode): Promise<void> {
  if (mode !== "trial") {
    return;
  }
  const { error } = await supabaseAdmin.rpc("release_ai_call", { p_user_id: userId });
  if (error) {
    throw error;
  }
}

// `mode` is the one reserveCall returned. A trial call was already counted
// at reservation, so only a dollar-cap call has anything left to record.
export async function recordSuccess(userId: string, mode: AccessMode, costUsd: number): Promise<void> {
  if (mode !== "cap") {
    return;
  }
  const { error } = await supabaseAdmin.rpc("record_ai_spend", {
    p_user_id: userId,
    p_cost_usd: costUsd,
  });
  if (error) {
    throw error;
  }
}
