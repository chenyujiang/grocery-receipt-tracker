import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}));

import { supabase } from "@/lib/supabaseClient";
import { AuthProvider } from "@/lib/AuthProvider";
import RequireAuth from "@/components/RequireAuth";

function unsubscribableChange() {
  return { data: { subscription: { unsubscribe: vi.fn() } } } as never;
}

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<p>Auth page</p>} />
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <p>Protected content</p>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth when there is no session", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());

    renderProtectedRoute();

    expect(await screen.findByText("Auth page")).toBeInTheDocument();
  });

  it("renders the protected content when a session exists", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "user-1" }, access_token: "tok-1" } },
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue(unsubscribableChange());

    renderProtectedRoute();

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });
});
