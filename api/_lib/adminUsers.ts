import { supabaseAdmin } from "./supabaseAdmin.js";

// Issue 15: the three operations the admin dashboard needs — list every
// user across every circle, grant a user real dollar credit, and ban/unban
// an account. Route handlers stay thin orchestration; this is where the
// actual logic lives and is unit tested.

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

const DEFAULT_CAP_USD = 1.0;
// Supabase's ban API takes a duration string, not a boolean — ~100 years is
// effectively indefinite until an admin unbans.
const BAN_DURATION = "876000h";

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, circle_id, role, created_at, display_name");
  if (profilesError) {
    throw profilesError;
  }

  const { data: circles, error: circlesError } = await supabaseAdmin.from("circles").select("id, name");
  if (circlesError) {
    throw circlesError;
  }
  const circleNameById = new Map(
    (circles ?? []).map((circle) => [circle.id as string, circle.name as string | null])
  );

  const { data: accessRows, error: accessError } = await supabaseAdmin
    .from("user_ai_access")
    .select("user_id, free_trial_used, cap_usd, spent_usd");
  if (accessError) {
    throw accessError;
  }
  const accessByUserId = new Map((accessRows ?? []).map((row) => [row.user_id as string, row]));

  const { data: usersPage, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) {
    throw usersError;
  }
  const authUserById = new Map(usersPage.users.map((user) => [user.id, user]));

  return (profiles ?? []).map((profile) => {
    const authUser = authUserById.get(profile.user_id);
    const access = accessByUserId.get(profile.user_id);
    const credit: AdminUserCredit =
      access && access.cap_usd !== null
        ? { mode: "cap", capUsd: access.cap_usd, spentUsd: access.spent_usd }
        : { mode: "trial", trialUsed: access?.free_trial_used ?? false };

    return {
      userId: profile.user_id,
      displayName: profile.display_name ?? profile.user_id,
      email: authUser?.email ?? "(unknown)",
      circleName: circleNameById.get(profile.circle_id) ?? null,
      role: profile.role,
      joinedAt: profile.created_at,
      banned: Boolean(authUser?.banned_until && new Date(authUser.banned_until) > new Date()),
      credit,
    };
  });
}

// Issue 15 decision 4: granting credit is a reset, not a top-up — always
// zeroes spent_usd and marks the free trial as used, graduating the user
// out of trial mode for good.
export async function grantCredit(userId: string, capUsd: number = DEFAULT_CAP_USD): Promise<void> {
  const { error } = await supabaseAdmin.from("user_ai_access").upsert({
    user_id: userId,
    free_trial_used: true,
    cap_usd: capUsd,
    spent_usd: 0,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
}

// Issue 15 decision 5: disable/enable via Supabase Auth's own ban
// mechanism, not an app-level flag.
export async function setUserBanned(userId: string, banned: boolean): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_DURATION : "none",
  });
  if (error) {
    throw error;
  }
}
