import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isCronAuthorized } from "./cronAuth.js";

// What Vercel Cron sends as `Authorization: Bearer $CRON_SECRET`.
const CRON_SECRET = "cron-secret-from-env";

describe("isCronAuthorized", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("accepts the configured secret", () => {
    expect(isCronAuthorized(`Bearer ${CRON_SECRET}`)).toBe(true);
  });

  it("refuses a request with no Authorization header", () => {
    expect(isCronAuthorized(undefined)).toBe(false);
  });

  it("refuses the wrong secret", () => {
    expect(isCronAuthorized("Bearer not-the-secret")).toBe(false);
  });

  it("refuses every caller when CRON_SECRET is unset, rather than skipping the check", () => {
    delete process.env.CRON_SECRET;

    expect(isCronAuthorized(`Bearer ${CRON_SECRET}`)).toBe(false);
    expect(isCronAuthorized("Bearer ")).toBe(false);
    expect(isCronAuthorized(undefined)).toBe(false);
  });
});
