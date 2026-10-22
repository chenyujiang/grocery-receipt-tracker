-- Ticket 37: atomic per-user AI access accounting. Replaces the
-- read-then-write in api/_lib/userAiAccess.ts, where several uploads started
-- at once by one user could all pass the access check, and two concurrent
-- successes could read the same old count/spend and lose an increment.
--
-- Concurrency comes from Postgres row locks, not from anything in the app:
-- each function below changes the caller's user_ai_access row with a single
-- `UPDATE ... WHERE <condition>`. A second concurrent UPDATE on the same row
-- blocks until the first commits, then re-checks its WHERE against the new
-- row version (READ COMMITTED's re-evaluation) — so with one free call left,
-- exactly one of two concurrent reservations matches and the other matches
-- nothing; and two concurrent `spent_usd = spent_usd + cost` both land.
--
-- Issue 15's rules are unchanged: the Free Trial is count-based and counts
-- successful calls only (a reservation is handed back via release_ai_call
-- if the call fails), AI Credit is spend-based, and nothing here ever resets
-- or raises a cap — only grantCredit (an admin action) does that.
--
-- Called only from the Vercel API (supabaseAdmin.rpc), never the browser:
-- SECURITY DEFINER with an empty search_path (every name schema-qualified),
-- and EXECUTE revoked from public/anon/authenticated — Supabase's default
-- privileges grant it to anon and authenticated separately from PUBLIC (see
-- 20260807000002_lock_down_merge_users_function.sql).

-- Reserve one call for p_user_id, or report why not. Returns one row.
--   Trial mode (cap_usd null): atomically increments free_trial_calls_used
--     if it is still below p_free_trial_limit (passed in from the app's
--     FREE_TRIAL_LIMIT so the limit has one source of truth).
--   Dollar-cap mode: allowed iff spent_usd < cap_usd. Nothing is reserved —
--     the call's cost isn't known until it returns; record_ai_spend adds it.
create or replace function public.reserve_ai_call(p_user_id uuid, p_free_trial_limit integer)
returns table (
  allowed boolean,
  mode text,
  free_trial_calls_used integer,
  cap_usd numeric,
  spent_usd numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.user_ai_access%rowtype;
begin
  -- A brand-new user has no row yet; create a default (trial, 0 used) one so
  -- the UPDATE below has a row to lock. Equivalent to "no row" everywhere
  -- else (adminUsers.ts reads a missing row as trial with 0 calls used).
  insert into public.user_ai_access (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_ai_access a
  set free_trial_calls_used = a.free_trial_calls_used + 1,
      updated_at = now()
  where a.user_id = p_user_id
    and a.cap_usd is null
    and a.free_trial_calls_used < p_free_trial_limit
  returning a.* into v_row;

  if found then
    return query select true, 'trial'::text, v_row.free_trial_calls_used,
      v_row.cap_usd, v_row.spent_usd;
    return;
  end if;

  select a.* into v_row
  from public.user_ai_access a
  where a.user_id = p_user_id;

  if v_row.cap_usd is null then
    return query select false, 'trial'::text, v_row.free_trial_calls_used,
      v_row.cap_usd, v_row.spent_usd;
    return;
  end if;

  return query select v_row.spent_usd < v_row.cap_usd, 'cap'::text,
    v_row.free_trial_calls_used, v_row.cap_usd, v_row.spent_usd;
end;
$$;

-- Hand back a trial reservation whose call didn't succeed. Guarded on
-- cap_usd is null: if an admin granted credit while the call was in flight,
-- grantCredit has already set the trial count to the limit, and the trial
-- count no longer matters — leave it alone.
create or replace function public.release_ai_call(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_ai_access
  set free_trial_calls_used = free_trial_calls_used - 1,
      updated_at = now()
  where user_id = p_user_id
    and cap_usd is null
    and free_trial_calls_used > 0;
$$;

-- Add a successful dollar-cap call's actual cost, atomically.
create or replace function public.record_ai_spend(p_user_id uuid, p_cost_usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_cost_usd is null or p_cost_usd < 0 then
    raise exception 'record_ai_spend: cost must be a non-negative number, got %', p_cost_usd;
  end if;

  update public.user_ai_access
  set spent_usd = spent_usd + p_cost_usd,
      updated_at = now()
  where user_id = p_user_id
    and cap_usd is not null;
end;
$$;

revoke all on function public.reserve_ai_call(uuid, integer) from public;
revoke execute on function public.reserve_ai_call(uuid, integer) from anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, integer) to service_role;

revoke all on function public.release_ai_call(uuid) from public;
revoke execute on function public.release_ai_call(uuid) from anon, authenticated;
grant execute on function public.release_ai_call(uuid) to service_role;

revoke all on function public.record_ai_spend(uuid, numeric) from public;
revoke execute on function public.record_ai_spend(uuid, numeric) from anon, authenticated;
grant execute on function public.record_ai_spend(uuid, numeric) to service_role;
