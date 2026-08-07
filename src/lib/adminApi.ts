import { supabase } from "@/lib/supabaseClient";

// Issue 15 decision 2: a non-obvious, unguessable path — not a substitute
// for the real is-admin check (isGlobalAdmin/RequireGlobalAdmin), just an
// extra layer so the route isn't discoverable by guessing.
export const ADMIN_DASHBOARD_PATH = "/ops-portal-x7f2k9";

// Issue 15 decision 2: checked directly against Supabase (RLS lets a user
// read only their own global_admins row) rather than through the backend,
// since this drives client-side routing (the post-login redirect, the
// route guard) and doesn't touch anything privileged by itself.
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("global_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data !== null;
}

// Issue 15: the admin dashboard's calls to the backend's admin-only routes.
export type AdminUserCredit =
  | { mode: "trial"; trialUsed: boolean }
  | { mode: "cap"; capUsd: number; spentUsd: number };

export interface AdminUserRow {
  userId: string;
  displayName: string;
  email: string;
  circleName: string | null;
  role: string;
  joinedAt: string;
  banned: boolean;
  credit: AdminUserCredit;
}

async function authorizedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error || !sessionData.session) {
    throw error ?? new Error("Not signed in");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }

  return response;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const response = await authorizedFetch("/api/admin/users");
  const body = (await response.json()) as { users: AdminUserRow[] };
  return body.users;
}

// Issue 15 decision 4: always a reset to a fresh allowance — omit capUsd for
// the one-click "Grant $1" action, or pass a custom amount.
export async function grantAdminCredit(userId: string, capUsd?: number): Promise<void> {
  await authorizedFetch(`/api/admin/users/${userId}/grant-credit`, {
    method: "POST",
    body: JSON.stringify(capUsd !== undefined ? { capUsd } : {}),
  });
}

export async function setAdminUserBanned(userId: string, banned: boolean): Promise<void> {
  await authorizedFetch(`/api/admin/users/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({ banned }),
  });
}

// No invite-link flow exists, so this is how an admin puts several
// standalone-circle users into one shared circle: pick users, merge into a
// brand-new circle.
export async function mergeUsersIntoCircle(userIds: string[]): Promise<string> {
  const response = await authorizedFetch("/api/admin/circles/merge", {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
  const body = (await response.json()) as { circleId: string };
  return body.circleId;
}
