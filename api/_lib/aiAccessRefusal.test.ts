import { describe, it, expect } from "vitest";
import { aiAccessRefusal } from "./aiAccessRefusal.js";
import type { AccessStatus } from "./userAiAccess.js";
import { FREE_TRIAL_LIMIT } from "../../src/lib/freeTrialLimit.js";

// What a refused recognition call sends back. Tested here rather than in the
// route test so that changing the refusal's shape doesn't churn an HTTP test.
// The copy itself is the page's (src/lib/i18n.ts), so it follows the language
// toggle; this only decides which refusal it was and what to report.

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

describe("aiAccessRefusal", () => {
  it("reports a used-up Free Trial", () => {
    expect(aiAccessRefusal(trialStatus())).toEqual({ code: "ai_trial_exhausted" });
  });

  it("reports spend against the cap when granted AI Credit ran out", () => {
    expect(aiAccessRefusal(capStatus({ spentUsd: 0.97, capUsd: 1 }))).toEqual({
      code: "ai_credit_exhausted",
      spentUsd: 0.97,
      capUsd: 1,
    });
  });
});
