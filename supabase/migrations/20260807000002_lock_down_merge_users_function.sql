-- The previous migration's "revoke all ... from public" only revoked the
-- implicit PUBLIC-pseudo-role grant. Supabase's default privileges on the
-- public schema separately grant EXECUTE on new functions to anon and
-- authenticated, so both roles could still call this admin-only function
-- directly via PostgREST — bypassing the requireGlobalAdmin check that only
-- lives in the Vercel API route. Revoke explicitly from both.
revoke execute on function public.merge_users_into_new_circle(uuid[]) from anon, authenticated;
