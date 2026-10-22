-- Issue 29: a Store is a real, circle-scoped record carrying its chain and
-- branch, instead of a loose name string on each Receipt.
--
-- chain_key / branch_key are the normalized match keys, computed in app code
-- by storeKey() in src/lib/storeKey.ts (case-folding, whitespace, macrons,
-- street abbreviations, separators, chain aliases such as Countdown ->
-- Woolworths). They are stored rather than generated because that
-- normalization lives in TypeScript; the unique constraint below is what
-- stops one branch ending up as two rows.
--
-- A null branch means "branch unknown" — a normal, permanent state, not an
-- error. It is its own Store row, so it can never be compared against a
-- named branch.
create table stores (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  chain_name_en text not null,
  chain_name_zh text,
  branch_name_en text,
  branch_name_zh text,
  chain_key text not null,
  branch_key text,
  created_at timestamptz not null default now(),
  -- A branch name and its key are present or absent together.
  constraint stores_branch_key_matches_name check ((branch_name_en is null) = (branch_key is null)),
  -- One row per branch per circle; an unknown branch counts as one value.
  constraint stores_circle_chain_branch_key unique nulls not distinct (circle_id, chain_key, branch_key),
  -- Target for receipts' composite foreign key below.
  constraint stores_id_circle_id_key unique (id, circle_id)
);

alter table stores enable row level security;

-- Mirrors the products policies: shared within the circle — except that a
-- Store no receipt points at can be deleted, so a confirm that fails after
-- creating its Store can take it back (ticket 29). A Store with any history
-- can't be.
create policy "members can view their circle's stores"
on stores for select to authenticated
using (circle_id = current_circle_id());

create policy "members can create stores in their circle"
on stores for insert to authenticated
with check (circle_id = current_circle_id());

create policy "members can update their circle's stores"
on stores for update to authenticated
using (circle_id = current_circle_id());

-- The delete policy is created below, once receipts.store_id exists.

-- store_name_en / store_name_zh stay: they keep the raw header text read off
-- this particular receipt, the way receipt_items keeps raw_name_en alongside
-- product_id. store_id is null until the receipt is confirmed (a Store row is
-- created on confirm, not on draft save) or the user picks an existing Store.
alter table receipts add column store_id uuid;

-- Composite rather than plain: a receipt can only point at a Store in its own
-- circle, which RLS alone doesn't guarantee. Deferred so that
-- merge_users_into_new_circle can move receipts and stores between circles in
-- separate statements within one transaction.
alter table receipts
  add constraint receipts_store_id_circle_id_fkey
  foreign key (store_id, circle_id) references stores (id, circle_id)
  deferrable initially deferred;

create index receipts_store_id_idx on receipts(store_id);

-- Only an unused Store can be deleted (see the policies above). Created here
-- rather than with them because it reads receipts.store_id.
create policy "members can delete their circle's unused stores"
on stores for delete to authenticated
using (
  circle_id = current_circle_id()
  and not exists (select 1 from receipts where receipts.store_id = stores.id)
);

-- The chain/branch split the AI read off the header, saved with the draft so
-- the preview screen's store picker can pre-fill "create this as a new
-- branch" when it opens later. Like store_name_*, this is evidence of what
-- was read, not the resolved identity — that's store_id. Null on receipts
-- recognized before this column existed; an empty branch means the header
-- named none.
alter table receipts
  add column recognized_chain_en text,
  add column recognized_chain_zh text,
  add column recognized_branch_en text,
  add column recognized_branch_zh text;

-- A receipt-level change and its EditLog rows, in one transaction. EditLog is
-- append-only (no update/delete policy), so a Store or date change logged in
-- one request and applied in the next could leave a row for a change that
-- then failed — and a retry would log it again. Here either both happen or
-- neither does. A null argument leaves that column as it is. Security
-- invoker, so the caller's own RLS applies: only the uploader can update the
-- receipt, and every row is logged as auth.uid()'s edit. Returns the
-- receipt's purchase date, which confirm's price-spike check needs.
create or replace function public.update_receipt_with_log(
  p_receipt_id uuid,
  p_status text,
  p_store_id uuid,
  p_purchase_date date,
  p_logs jsonb
)
returns date
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase_date date;
begin
  insert into edit_logs (receipt_id, field_name, old_value, new_value, edited_by)
  select p_receipt_id, entry.value->>'field_name', entry.value->>'old_value', entry.value->>'new_value', auth.uid()
  from jsonb_array_elements(coalesce(p_logs, '[]'::jsonb)) as entry(value);

  update receipts
  set status = coalesce(p_status, status),
      store_id = coalesce(p_store_id, store_id),
      purchase_date = coalesce(p_purchase_date, purchase_date)
  where id = p_receipt_id
  returning purchase_date into v_purchase_date;
  -- RLS hides a receipt the caller can't update, which would otherwise
  -- commit the log rows alone. The message is shown to the user as is, so
  -- it leaves out the receipt's id.
  if not found then
    raise exception 'Receipt not found, or not yours to change'
      using errcode = 'P0002';
  end if;

  return v_purchase_date;
