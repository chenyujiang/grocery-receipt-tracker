import { describe, it, expect, vi } from "vitest";

// Nothing here touches Supabase, but FREE_TRIAL_LIMIT lives in userAiAccess.ts,
// which imports supabaseAdmin — and that module throws at import time when the
// service-role env vars are absent. Stubbed so the import graph stays loadable.
vi.mock("./supabaseAdmin.js", () => ({ supabaseAdmin: {} }));

import { aiAccessRefusalMessage, SUPPORT_EMAIL } from "./aiAccessRefusal.js";
import { FREE_TRIAL_LIMIT, type AccessStatus } from "./userAiAccess.js";

// The copy a user sees when AI Access is exhausted. Tested here rather than
// in the route test so that rewording it doesn't churn an HTTP test, and so
// the support address lives in one place instead of inline in a handler.

function trialStatus(overrides: Partial<AccessStatus> = {}): AccessStatus {
  return {
    allowed: false,
    mode: "trial",
    spentUsd: 0,
    capUsd: null,
    freeTrialCallsUsed: FREE_TRIAL_LIMIT,
    ...overrides,
  };
}

function capStatus(overrides: Partial<AccessStatus> = {}): AccessStatus {
  return {
    allowed: false,
    mode: "cap",
    spentUsd: 1,
    capUsd: 1,
    freeTrialCallsUsed: 0,
    ...overrides,
  };
}

describe("aiAccessRefusalMessage", () => {
  it("names the Free Trial call count when the trial is what ran out", () => {
    expect(aiAccessRefusalMessage(trialStatus())).toBe(
      `You've already used all ${FREE_TRIAL_LIMIT} of your free AI recognitions. ` +
        `Email ${SUPPORT_EMAIL} to get credit assigned.`
    );
  });

  it("reports spend against the cap when granted AI Credit ran out", () => {
    expect(aiAccessRefusalMessage(capStatus({ spentUsd: 1, capUsd: 1 }))).toBe(
      `AI recognition quota used up ($1.00 of $1.00). ` +
        `Email ${SUPPORT_EMAIL} to get credit assigned.`
    );
  });

  // The old inline version interpolated the raw numbers, so a $0.8200000001
  // float from summed per-call costs reached the user verbatim.
  it("formats both dollar amounts to 2 decimal places", () => {
    const message = aiAccessRefusalMessage(capStatus({ spentUsd: 0.8200000000000001, capUsd: 0.8 }));

    expect(message).toContain("($0.82 of $0.80)");
  });

  it("always tells the user how to get unblocked, since nothing lifts a block automatically", () => {
    for (const status of [trialStatus(), capStatus()]) {
      expect(aiAccessRefusalMessage(status)).toContain(SUPPORT_EMAIL);
    }
  });
});
