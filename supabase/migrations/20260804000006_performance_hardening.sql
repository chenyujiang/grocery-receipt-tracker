-- Wrap auth.uid() as (select auth.uid()) so Postgres evaluates it once per
-- statement instead of once per row (Supabase RLS performance guidance),
-- and collapse the two profiles DELETE policies into one to avoid evaluating
-- both permissive policies per row.

drop policy "owner can update their circle" on circles;
create policy "owner can update their circle"
on circles for update to authenticated
using (id = (select circle_id from profiles where user_id = (select auth.uid()) and role = 'owner'));

drop policy "owner can dissolve their circle" on circles;
create policy "owner can dissolve their circle"
on circles for delete to authenticated
using (id = (select circle_id from profiles where user_id = (select auth.uid()) and role = 'owner'));

drop policy "a user can become owner of a brand-new, ownerless circle" on profiles;
create policy "a user can become owner of a brand-new, ownerless circle"
on profiles for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and not exists (select 1 from profiles p where p.circle_id = profiles.circle_id)
);

drop policy "owner can remove another member" on profiles;
drop policy "a member can leave their own circle" on profiles;
create policy "leave or be removed from a circle"
on profiles for delete to authenticated
using (
  ((select auth.uid()) = user_id and role = 'member')
  or (
    user_id <> (select auth.uid())
    and circle_id = (select circle_id from profiles where user_id = (select auth.uid()) and role = 'owner')
  )
);

drop policy "members can upload receipts to their circle" on receipts;
create policy "members can upload receipts to their circle"
on receipts for insert to authenticated
with check (circle_id = current_circle_id() and uploaded_by = (select auth.uid()));

drop policy "uploader can update their own receipt" on receipts;
create policy "uploader can update their own receipt"
on receipts for update to authenticated
using (circle_id = current_circle_id() and uploaded_by = (select auth.uid()));

drop policy "uploader can delete their own receipt" on receipts;
create policy "uploader can delete their own receipt"
on receipts for delete to authenticated
using (circle_id = current_circle_id() and uploaded_by = (select auth.uid()));

drop policy "uploader can add items to their own receipt" on receipt_items;
create policy "uploader can add items to their own receipt"
on receipt_items for insert to authenticated
with check (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id
    and r.circle_id = current_circle_id()
    and r.uploaded_by = (select auth.uid())
));

drop policy "uploader can update items on their own receipt" on receipt_items;
create policy "uploader can update items on their own receipt"
on receipt_items for update to authenticated
using (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id
    and r.circle_id = current_circle_id()
    and r.uploaded_by = (select auth.uid())
));

drop policy "uploader can delete items on their own receipt" on receipt_items;
create policy "uploader can delete items on their own receipt"
on receipt_items for delete to authenticated
using (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id
    and r.circle_id = current_circle_id()
    and r.uploaded_by = (select auth.uid())
));

drop policy "a user can log their own edits" on edit_logs;
create policy "a user can log their own edits"
on edit_logs for insert to authenticated
with check (edited_by = (select auth.uid()));

-- Unindexed foreign keys flagged by the performance advisor.
create index edit_logs_edited_by_idx on edit_logs(edited_by);
create index products_category_idx on products(category);
