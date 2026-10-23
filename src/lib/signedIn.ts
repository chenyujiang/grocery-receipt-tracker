import { supabase } from "@/lib/supabaseClient";
import { UnexplainedError } from "@/lib/errorMessage";

// The signed-in user's access token, for a fetch to one of our own /api
// routes. Not signed in is an UnexplainedError, so the caller's translated
// fallback shows rather than "Not signed in" in English.
export async function signedInAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw error ?? new UnexplainedError("Not signed in");
  }
  return data.session.access_token;
}

// The signed-in user's id, checked with the auth server (getUser) rather than
// read from the local session, for a write that records who made it.
export async function signedInUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw error ?? new UnexplainedError("Not signed in");
  }
  return data.user.id;
}
