import { describe, it, expect } from "vitest";
import { errorMessage } from "@/lib/errorMessage";

describe("errorMessage", () => {
  it("returns the message of a real Error", () => {
    expect(errorMessage(new Error("network error"), "Failed to load")).toBe("network error");
  });

  it("returns the message of a PostgrestError, which is a plain object and not an Error", () => {
    const postgrestError = {
      message: 'new row violates row-level security policy for table "circles"',
      details: null,
      hint: null,
      code: "42501",
    };

    expect(errorMessage(postgrestError, "Failed to load")).toBe(
      'new row violates row-level security policy for table "circles"'
    );
  });

  it("falls back when the thrown value carries no message at all", () => {
    expect(errorMessage(null, "Failed to load")).toBe("Failed to load");
    expect(errorMessage(undefined, "Failed to load")).toBe("Failed to load");
    expect(errorMessage("just a string", "Failed to load")).toBe("Failed to load");
    expect(errorMessage({ code: "42501" }, "Failed to load")).toBe("Failed to load");
  });

  it("falls back when message is present but not a usable string", () => {
    expect(errorMessage({ message: 42 }, "Failed to load")).toBe("Failed to load");
    expect(errorMessage({ message: "" }, "Failed to load")).toBe("Failed to load");
    expect(errorMessage({ message: "   " }, "Failed to load")).toBe("Failed to load");
    expect(errorMessage(new Error(""), "Failed to load")).toBe("Failed to load");
  });
});