end;
$$;

revoke all on function public.update_receipt_with_log(uuid, text, uuid, date, jsonb) from public;
revoke execute on function public.update_receipt_with_log(uuid, text, uuid, date, jsonb) from anon;
grant execute on function public.update_receipt_with_log(uuid, text, uuid, date, jsonb) to authenticated;

-- merge_users_into_new_circle now carries stores along with products,
-- receipts and alerts. Two standalone households may well have shopped at the
-- same branch, which would collide on stores_circle_chain_branch_key once both
-- rows land in the new circle — so first collapse each duplicate onto its
-- oldest row and repoint that row's receipts, then move what's left.
create or replace function public.merge_users_into_new_circle(p_user_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_circle_id uuid;
  v_old_circle_ids uuid[];
  v_first_user uuid;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) < 2 then
    raise exception 'merge_users_into_new_circle requires at least 2 users';
  end if;

  select array_agg(distinct circle_id) into v_old_circle_ids
  from profiles
  where user_id = any(p_user_ids);

  if v_old_circle_ids is null or array_length(v_old_circle_ids, 1) is null then
    raise exception 'none of the given users have a profile';
  end if;

  if exists (
    select 1
    from profiles
    where circle_id = any(v_old_circle_ids)
    group by circle_id
    having count(*) > 1
  ) then
    raise exception 'one or more selected users belong to a circle with other members — merge only supports combining standalone (single-member) circles';
  end if;

  insert into circles (name) values (null) returning id into v_new_circle_id;

  -- Repoint receipts at the oldest Store for each (chain_key, branch_key)
  -- across the merging circles. PARTITION BY treats a null branch_key as one
  -- value, matching the unique constraint's NULLS NOT DISTINCT.
  with ranked as (
    select
      id,
      first_value(id) over (
        partition by chain_key, branch_key
        order by created_at, id
      ) as keep_id
    from stores
    where circle_id = any(v_old_circle_ids)
  )
  update receipts r
  set store_id = ranked.keep_id
  from ranked
  where r.store_id = ranked.id
    and ranked.id <> ranked.keep_id;

  delete from stores s
  where s.circle_id = any(v_old_circle_ids)
    and exists (
      select 1
      from stores k
      where k.circle_id = any(v_old_circle_ids)
        and k.chain_key = s.chain_key
        and k.branch_key is not distinct from s.branch_key
        and (k.created_at, k.id) < (s.created_at, s.id)
    );

  update stores set circle_id = v_new_circle_id where circle_id = any(v_old_circle_ids);
  update products set circle_id = v_new_circle_id where circle_id = any(v_old_circle_ids);
  update receipts set circle_id = v_new_circle_id where circle_id = any(v_old_circle_ids);
  update alerts set circle_id = v_new_circle_id where circle_id = any(v_old_circle_ids);

  v_first_user := p_user_ids[1];

  update profiles
  set circle_id = v_new_circle_id,
      role = case when user_id = v_first_user then 'owner' else 'member' end
  where user_id = any(p_user_ids);

  -- Old circles are now empty (every profile that pointed to them was just
  -- moved) — clean them up. The existence check guards the edge case where
  -- p_user_ids didn't actually cover every member of an old circle.
  delete from circles c
  where c.id = any(v_old_circle_ids)
    and not exists (select 1 from profiles p where p.circle_id = c.id);

  return v_new_circle_id;
end;
$$;

-- create or replace keeps existing grants, but restate the lockdown from
-- 20260807000002 so this function's permissions are readable in one place.
revoke all on function public.merge_users_into_new_circle(uuid[]) from public;
revoke execute on function public.merge_users_into_new_circle(uuid[]) from anon, authenticated;
grant execute on function public.merge_users_into_new_circle(uuid[]) to service_role;
