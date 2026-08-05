import { supabase } from "@/lib/supabaseClient";

// Section 4, page 7 (Circle Settings): a member can rename themselves; an
// owner can remove another member or dissolve the whole circle. All three
// are backed by RLS policies — this is a thin wrapper, no extra checks here.

export async function updateOwnDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
  if (error) {
    throw error;
  }
}

export async function dissolveCircle(circleId: string): Promise<void> {
  const { error } = await supabase.from("circles").delete().eq("id", circleId);
  if (error) {
    throw error;
  }
}
