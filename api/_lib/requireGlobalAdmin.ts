import { supabaseAdmin } from "./supabaseAdmin.js";

// Issue 15: shared auth guard for every admin API route. A non-admin gets
// 404, not 403 — the route's existence shouldn't be confirmed to anyone
// probing it (decision 2's "obscurity as a bonus layer" applies to the
// backend too, not just the frontend route).
export type AdminAuthResult = { ok: true; userId: string } | { ok: false; status: 401 | 404 };

export async function requireGlobalAdmin(authHeader: string | undefined): Promise<AdminAuthResult> {
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!accessToken) {
    return { ok: false, status: 401 };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return { ok: false, status: 401 };
  }

  const { data: adminRow } = await supabaseAdmin
    .from("global_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { ok: false, status: 404 };
  }

  return { ok: true, userId: userData.user.id };
}
