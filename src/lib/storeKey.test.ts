import { describe, it, expect } from "vitest";
import { storeKey } from "@/lib/storeKey";

describe("storeKey", () => {
  it("ignores case and collapses whitespace in both the chain and the branch", () => {
    expect(storeKey("  WOOLWORTHS ", "Church   Corner\t")).toEqual({
      chainKey: "woolworths",
      branchKey: "church corner",
    });
  });

  it("gives a null branch key when the branch is empty, meaning branch unknown", () => {
    expect(storeKey("Woolworths", "")).toEqual({ chainKey: "woolworths", branchKey: null });
    expect(storeKey("Woolworths", "   ")).toEqual({ chainKey: "woolworths", branchKey: null });
  });

  it("drops macrons, since a thermal printer likely prints Māngere as Mangere", () => {
    expect(storeKey("Woolworths", "Māngere Ōtāhuhu")).toEqual({
      chainKey: "woolworths",
      branchKey: "mangere otahuhu",
    });
  });

  it("spells out Rd as road, with or without a trailing full stop", () => {
    expect(storeKey("Woolworths", "Lincoln Rd").branchKey).toBe("lincoln road");
    expect(storeKey("Woolworths", "Lincoln Rd.").branchKey).toBe("lincoln road");
    expect(storeKey("Woolworths", "Lincoln Road").branchKey).toBe("lincoln road");
  });

  it("spells out the other common street abbreviations too — St, Ave, Dr", () => {
    expect(storeKey("New World", "Smith St")).toEqual(storeKey("New World", "Smith Street"));
    expect(storeKey("New World", "Dominion Ave.")).toEqual(storeKey("New World", "Dominion Avenue"));
    expect(storeKey("New World", "Lincoln Dr")).toEqual(storeKey("New World", "Lincoln Drive"));
  });

  it("spells out the rest of New Zealand's common street-type abbreviations", () => {
    for (const [short, long] of [
      ["Pl", "Place"],
      ["Cres", "Crescent"],
      ["Hwy", "Highway"],
      ["Tce", "Terrace"],
      ["Ln", "Lane"],
      ["Pde", "Parade"],
      ["Sq", "Square"],
      ["Ct", "Court"],
      ["Cl", "Close"],
      ["Blvd", "Boulevard"],
    ]) {
      expect(storeKey("New World", `Marine ${short}.`)).toEqual(storeKey("New World", `Marine ${long}`));
    }
  });

  // "Mt" is Mount in a suburb's name ("Mt Albert", "Mt Roskill"), not a
  // street type; the list stays street types only.
  it("leaves Mt alone, since it's part of a place name rather than a street type", () => {
    expect(storeKey("Woolworths", "Mt Albert").branchKey).toBe("mt albert");
  });

  it("drops full stops, so an initialism printed D.H. keys the same as DH", () => {
    expect(storeKey("D.H. Supermarket", "")).toEqual(storeKey("DH Supermarket", ""));
    expect(storeKey("Woolworths", "St. Lukes")).toEqual(storeKey("Woolworths", "St Lukes"));
  });

  it("treats hyphens, dashes, commas and slashes between parts of a branch as a plain space", () => {
    for (const branch of [
      "Sylvia Park - Mt Wellington",
      "Sylvia Park – Mt Wellington",
      "Sylvia Park, Mt Wellington",
      "Sylvia Park/Mt Wellington",
      "Sylvia Park Mt Wellington",
    ]) {
      expect(storeKey("Woolworths", branch).branchKey).toBe("sylvia park mt wellington");
    }
  });

  it("keys a Countdown receipt to Woolworths, since the rebrand left one branch under two chain names", () => {
    expect(storeKey("Countdown", "Newmarket")).toEqual({
      chainKey: "woolworths",
      branchKey: "newmarket",
    });
    expect(storeKey("COUNTDOWN ", "Newmarket").chainKey).toBe("woolworths");
  });

  // Spec: normalize separators. An apostrophe is one too — printed, dropped,
  // or doubled up around the n — so it's dropped before anything is compared.
  it("keys every printed spelling of PAK'nSAVE to one chain", () => {
    for (const chain of ["PAK'nSAVE", "Pak'nSave", "Pak n Save", "PAKnSAVE", "Pak 'n' Save", "Pak'n Save", "PAK’nSAVE"]) {
      expect(storeKey(chain, "Albany").chainKey).toBe("paknsave");
    }
  });
});
