import { describe, it, expect, vi } from "vitest";

// Supabase is the external boundary — mock it here (Section 4: a member can
// rename themselves, an owner can remove another member or dissolve the
// circle; all three are already backed by RLS policies on profiles/circles).
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { updateOwnDisplayName, removeMember, dissolveCircle } from "@/lib/circleActions";

const OK = { error: null };
const FAILED = { error: new Error("network error") };

describe("updateOwnDisplayName", () => {
  it("updates the caller's own display name", async () => {
    const db = installFakeSupabase(supabase, { tables: { profiles: OK } });

    await updateOwnDisplayName("user-1", "Eason");

    expect(db.callsFor("profiles")).toContainEqual(["update", { display_name: "Eason" }]);
    expect(db.callsFor("profiles")).toContainEqual(["eq", "user_id", "user-1"]);
  });

  it("throws when the update fails", async () => {
    installFakeSupabase(supabase, { tables: { profiles: FAILED } });

    await expect(updateOwnDisplayName("user-1", "Eason")).rejects.toThrow("network error");
  });
});

describe("removeMember", () => {
  it("deletes the given member's profile", async () => {
    const db = installFakeSupabase(supabase, { tables: { profiles: OK } });

    await removeMember("user-2");

    expect(db.callsFor("profiles")).toContainEqual(["delete"]);
    expect(db.callsFor("profiles")).toContainEqual(["eq", "user_id", "user-2"]);
  });

  it("throws when the delete fails", async () => {
    installFakeSupabase(supabase, { tables: { profiles: FAILED } });

    await expect(removeMember("user-2")).rejects.toThrow("network error");
  });
});

describe("dissolveCircle", () => {
  it("deletes the circle", async () => {
    const db = installFakeSupabase(supabase, { tables: { circles: OK } });

    await dissolveCircle("circle-1");

    expect(db.callsFor("circles")).toContainEqual(["delete"]);
    expect(db.callsFor("circles")).toContainEqual(["eq", "id", "circle-1"]);
  });

  it("throws when the delete fails", async () => {
    installFakeSupabase(supabase, { tables: { circles: FAILED } });

    await expect(dissolveCircle("circle-1")).rejects.toThrow("network error");
  });
});
