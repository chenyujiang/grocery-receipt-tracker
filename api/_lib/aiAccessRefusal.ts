import { FREE_TRIAL_LIMIT, type AccessStatus } from "./userAiAccess.js";

// Where a blocked user is told to go. Issue 15: nothing lifts an exhausted
// Free Trial or AI Credit automatically — only a Global Admin's manual grant
// — so the refusal has to hand the user a way out, not just say no.
export const SUPPORT_EMAIL = "nz.eason.chen@gmail.com";

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// The user-facing copy for a refused recognition call, kept out of the route
// so that rewording it doesn't touch an HTTP test (see docs/adr/0001).
export function aiAccessRefusalMessage(status: AccessStatus): string {
  const reason =
    status.mode === "trial"
      ? `You've already used all ${FREE_TRIAL_LIMIT} of your free AI recognitions.`
      : `AI recognition quota used up (${usd(status.spentUsd)} of ${usd(status.capUsd ?? 0)}).`;

  return `${reason} Email ${SUPPORT_EMAIL} to get credit assigned.`;
}
