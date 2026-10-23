// The contract for a refused recognition call (HTTP 402), shared by the
// route that sends it and the page that shows it. The server sends what was
// refused, not a sentence: the copy is fixed UI chrome, so it lives in
// i18n.ts and follows the language toggle (spec Section 7). Import-free so
// the api project can import it.

// Where a blocked user is told to go. Issue 15: nothing lifts an exhausted
// Free Trial or AI Credit automatically — only a Global Admin's manual grant
// — so the refusal has to hand the user a way out, not just say no.
export const SUPPORT_EMAIL = "nz.eason.chen@gmail.com";

export type AiAccessRefusal =
  | { code: "ai_trial_exhausted" }
  | { code: "ai_credit_exhausted"; spentUsd: number; capUsd: number };

// Checks a 402 body really is a refusal before the page formats its amounts:
// the body comes off the network, so its type is only a claim until checked.
export function isAiAccessRefusal(body: unknown): body is AiAccessRefusal {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  if (candidate.code === "ai_trial_exhausted") return true;
  return (
    candidate.code === "ai_credit_exhausted" &&
    typeof candidate.spentUsd === "number" &&
    typeof candidate.capUsd === "number"
  );
}

// Carries no message of its own: the page turns the refusal into text.
export class AiAccessRefusedError extends Error {
  constructor(readonly refusal: AiAccessRefusal) {
    super("");
    this.name = "AiAccessRefusedError";
  }
}
