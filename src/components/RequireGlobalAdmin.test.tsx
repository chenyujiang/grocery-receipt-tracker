import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Issue 15 decision 2: a non-admin (or logged-out visitor) hitting this
// route sees a plain 404, not a login redirect — the route's existence
// isn't confirmed either way.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { AuthProvider } from "@/lib/AuthProvider";
import RequireGlobalAdmin from "@/components/RequireGlobalAdmin";

function unsubscribableChange() {
  return { data: { subscription: { unsubscribe: vi.fn() } } } as never;
}

function globalAdminsChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select };
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a 404 (not a login redirect) when there is no session", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());

    renderGuardedRoute();

    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("shows a 404 when the signed-in user is not a global admin", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "user-1" }, access_token: "tok-1" } },
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());
    vi.mocked(supabase.from).mockReturnValue(globalAdminsChain({ data: null, error: null }) as never);

    renderGuardedRoute();

    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("renders the admin content when the signed-in user is a global admin", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "admin-1" }, access_token: "tok-1" } },
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());
    vi.mocked(supabase.from).mockReturnValue(
      globalAdminsChain({ data: { user_id: "admin-1" }, error: null }) as never
    );

    renderGuardedRoute();

    expect(await screen.findByText("Admin content")).toBeInTheDocument();
  });
});
