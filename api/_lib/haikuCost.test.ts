import { describe, it, expect } from "vitest";
import { calculateHaikuCost } from "./haikuCost";

describe("calculateHaikuCost", () => {
  it("prices input and output tokens separately at Haiku 4.5 rates ($1/1M in, $5/1M out)", () => {
    // 1000 input tokens * $1/1M = $0.001; 500 output tokens * $5/1M = $0.0025
    expect(calculateHaikuCost({ input_tokens: 1000, output_tokens: 500 })).toBeCloseTo(0.0035, 6);
  });

  it("returns 0 for a call with no usage", () => {
    expect(calculateHaikuCost({ input_tokens: 0, output_tokens: 0 })).toBe(0);
  });

  it("returns exactly $1 for 1M input tokens alone", () => {
    expect(calculateHaikuCost({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(1);
  });

  it("avoids floating-point noise (0.1 + 0.2 style errors)", () => {
    // 100,000 input tokens -> $0.1; 40,000 output tokens -> $0.2
    expect(calculateHaikuCost({ input_tokens: 100_000, output_tokens: 40_000 })).toBe(0.3);
  });
});
