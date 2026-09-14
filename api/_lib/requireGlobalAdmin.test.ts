import { describe, it, expect, vi } from "vitest";

// Supabase is the external system boundary — mock it here (issue 15: every
// admin route re-checks global_admins server-side; a non-admin gets 404,
// not 403, so the route's existence isn't revealed).
vi.mock("./supabaseAdmin", () => ({ supabaseAdmin: {} }));

import { supabaseAdmin } from "./supabaseAdmin";
import { installFakeSupabase } from "../../src/test/fakeSupabase.js";
import { requireGlobalAdmin } from "./requireGlobalAdmin";

describe("requireGlobalAdmin", () => {
  it("returns 401 when there is no Authorization header", async () => {
    installFakeSupabase(supabaseAdmin);

    const result = await requireGlobalAdmin(undefined);

    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("returns 401 when the token doesn't resolve to a user", async () => {
    // No tables prepared: a caller we can't identify must not reach a query.
    installFakeSupabase(supabaseAdmin, {
      auth: { getUser: { data: { user: null }, error: new Error("invalid token") } },
    });

    const result = await requireGlobalAdmin("Bearer bad-token");

    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("returns 404 (not 403) when the caller is authenticated but not a global admin", async () => {
    installFakeSupabase(supabaseAdmin, {
      auth: { getUser: { data: { user: { id: "user-1" } }, error: null } },
      tables: { global_admins: { data: null, error: null } },
    });

    const result = await requireGlobalAdmin("Bearer good-token");

    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns ok with the userId when the caller is a global admin", async () => {
    installFakeSupabase(supabaseAdmin, {
      auth: { getUser: { data: { user: { id: "admin-1" } }, error: null } },
      tables: { global_admins: { data: { user_id: "admin-1" }, error: null } },
    });

    const result = await requireGlobalAdmin("Bearer admin-token");

    expect(result).toEqual({ ok: true, userId: "admin-1" });
  });
});
