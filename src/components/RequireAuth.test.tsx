import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { AuthProvider } from "@/lib/AuthProvider";
import RequireAuth from "@/components/RequireAuth";

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
  it("redirects to /auth when there is no session", async () => {
    installFakeSupabase(supabase, { auth: { getSession: { data: { session: null } } } });

    renderProtectedRoute();

    expect(await screen.findByText("Auth page")).toBeInTheDocument();
  });

  it("renders the protected content when a session exists", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: { data: { session: { user: { id: "user-1" }, access_token: "tok-1" } } } },
    });

    renderProtectedRoute();

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });
});
