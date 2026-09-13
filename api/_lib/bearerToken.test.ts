import { describe, it, expect } from "vitest";
import { parseBearerToken } from "./bearerToken.js";

describe("parseBearerToken", () => {
  it("returns the token from a well-formed header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns null when there is no header at all", () => {
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("returns null for a scheme other than Bearer", () => {
    expect(parseBearerToken("Basic abc123")).toBeNull();
  });

  // The scheme is case-sensitive here only because all three call sites were
  // already written that way; nothing in this app issues a lowercase one.
  it("returns null for a lowercase scheme", () => {
    expect(parseBearerToken("bearer abc123")).toBeNull();
  });

  it("returns null for a bare token with no scheme", () => {
    expect(parseBearerToken("abc123")).toBeNull();
  });

  // "Bearer " used to slice to "", which every caller then treated as missing
  // via a falsy check. Returning null says that directly, so a caller
  // comparing the result against a secret can't ever match an empty one.
  it("returns null when the scheme is present but the token is empty", () => {
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
  });
});
