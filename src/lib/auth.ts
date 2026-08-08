import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/types";

interface SignUpResult {
  userId: string;
  circleId: string;
  role: Role;
}

// Section 4: no display-name field is collected at sign-up, so default to
// the email's local part — a circle owner can rename members later from
// Circle Settings.
function deriveDisplayName(email: string): string {
  return email.split("@")[0];
}

// Section 4: signing up creates a new circle and makes the signer its owner.
// (Joining an existing circle via invite link is a separate, not-yet-built
// path — see README.md's Supabase section.)
//
// Bug fix: the circle/profile inserts below must NOT chain .select() (i.e.
// must not do INSERT ... RETURNING). `circles`' own SELECT policy is
// `id = current_circle_id()`, which resolves via the user's `profiles` row —
// a row that doesn't exist yet for a brand-new signer. PostgREST's default
// insert behavior asks for the row back, so the RETURNING clause hits that
// same-not-yet-satisfiable SELECT policy and the whole INSERT statement is
// rejected as an RLS violation (100% reproducible, not actually a timing
// race — confirmed directly against Postgres, bypassing the client
// entirely). Generating the id client-side and skipping .select() avoids
// needing the row back at all.
export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !signUpData.user) {
    throw signUpError ?? new Error("Sign-up did not return a user");
  }
  const userId = signUpData.user.id;
  const circleId = crypto.randomUUID();

  const { error: circleError } = await supabase.from("circles").insert({ id: circleId });
  if (circleError) {
    throw circleError;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: userId,
    circle_id: circleId,
    role: "owner",
    display_name: deriveDisplayName(email),
  });
  if (profileError) {
    throw profileError;
  }

  return { userId, circleId, role: "owner" };
}

interface SignInResult {
  userId: string;
  accessToken: string;
}

// Signing up creates the circle/profile in the same call (see signUpWithEmail
// above), but that only works if Supabase already issued a session at that
// point. With email confirmation turned on, signUp returns no session until
// the user clicks the confirmation link — so the circle/profile insert never
// happens, and the user ends up with a confirmed login but no profile. This
// repairs that gap on sign-in instead of requiring email confirmation to be
// disabled.
async function ensureProfile(userId: string, email: string): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) {
    throw lookupError;
  }
  if (existing) {
    return;
  }

  const circleId = crypto.randomUUID();
  const { error: circleError } = await supabase.from("circles").insert({ id: circleId });
  if (circleError) {
    throw circleError;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: userId,
    circle_id: circleId,
    role: "owner",
    display_name: deriveDisplayName(email),
  });
  if (profileError) {
    throw profileError;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw error ?? new Error("Sign-in did not return a session");
  }
  await ensureProfile(data.user.id, email);
  return { userId: data.user.id, accessToken: data.session.access_token };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
