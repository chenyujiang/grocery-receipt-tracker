import { describe, it, expect } from "vitest";
import { creditAmounts } from "@/lib/creditAmounts";

describe("creditAmounts", () => {
  // Spend is summed per-call costs, so a raw float must not reach the user.
  it("rounds an AI Credit's spend and cap to the cent", () => {
    expect(creditAmounts({ spentUsd: 0.8200000000000001, capUsd: 1 })).toEqual({
      spent: "0.82",
      cap: "1.00",
    });
  });
});
