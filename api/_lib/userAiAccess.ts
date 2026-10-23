import { supabaseAdmin } from "./supabaseAdmin.js";
import { FREE_TRIAL_LIMIT } from "../../src/lib/freeTrialLimit.js";

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
// the returned Reservation's recordSpend (Claude answered) or release (it
// didn't).
export type AccessMode = "trial" | "cap";

export interface AccessStatus {
  allowed: boolean;
  mode: AccessMode;
  spentUsd: number;
  capUsd: number | null;
  /** The real count in both modes (it stays frozen once a cap is granted). */
  freeTrialCallsUsed: number;
}

/**
 * One reserved (or refused) call. It carries the user id and mode it was
 * reserved under, so the route can't pair a release or a charge with the
 * wrong user or mode.
 */
export interface Reservation {
  status: AccessStatus;
  /**
   * Hands back a call that didn't get an answer from Claude (issue 15: the
   * Free Trial counts successful calls only). Dollar-cap mode reserves
   * nothing up front, so there it does nothing.
   */
  release(): Promise<void>;
  /**
   * Charges an answered call. A trial call was already counted at
   * reservation, so only a dollar-cap call has anything left to record.
   */
  recordSpend(costUsd: number): Promise<void>;
}

// Check-and-reserve in one atomic database call, made before the Claude
// call. When the status is `allowed` in trial mode, the call has already
// been counted. Dollar-cap mode only checks spent_usd < cap_usd here — the
// cost isn't known until Claude answers, so recordSpend adds it afterwards.
export async function reserveCall(userId: string): Promise<Reservation> {
  const { data, error } = await supabaseAdmin.rpc("reserve_ai_call", {
    p_user_id: userId,
    p_free_trial_limit: FREE_TRIAL_LIMIT,
  });
  if (error) {
    throw error;
  }
  const row = data[0];
  const status: AccessStatus = {
    allowed: row.allowed,
    mode: row.mode,
    spentUsd: row.spent_usd,
    capUsd: row.cap_usd,
    freeTrialCallsUsed: row.free_trial_calls_used,
  };

  return {
    status,
    async release() {
      if (!status.allowed || status.mode !== "trial") {
        return;
      }
      const { error: releaseError } = await supabaseAdmin.rpc("release_ai_call", { p_user_id: userId });
      if (releaseError) {
        throw releaseError;
      }
    },
    async recordSpend(costUsd: number) {
      if (!status.allowed || status.mode !== "cap") {
        return;
      }
      const { error: spendError } = await supabaseAdmin.rpc("record_ai_spend", {
        p_user_id: userId,
        p_cost_usd: costUsd,
      });
      if (spendError) {
        throw spendError;
      }
    },
  };
}
