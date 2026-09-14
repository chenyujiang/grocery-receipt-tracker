import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Issue 15 decision 2: a non-admin (or logged-out visitor) hitting this
// route sees a plain 404, not a login redirect — the route's existence
// isn't confirmed either way.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { AuthProvider } from "@/lib/AuthProvider";
import RequireGlobalAdmin from "@/components/RequireGlobalAdmin";

/** A signed-in session for `userId`, in the shape AuthProvider reads. */
function sessionFor(userId: string) {
  return { data: { session: { user: { id: userId }, access_token: "tok-1" } } };
}

function renderGuardedRoute() {
  return render(
    <MemoryRouter initialEntries={["/ops-portal-x7f2k9"]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/ops-portal-x7f2k9"
            element={
              <RequireGlobalAdmin>
                <p>Admin content</p>
              </RequireGlobalAdmin>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("RequireGlobalAdmin", () => {
  it("shows a 404 (not a login redirect) when there is no session", async () => {
    // No `global_admins` prepared: with no session there is nobody to check,
    // so querying it at all would throw.
    installFakeSupabase(supabase, { auth: { getSession: { data: { session: null } } } });

    renderGuardedRoute();

    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("shows a 404 when the signed-in user is not a global admin", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: sessionFor("user-1") },
      tables: { global_admins: { data: null, error: null } },
    });

    renderGuardedRoute();

    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("renders the admin content when the signed-in user is a global admin", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: sessionFor("admin-1") },
      tables: { global_admins: { data: { user_id: "admin-1" }, error: null } },
    });

    renderGuardedRoute();

    expect(await screen.findByText("Admin content")).toBeInTheDocument();
  });
});
