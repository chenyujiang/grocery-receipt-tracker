import { supabaseAdmin } from "./supabaseAdmin.js";

// Section 3.1: a single, global, hard-dollar cap on Claude API spend — not
// per-call-count, not per-user (see supabase/migrations/..._ai_spend_limit.sql).
export interface SpendStatus {
  spentUsd: number;
  capUsd: number;
  overCap: boolean;
}

export async function getSpendStatus(): Promise<SpendStatus> {
  const { data, error } = await supabaseAdmin
    .from("ai_spend_limit")
    .select("spent_usd, cap_usd")
    .single();
  if (error || !data) {
    throw error ?? new Error("ai_spend_limit row not found");
  }
  return {
    spentUsd: data.spent_usd,
    capUsd: data.cap_usd,
    overCap: data.spent_usd >= data.cap_usd,
  };
}

// Read-then-write, not an atomic increment: acceptable for a personal/family
// app with a $1 cap and low call concurrency, not worth a Postgres RPC here.
export async function recordSpend(costUsd: number): Promise<void> {
  const status = await getSpendStatus();
  const { error } = await supabaseAdmin
    .from("ai_spend_limit")
    .update({ spent_usd: status.spentUsd + costUsd })
    .eq("id", true);
  if (error) {
    throw error;
  }
}
