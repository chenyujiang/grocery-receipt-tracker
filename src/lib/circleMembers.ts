import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/types";

export interface CircleMember {
  userId: string;
  displayName: string;
  role: Role;
  circleId: string;
}

// Section 15, page 3/7: the receipt list's uploader filter and Circle
// Settings' member list both read the circle's members — RLS already scopes
// this to the caller's circle.
export async function fetchCircleMembers(): Promise<CircleMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, role, circle_id")
    .order("display_name");
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    role: Role;
    circle_id: string;
  }>;
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name ?? row.user_id,
    role: row.role,
    circleId: row.circle_id,
  }));
}
