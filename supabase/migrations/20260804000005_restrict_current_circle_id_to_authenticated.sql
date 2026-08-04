-- current_circle_id() only needs to be callable by signed-in users (it's used
-- inside RLS policies for the authenticated role); anon has no legitimate
-- reason to call it directly via /rest/v1/rpc.
revoke execute on function public.current_circle_id() from public;
revoke execute on function public.current_circle_id() from anon;
grant execute on function public.current_circle_id() to authenticated;
