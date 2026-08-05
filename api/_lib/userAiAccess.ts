import { supabaseAdmin } from "./supabaseAdmin.js";

// Issue 15: per-user AI-call access, replacing ai_spend_limit's single
// global cap (see supabase/migrations/..._admin_dashboard_and_user_ai_access.sql).
// Mode is derived from cap_usd, not stored as a separate enum: no row (or
// cap_usd null) means the user is still in their one-free-call trial;
// once cap_usd is set (by an admin grant), the user is in dollar-cap mode.
export interface AccessStatus {
  allowed: boolean;
  mode: "trial" | "cap";
  spentUsd: number;
  capUsd: number | null;
}

export async function getAccessStatus(userId: string): Promise<AccessStatus> {
  const { data, error } = await supabaseAdmin
    .from("user_ai_access")
    .select("free_trial_used, cap_usd, spent_usd")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  if (!data || data.cap_usd === null) {
    const trialUsed = data?.free_trial_used ?? false;
    return { allowed: !trialUsed, mode: "trial", spentUsd: 0, capUsd: null };
  }

  return {
    allowed: data.spent_usd < data.cap_usd,
    mode: "cap",
    spentUsd: data.spent_usd,
    capUsd: data.cap_usd,
  };
}

// Read-then-write, not an atomic increment: acceptable at this scale, same
// tradeoff spendLimit.ts's recordSpend already made.
export async function recordSuccess(userId: string, costUsd: number): Promise<void> {
  const status = await getAccessStatus(userId);

  if (status.mode === "trial") {
    const { error } = await supabaseAdmin
      .from("user_ai_access")
      .upsert({ user_id: userId, free_trial_used: true });
    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from("user_ai_access")
    .update({ spent_usd: status.spentUsd + costUsd })
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
}
