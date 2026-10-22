import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { sessionFor, type FakeSupabaseOptions } from "@/test/fakeSupabase";
import { ADMIN_DASHBOARD_PATH } from "@/lib/adminApi";

type FakeInstaller = (options: FakeSupabaseOptions) => void;

// Issue 32: App's admin route. AdminDashboard is lazy-loaded behind
// RequireGlobalAdmin, so the dashboard only appears once the guard passes and
// the Suspense boundary resolves its chunk — hence findBy*, not getBy*.
// Chunk splitting itself is verified by `npm run build` output, not here.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

// A marker stands in for the real dashboard, so this test owns only the
// routing: what the dashboard fetches or renders is AdminDashboard.test.tsx's
// job. The factory runs only when the module is imported, so "never called"
// means the dashboard's chunk was never requested.
const loadDashboard = vi.fn();

// Each render imports App into a fresh module graph and re-registers the
// dashboard mock with vi.doMock (a hoisted vi.mock's result outlives
// vi.resetModules, so its factory would fire only once per file). That way a
// regression back to a static `import AdminDashboard` fires the factory at
// import time and fails the non-admin test, instead of hiding behind a module
// cached by an earlier test or a lazy() promise React already resolved.
async function renderAppAt(path: string, prepare: (installFake: FakeInstaller) => void) {
  vi.resetModules();
  loadDashboard.mockClear();
  vi.doMock("@/pages/AdminDashboard", () => {
    loadDashboard();
    return { default: () => <p>Admin dashboard marker</p> };
  });

  const { MemoryRouter } = await import("react-router-dom");
  const { supabase } = await import("@/lib/supabaseClient");
  const { installFakeSupabase } = await import("@/test/fakeSupabase");
  prepare((options) => installFakeSupabase(supabase, options));
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

// Transform App's whole import graph once up front: transforms survive
// vi.resetModules, so each test's own import() stays inside its timeout.
beforeAll(async () => {
  await import("@/App");
}, 30_000);

describe("App admin route", () => {
  it("shows the admin dashboard to a global admin", async () => {
    await renderAppAt(ADMIN_DASHBOARD_PATH, (installFake) =>
      installFake({
        auth: { getSession: sessionFor("admin-1") },
        tables: { global_admins: { data: { user_id: "admin-1" }, error: null } },
      })
    );

    expect(await screen.findByText("Admin dashboard marker")).toBeInTheDocument();
  });

  it("shows a 404 to a non-admin without ever loading the dashboard", async () => {
    await renderAppAt(ADMIN_DASHBOARD_PATH, (installFake) =>
      installFake({
        auth: { getSession: sessionFor("user-1") },
        tables: { global_admins: { data: null, error: null } },
      })
    );

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(loadDashboard).not.toHaveBeenCalled();
  });
});
