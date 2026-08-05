import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external boundary — mock it here (Section 15, page 3/7:
// the uploader filter on the receipt list, and later Circle Settings' member
// list, both read the circle's members; RLS already scopes to the caller's
// circle).
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { fetchCircleMembers } from "@/lib/circleMembers";

function selectOrderChain(result: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ order }));
  return { select, order };
}

describe("fetchCircleMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads circle members ordered by display name, falling back to the user id if unset", async () => {
    const chain = selectOrderChain({
      data: [
        { user_id: "user-1", display_name: "eason", role: "owner", circle_id: "circle-1" },
        { user_id: "user-2", display_name: null, role: "member", circle_id: "circle-1" },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const members = await fetchCircleMembers();

    expect(chain.order).toHaveBeenCalledWith("display_name");
    expect(members).toEqual([
      { userId: "user-1", displayName: "eason", role: "owner", circleId: "circle-1" },
      { userId: "user-2", displayName: "user-2", role: "member", circleId: "circle-1" },
    ]);
  });

  it("throws when the query fails", async () => {
    const chain = selectOrderChain({ data: null, error: new Error("network error") });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await expect(fetchCircleMembers()).rejects.toThrow("network error");
  });
});
