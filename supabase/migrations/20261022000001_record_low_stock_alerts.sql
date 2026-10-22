-- Ticket 36: the low-stock cron used to insert its alerts rows and then set
-- products.low_stock_alert_active = true as a separate statement. If the
-- second step failed, the alerts existed but the flag didn't, so the next
-- day's run raised the same alerts again. This does both in one statement
-- (so one transaction): a failure leaves neither behind.
--
-- It is also idempotent on its own: only Products not already flagged are
-- flagged and alerted, so a Product that is somehow passed twice — a retried
-- run, two overlapping runs — gets exactly one Alert. Each Alert's circle_id
-- is read from the Product itself rather than trusted from the caller.
--
-- Returns the number of Alerts actually recorded.
create or replace function public.record_low_stock_alerts(p_product_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recorded integer;
begin
  with flagged as (
    update products
    set low_stock_alert_active = true
    where id = any(p_product_ids)
      and not low_stock_alert_active
    returning id, circle_id
  )
  insert into alerts (circle_id, type, product_id)
  select circle_id, 'low_stock', id
  from flagged;

  get diagnostics v_recorded = row_count;
  return v_recorded;
end;
$$;

-- Service-role only (the cron route), never the browser. "from public" alone
-- isn't enough: Supabase's default privileges also grant EXECUTE on new
-- public-schema functions to anon and authenticated, so revoke from both
-- explicitly (see 20260807000002_lock_down_merge_users_function.sql).
revoke all on function public.record_low_stock_alerts(uuid[]) from public;
revoke execute on function public.record_low_stock_alerts(uuid[]) from anon, authenticated;
grant execute on function public.record_low_stock_alerts(uuid[]) to service_role;
