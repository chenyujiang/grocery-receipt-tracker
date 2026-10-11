import { describe, it, expect } from "vitest";
import { storeName, storeShortName } from "@/lib/storeName";

const WOOLWORTHS = {
  chain_name_en: "Woolworths",
  chain_name_zh: "沃尔沃斯",
  branch_name_en: null,
  branch_name_zh: null,
};

describe("storeName / storeShortName", () => {
  // Issue 29: an unknown branch is decided in one place, isKnownBranch — a
  // branch named by empty text (what the AI writes for one it couldn't read)
  // is as unknown as one with no name at all, everywhere a Store is named.
  it("names a Store whose branch name is empty by its chain alone, like an unknown branch", () => {
    const emptyBranch = { ...WOOLWORTHS, branch_name_en: "", branch_name_zh: "" };

    expect(storeName(emptyBranch)).toEqual(storeName(WOOLWORTHS));
    expect(storeName(emptyBranch)).toEqual({ en: "Woolworths", zh: "沃尔沃斯" });
    expect(storeShortName(emptyBranch)).toEqual({ en: "Woolworths", zh: "沃尔沃斯" });
  });
});
