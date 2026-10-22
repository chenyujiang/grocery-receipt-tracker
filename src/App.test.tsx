import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Issue 32: App's admin route. AdminDashboard is lazy-loaded behind
// RequireGlobalAdmin, so the dashboard only appears once the guard passes and
// the Suspense boundary resolves its chunk — hence findBy*, not getBy*.
// Chunk splitting itself is verified by `npm run build` output, not here.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { AuthProvider } from "@/lib/AuthProvider";
import { LanguageProvider } from "@/lib/LanguageProvider";
import { ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";
import App from "@/App";

/** A signed-in session for `userId`, in the shape AuthProvider reads. */
function sessionFor(userId: string) {
  return { data: { session: { user: { id: userId }, access_token: "tok-1" } } };
}

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App admin route", () => {
  it("shows the admin dashboard to a global admin", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: sessionFor("admin-1") },
      tables: { global_admins: { data: { user_id: "admin-1" }, error: null } },
    });
    // The dashboard's own user list load (GET /api/admin/users).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ users: [] }), { status: 200 }))
    );

    renderAppAt(ADMIN_DASHBOARD_PATH);

    expect(await screen.findByRole("heading", { name: "Admin — Users" })).toBeInTheDocument();
  });

  it("shows a 404 to a signed-in user who is not a global admin", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: sessionFor("user-1") },
      tables: { global_admins: { data: null, error: null } },
    });

    renderAppAt(ADMIN_DASHBOARD_PATH);

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin — Users" })).not.toBeInTheDocument();
  });
});
