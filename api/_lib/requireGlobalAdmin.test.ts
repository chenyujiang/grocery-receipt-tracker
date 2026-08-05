import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is the external system boundary — mock it here (issue 15: every
// admin route re-checks global_admins server-side; a non-admin gets 404,
// not 403, so the route's existence isn't revealed).
vi.mock("./supabaseAdmin", () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "./supabaseAdmin";
import { requireGlobalAdmin } from "./requireGlobalAdmin";

function globalAdminsChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select };
}

describe("requireGlobalAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no Authorization header", async () => {
    const result = await requireGlobalAdmin(undefined);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("returns 401 when the token doesn't resolve to a user", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: new Error("invalid token"),
    } as never);

    const result = await requireGlobalAdmin("Bearer bad-token");

    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("returns 404 (not 403) when the caller is authenticated but not a global admin", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    } as never);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      globalAdminsChain({ data: null, error: null }) as never
    );

    const result = await requireGlobalAdmin("Bearer good-token");

    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns ok with the userId when the caller is a global admin", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    } as never);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      globalAdminsChain({ data: { user_id: "admin-1" }, error: null }) as never
    );

    const result = await requireGlobalAdmin("Bearer admin-token");

    expect(result).toEqual({ ok: true, userId: "admin-1" });
  });
});
