import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (Section 4: sign-up creates a circle and makes
// the new user its owner).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { signUpWithEmail, signInWithEmail, signOut } from "@/lib/auth";

// The circle/profile inserts deliberately don't chain .select() (see auth.ts's
// comment — RETURNING would hit a not-yet-satisfiable RLS SELECT policy for a
// brand-new user), so an insert only needs to resolve {error}.
const INSERTED = { error: null };

/** Enough dashes to satisfy crypto.randomUUID's template-literal return type. */
function stubCircleId(id: `${string}-${string}-${string}-${string}-${string}`) {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
  return id;
}

/** The methods a table saw, for asserting that a write did *not* happen. */
function methodsUsed(calls: Array<[string, ...unknown[]]>) {
  return calls.map(([method]) => method);
}

describe("signUpWithEmail", () => {
  it("creates a new circle and makes the signed-up user its owner", async () => {
    const circleId = stubCircleId("circle-0000-0000-0000-000000000001");
    const db = installFakeSupabase(supabase, {
      auth: { signUp: { data: { user: { id: "user-1" }, session: null }, error: null } },
      tables: { circles: INSERTED, profiles: INSERTED },
    });

    const result = await signUpWithEmail("new@example.com", "hunter2pass", "New User");

    expect(db.callsFor("circles")).toContainEqual(["insert", { id: circleId }]);
    expect(db.callsFor("profiles")).toContainEqual([
      "insert",
      {
        user_id: "user-1",
        circle_id: circleId,
        role: "owner",
        display_name: "New User",
      },
    ]);
    expect(result).toEqual({ userId: "user-1", circleId, role: "owner" });
  });

  it("falls back to the email's local part when no display name is given", async () => {
    stubCircleId("circle-0000-0000-0000-000000000001");
    const db = installFakeSupabase(supabase, {
      auth: { signUp: { data: { user: { id: "user-1" }, session: null }, error: null } },
      tables: { circles: INSERTED, profiles: INSERTED },
    });

    await signUpWithEmail("new@example.com", "hunter2pass", "   ");

    expect(db.callsFor("profiles")).toContainEqual([
      "insert",
      expect.objectContaining({ display_name: "new" }),
    ]);
  });

  it("rejects when Supabase auth sign-up itself fails (e.g. email already registered)", async () => {
    // No tables prepared: a sign-up that failed must not go on to write.
    installFakeSupabase(supabase, {
      auth: {
        signUp: {
          data: { user: null, session: null },
          error: new Error("User already registered"),
        },
      },
    });

    await expect(signUpWithEmail("taken@example.com", "hunter2pass")).rejects.toThrow(
      "User already registered"
    );
  });
});

describe("signInWithEmail", () => {
  it("returns the session for valid credentials", async () => {
    installFakeSupabase(supabase, {
      auth: {
        signInWithPassword: {
          data: { user: { id: "user-1" }, session: { access_token: "tok-1" } },
          error: null,
        },
      },
      tables: { profiles: { data: { user_id: "user-1" }, error: null } },
    });

    const result = await signInWithEmail("returning@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-1", accessToken: "tok-1" });
  });

  it("rejects with the server's message for wrong credentials", async () => {
    installFakeSupabase(supabase, {
      auth: {
        signInWithPassword: {
          data: { user: null, session: null },
          error: new Error("Invalid login credentials"),
        },
      },
    });

    await expect(signInWithEmail("returning@example.com", "wrongpass")).rejects.toThrow(
      "Invalid login credentials"
    );
  });

  it("creates a circle and an owner profile if the signed-in user doesn't have one yet", async () => {
    const circleId = stubCircleId("circle-0000-0000-0000-000000000009");
    const db = installFakeSupabase(supabase, {
      auth: {
        signInWithPassword: {
          data: { user: { id: "user-2" }, session: { access_token: "tok-2" } },
          error: null,
        },
      },
      // `profiles` is read before it is written: the lookup finds nothing,
      // then the new owner row is inserted.
      tables: { profiles: [{ data: null, error: null }, INSERTED], circles: INSERTED },
    });

    const result = await signInWithEmail("confirmed-late@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-2", accessToken: "tok-2" });
    expect(db.callsFor("circles")).toContainEqual(["insert", { id: circleId }]);
    expect(db.callsFor("profiles")).toContainEqual([
      "insert",
      {
        user_id: "user-2",
        circle_id: circleId,
        role: "owner",
        display_name: "confirmed-late",
      },
    ]);
  });

  it("does not create a new circle if the signed-in user already has a profile", async () => {
    // `circles` is deliberately left unprepared: touching it at all would
    // throw rather than pass quietly.
    const db = installFakeSupabase(supabase, {
      auth: {
        signInWithPassword: {
          data: { user: { id: "user-3" }, session: { access_token: "tok-3" } },
          error: null,
        },
      },
      tables: { profiles: [{ data: { user_id: "user-3" }, error: null }] },
    });

    const result = await signInWithEmail("already-set-up@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-3", accessToken: "tok-3" });
    expect(db.callsFor("circles")).toEqual([]);
    expect(methodsUsed(db.callsFor("profiles"))).not.toContain("insert");
  });
});

describe("signOut", () => {
  it("resolves when Supabase ends the session successfully", async () => {
    installFakeSupabase(supabase, { auth: { signOut: { error: null } } });

    await expect(signOut()).resolves.toBeUndefined();
  });

  it("rejects with the server's message if ending the session fails", async () => {
    installFakeSupabase(supabase, { auth: { signOut: { error: new Error("Network error") } } });

    await expect(signOut()).rejects.toThrow("Network error");
  });
});
