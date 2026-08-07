-- Bug fix (code review): merge_users_into_new_circle moved every
-- product/receipt/alert belonging to any circle touched by the selected
-- user IDs, not just data belonging to those users. Since products are
-- circle-level (not per-user), that reassignment can't be scoped any finer
-- — so instead, guard the precondition the function was always meant to
-- have: every selected user must currently be the sole member of their
-- circle. Selecting a user out of an already-multi-member circle would
-- otherwise silently strand its other member(s) with no data.
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

revoke all on function public.merge_users_into_new_circle(uuid[]) from public;
revoke execute on function public.merge_users_into_new_circle(uuid[]) from anon, authenticated;
grant execute on function public.merge_users_into_new_circle(uuid[]) to service_role;
