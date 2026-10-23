// The contract for a photo Claude answered for but that couldn't be read as
// a receipt (HTTP 422), shared by the code that throws it, the route that
// sends it, and the page that shows it. Like aiAccessRefusal.ts, the server
// sends a code, not a sentence: the advice is fixed UI chrome, so it lives in
// i18n.ts and follows the language toggle (spec Section 7). Imports only
// errorMessage.ts at runtime, so the api project can import it.

import { AdvisedError } from "./errorMessage.js";
import type { TranslationKey } from "./i18n.js";

const ADVICE = {
  // Claude stopped at max_tokens, mid-JSON.
  receipt_too_long: "errors.receiptTooLong",
  // Claude's answer wasn't valid JSON.
  receipt_incomplete: "errors.receiptIncomplete",
  // Valid JSON, but no usable date or no line items: not a receipt, or not
  // a readable one.
  receipt_unreadable: "errors.receiptUnreadable",
} as const satisfies Record<string, TranslationKey>;

export type RecognitionFailureCode = keyof typeof ADVICE;

// The 422 body comes off the network, so its code is only a claim until
// checked against the ones the page has advice for.
export function isRecognitionFailure(body: unknown): body is { code: RecognitionFailureCode } {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string" &&
    Object.prototype.hasOwnProperty.call(ADVICE, body.code)
  );
}

export class RecognitionFailedError extends AdvisedError {
  constructor(readonly code: RecognitionFailureCode) {
    super(code, ADVICE[code]);
    this.name = "RecognitionFailedError";
  }
}
