import { describe, it, expect } from "vitest";
import { AiAccessRefusedError } from "@/lib/aiAccessRefusal";
import { errorMessage, UnexplainedError } from "@/lib/errorMessage";

describe("AiAccessRefusedError", () => {
  // The page words the refusal itself; if one ever reaches errorMessage
  // instead, it must still show the caller's translated fallback, while the
  // console names which refusal it was.
  it("is an UnexplainedError whose message names the refusal code", () => {
    const err = new AiAccessRefusedError({ code: "ai_credit_exhausted", spentUsd: 1.02, capUsd: 1 });

    expect(err).toBeInstanceOf(UnexplainedError);
    expect(err.message).toBe("ai_credit_exhausted");
    expect(errorMessage(err, "上传失败")).toBe("上传失败");
  });
});
