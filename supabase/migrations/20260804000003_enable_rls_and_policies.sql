-- Dissolving a circle (owner-only, Section 4) should remove its member profiles too.
alter table profiles drop constraint profiles_circle_id_fkey;
alter table profiles add constraint profiles_circle_id_fkey
  foreign key (circle_id) references circles(id) on delete cascade;

-- Helper: current user's circle_id, bypassing RLS to avoid recursive policy checks.
create or replace function public.current_circle_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select circle_id from profiles where user_id = auth.uid()
$$;

alter table circles enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;
alter table edit_logs enable row level security;

-- categories: global fixed reference data, read-only for every signed-in user.
create policy "categories are readable by any authenticated user"
on categories for select to authenticated using (true);

-- circles
create policy "a signed-in user can create a circle"
on circles for insert to authenticated
with check (true);

create policy "members can view their own circle"
on circles for select to authenticated
using (id = current_circle_id());

create policy "owner can update their circle"
on circles for update to authenticated
using (id = (select circle_id from profiles where user_id = auth.uid() and role = 'owner'));

create policy "owner can dissolve their circle"
on circles for delete to authenticated
using (id = (select circle_id from profiles where user_id = auth.uid() and role = 'owner'));

-- profiles
-- NOTE: this only covers "create my own circle" (self-service owner signup).
-- The "join an existing circle via invite link" path (ticket 02) needs the
-- invite-token mechanism the spec explicitly deferred to development — that
-- flow should insert the member's profile via a service-role server function,
-- not through a client-facing RLS policy, so it isn't included here.
create policy "members can view profiles in their own circle"
on profiles for select to authenticated
using (circle_id = current_circle_id());

create policy "a user can become owner of a brand-new, ownerless circle"
on profiles for insert to authenticated
with check (
  user_id = auth.uid()
  and role = 'owner'
  and not exists (select 1 from profiles p where p.circle_id = profiles.circle_id)
);

create policy "owner can remove another member"
on profiles for delete to authenticated
using (
  user_id <> auth.uid()
  and circle_id = (select circle_id from profiles where user_id = auth.uid() and role = 'owner')
);

create policy "a member can leave their own circle"
on profiles for delete to authenticated
using (user_id = auth.uid() and role = 'member');

-- products (Section 5.3 / ticket 05: shared, circle-scoped standardized products — not owned by an uploader)
create policy "members can view their circle's products"
on products for select to authenticated
using (circle_id = current_circle_id());

create policy "members can create products in their circle"
on products for insert to authenticated
with check (circle_id = current_circle_id());

create policy "members can update their circle's products"
on products for update to authenticated
using (circle_id = current_circle_id());

-- receipts (ticket 02: all members can view; only the uploader can edit/delete their own)
create policy "members can view their circle's receipts"
on receipts for select to authenticated
using (circle_id = current_circle_id());

create policy "members can upload receipts to their circle"
on receipts for insert to authenticated
with check (circle_id = current_circle_id() and uploaded_by = auth.uid());

create policy "uploader can update their own receipt"
on receipts for update to authenticated
using (circle_id = current_circle_id() and uploaded_by = auth.uid());

create policy "uploader can delete their own receipt"
on receipts for delete to authenticated
using (circle_id = current_circle_id() and uploaded_by = auth.uid());

-- receipt_items (scoped through the parent receipt)
create policy "members can view items on their circle's receipts"
on receipt_items for select to authenticated
using (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id and r.circle_id = current_circle_id()
));

create policy "uploader can add items to their own receipt"
on receipt_items for insert to authenticated
with check (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id
    and r.circle_id = current_circle_id()
    and r.uploaded_by = auth.uid()
));

create policy "uploader can update items on their own receipt"
on receipt_items for update to authenticated
using (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id
    and r.circle_id = current_circle_id()
    and r.uploaded_by = auth.uid()
));

create policy "uploader can delete items on their own receipt"
on receipt_items for delete to authenticated
using (exists (
  select 1 from receipts r
  where r.id = receipt_items.receipt_id
    and r.circle_id = current_circle_id()
    and r.uploaded_by = auth.uid()
));

-- edit_logs (Section 5.4: append-only audit trail — no update/delete policy, by design)
create policy "members can view edit history for their circle"
on edit_logs for select to authenticated
using (
  exists (select 1 from receipts r where r.id = edit_logs.receipt_id and r.circle_id = current_circle_id())
  or exists (
    select 1 from receipt_items ri
    join receipts r on r.id = ri.receipt_id
    where ri.id = edit_logs.receipt_item_id and r.circle_id = current_circle_id()
  )
);

create policy "a user can log their own edits"
on edit_logs for insert to authenticated
with check (edited_by = auth.uid());
