import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here (Section 4: a member can
// rename themselves, an owner can remove another member or dissolve the
// circle; all three are already backed by RLS policies on profiles/circles).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { updateOwnDisplayName, removeMember, dissolveCircle } from "@/lib/circleActions";

function eqChain(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn(() => ({ eq }));
  const del = vi.fn(() => ({ eq }));
  return { update, delete: del, eq };
}

describe("updateOwnDisplayName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the caller's own display name", async () => {
    const chain = eqChain({ error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await updateOwnDisplayName("user-1", "Eason");

    expect(chain.update).toHaveBeenCalledWith({ display_name: "Eason" });
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("throws when the update fails", async () => {
    const chain = eqChain({ error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(updateOwnDisplayName("user-1", "Eason")).rejects.toThrow("network error");
  });
});

describe("removeMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the given member's profile", async () => {
    const chain = eqChain({ error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await removeMember("user-2");

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-2");
  });

  it("throws when the delete fails", async () => {
    const chain = eqChain({ error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(removeMember("user-2")).rejects.toThrow("network error");
  });
});

describe("dissolveCircle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the circle", async () => {
    const chain = eqChain({ error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await dissolveCircle("circle-1");

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", "circle-1");
  });

  it("throws when the delete fails", async () => {
    const chain = eqChain({ error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(dissolveCircle("circle-1")).rejects.toThrow("network error");
  });
});
