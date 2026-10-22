import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FakeSupabaseOptions } from "@/test/fakeSupabase";
import { ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";

// Ticket 32: AdminDashboard is code-split behind React.lazy. These check the
// route still renders through App's real routing once RequireGlobalAdmin
// passes, and stays a 404 — without the dashboard's module ever loading —
// when it doesn't.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

// Called whenever AdminDashboard's module is imported; the real module is
// still returned, so the admin test renders the actual dashboard. "Never
// called" means the dashboard's chunk was never requested.
const loadDashboard = vi.fn();

// Each render imports App into a fresh module graph and re-registers the
// dashboard mock with vi.doMock (a hoisted vi.mock's result outlives
// vi.resetModules, so its factory would fire only once per file). That way a
// regression back to a static `import AdminDashboard` fires the factory at
// import time and fails the non-admin test, instead of hiding behind a module
// cached by an earlier test or a lazy() promise React already resolved.
async function renderAppAt(path: string, fake: FakeSupabaseOptions) {
  vi.resetModules();
  loadDashboard.mockClear();
  vi.doMock("@/pages/AdminDashboard", (importOriginal) => {
    loadDashboard();
    return importOriginal();
  });

  const { MemoryRouter } = await import("react-router-dom");
  const { supabase } = await import("@/lib/supabaseClient");
  const { installFakeSupabase } = await import("@/test/fakeSupabase");
  installFakeSupabase(supabase, fake);
  const { AuthProvider } = await import("@/lib/AuthProvider");
  const { LanguageProvider } = await import("@/lib/LanguageProvider");
  const { default: App } = await import("@/App");

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

function sessionFor(userId: string) {
  return { data: { session: { user: { id: userId }, access_token: "tok-1" } } };
}

// Transform App's whole import graph (dashboard included) once up front:
// transforms survive vi.resetModules, so each test's own import() stays
// inside its timeout.
beforeAll(async () => {
  await import("@/App");
  await import("@/pages/AdminDashboard");
}, 30_000);

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
    await renderAppAt(ADMIN_DASHBOARD_PATH, {
      auth: { getSession: sessionFor("admin-1") },
      tables: { global_admins: { data: { user_id: "admin-1" }, error: null } },
    });

    expect(await screen.findByRole("heading", { name: "Admin — Users" })).toBeInTheDocument();
    expect(loadDashboard).toHaveBeenCalled();
  });

  it("shows a 404 instead of the admin dashboard for a non-admin, without ever loading it", async () => {
    await renderAppAt(ADMIN_DASHBOARD_PATH, {
      auth: { getSession: sessionFor("user-1") },
      tables: { global_admins: { data: null, error: null } },
    });

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin — Users" })).not.toBeInTheDocument();
    expect(loadDashboard).not.toHaveBeenCalled();
  });
});
