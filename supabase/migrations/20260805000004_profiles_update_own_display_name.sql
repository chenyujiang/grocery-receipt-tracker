create policy "a user can update their own display name"
on profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
