import type { AiAccessRefusal } from "../../src/lib/aiAccessRefusal.js";
import type { AccessStatus } from "./userAiAccess.js";

// The 402 body for a refused recognition call, kept out of the route so that
// changing its shape doesn't touch an HTTP test (see docs/adr/0001). It says
// which refusal it was, not a sentence: the copy is fixed UI chrome, so the
// upload page words it in the user's chosen language (spec Section 7).
export function aiAccessRefusal(status: AccessStatus): AiAccessRefusal {
  return status.mode === "trial"
    ? { code: "ai_trial_exhausted" }
    : { code: "ai_credit_exhausted", spentUsd: status.spentUsd, capUsd: status.capUsd ?? 0 };
}
