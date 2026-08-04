import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/types";

interface SignUpResult {
  userId: string;
  circleId: string;
  role: Role;
}

// Section 4: signing up creates a new circle and makes the signer its owner.
// (Joining an existing circle via invite link is a separate, not-yet-built
// path — see README.md's Supabase section.)
export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !signUpData.user) {
    throw signUpError ?? new Error("Sign-up did not return a user");
  }
  const userId = signUpData.user.id;

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .insert({})
    .select()
    .single();
  if (circleError || !circle) {
    throw circleError ?? new Error("Failed to create circle");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ user_id: userId, circle_id: circle.id, role: "owner" })
    .select()
    .single();
  if (profileError || !profile) {
    throw profileError ?? new Error("Failed to create owner profile");
  }

  return { userId, circleId: circle.id, role: "owner" };
}

interface SignInResult {
  userId: string;
  accessToken: string;
}

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw error ?? new Error("Sign-in did not return a session");
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
