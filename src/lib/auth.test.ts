import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external system boundary — mock it here, not the
// behavior we're testing (Section 4: sign-up creates a circle and makes
// the new user its owner).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { signUpWithEmail, signInWithEmail, signOut } from "@/lib/auth";

function insertChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert };
}

function profilesLookupChain(existing: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(existing);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  return { select, insert };
}

describe("signUpWithEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new circle and makes the signed-up user its owner", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    } as never);

    const circlesChain = insertChain({ data: { id: "circle-1" }, error: null });
    const profilesChain = insertChain({
      data: { user_id: "user-1", circle_id: "circle-1", role: "owner" },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "circles") return circlesChain as never;
      if (table === "profiles") return profilesChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await signUpWithEmail("new@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-1", circleId: "circle-1", role: "owner" });
  });

  it("rejects when Supabase auth sign-up itself fails (e.g. email already registered)", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("User already registered"),
    } as never);

    await expect(signUpWithEmail("taken@example.com", "hunter2pass")).rejects.toThrow(
      "User already registered"
    );
  });
});

describe("signInWithEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session for valid credentials", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "tok-1" } },
      error: null,
    } as never);
    vi.mocked(supabase.from).mockImplementation(
      () => profilesLookupChain({ data: { user_id: "user-1" }, error: null }) as never
    );

    const result = await signInWithEmail("returning@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-1", accessToken: "tok-1" });
  });

  it("rejects with the server's message for wrong credentials", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("Invalid login credentials"),
    } as never);

    await expect(signInWithEmail("returning@example.com", "wrongpass")).rejects.toThrow(
      "Invalid login credentials"
    );
  });

  it("creates a circle and an owner profile if the signed-in user doesn't have one yet", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: "user-2" }, session: { access_token: "tok-2" } },
      error: null,
    } as never);

    const profilesChain = profilesLookupChain({ data: null, error: null });
    const circlesChain = insertChain({ data: { id: "circle-9" }, error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain as never;
      if (table === "circles") return circlesChain as never;
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await signInWithEmail("confirmed-late@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-2", accessToken: "tok-2" });
    expect(circlesChain.insert).toHaveBeenCalled();
    expect(profilesChain.insert).toHaveBeenCalledWith({
      user_id: "user-2",
      circle_id: "circle-9",
      role: "owner",
    });
  });

  it("does not create a new circle if the signed-in user already has a profile", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: "user-3" }, session: { access_token: "tok-3" } },
      error: null,
    } as never);

    const profilesChain = profilesLookupChain({
      data: { user_id: "user-3" },
      error: null,
    });
    const circlesInsert = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain as never;
      if (table === "circles") return { insert: circlesInsert } as never;
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await signInWithEmail("already-set-up@example.com", "hunter2pass");

    expect(result).toEqual({ userId: "user-3", accessToken: "tok-3" });
    expect(circlesInsert).not.toHaveBeenCalled();
    expect(profilesChain.insert).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when Supabase ends the session successfully", async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never);

    await expect(signOut()).resolves.toBeUndefined();
  });

  it("rejects with the server's message if ending the session fails", async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({
      error: new Error("Network error"),
    } as never);

    await expect(signOut()).rejects.toThrow("Network error");
  });
});
