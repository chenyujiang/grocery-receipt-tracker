import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Ticket 32: AdminDashboard is code-split behind React.lazy. These check the
// route still renders through App's real routing once RequireGlobalAdmin
// passes, and stays a 404 (no dashboard chunk rendered) when it doesn't.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { supabase } from "@/lib/supabaseClient";
import { installFakeSupabase } from "@/test/fakeSupabase";
import { AuthProvider } from "@/lib/AuthProvider";
import { LanguageProvider } from "@/lib/LanguageProvider";
import { ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";
import App from "@/App";

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

describe("App routing", () => {
  beforeEach(() => {
    // The dashboard's own user-list fetch (/api/admin/users); its content
    // is AdminDashboard.test.tsx's concern, not this file's.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ users: [] }), { status: 200 }))
    );
  });

  it("renders the lazily loaded admin dashboard once RequireGlobalAdmin passes", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: sessionFor("admin-1") },
      tables: { global_admins: { data: { user_id: "admin-1" }, error: null } },
    });

    renderAppAt(ADMIN_DASHBOARD_PATH);

    expect(await screen.findByRole("heading", { name: "Admin — Users" })).toBeInTheDocument();
  });

  it("shows a 404 instead of the admin dashboard for a non-admin", async () => {
    installFakeSupabase(supabase, {
      auth: { getSession: sessionFor("user-1") },
      tables: { global_admins: { data: null, error: null } },
    });

    renderAppAt(ADMIN_DASHBOARD_PATH);

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin — Users" })).not.toBeInTheDocument();
  });
});
