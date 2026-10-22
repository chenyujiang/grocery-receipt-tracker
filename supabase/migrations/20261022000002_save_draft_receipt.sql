-- Ticket 33: saveDraftReceipt (api/_lib/saveDraftReceipt.ts) used to write a
-- recognized receipt as three separate requests: insert the receipts row,
-- create a products row for each unmatched item, then insert the
-- receipt_items. A failure partway left debris behind: a pending_review
-- receipt with no items, or Products no item points at. This does all three
-- in one function call, so one transaction: either the whole draft commits or
-- none of it does.
--
-- p_receipt:      the receipts row, minus status (always 'pending_review'
--                 here) and store_id (a Store is resolved on confirm, not on
--                 draft save — issue 29).
-- p_new_products: the Products to create, already deduped by name by the
--                 caller, so two lines for the same new product on one
--                 receipt create one Product. Each lands in p_receipt's
--                 circle.
-- p_items:        the receipt_items rows. Each sets either product_id (an
--                 existing Product) or new_product_index (a 0-based index
--                 into p_new_products). An item with neither raises an
--                 exception, so nothing is written.
--
-- Returns the new receipt's id.
create or replace function public.save_draft_receipt(
  p_receipt jsonb,
  p_new_products jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_id uuid := (p_receipt->>'circle_id')::uuid;
  v_receipt_id uuid;
  v_new_product_ids uuid[];
begin
  -- An item that names neither an existing Product nor a new one would be
  -- written with product_id = null: a line with no Product, invisible to
  -- every price/consumption feature. That's a caller bug, so refuse the whole
  -- draft rather than save it silently unlinked.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as entry(item)
    where item->>'product_id' is null
      and (
        item->>'new_product_index' is null
        or (item->>'new_product_index')::integer < 0
        or (item->>'new_product_index')::integer
          >= jsonb_array_length(coalesce(p_new_products, '[]'::jsonb))
      )
  ) then
    raise exception 'save_draft_receipt: every item needs a product_id or an in-range new_product_index';
  end if;

  insert into receipts (
    circle_id,
    uploaded_by,
    store_name_en,
    store_name_zh,
    recognized_chain_en,
    recognized_chain_zh,
    recognized_branch_en,
    recognized_branch_zh,
    purchase_date,
    total_amount,
    original_image_url,
    status
  )
  values (
    v_circle_id,
    (p_receipt->>'uploaded_by')::uuid,
    p_receipt->>'store_name_en',
    p_receipt->>'store_name_zh',
    p_receipt->>'recognized_chain_en',
    p_receipt->>'recognized_chain_zh',
    p_receipt->>'recognized_branch_en',
    p_receipt->>'recognized_branch_zh',
    (p_receipt->>'purchase_date')::date,
    (p_receipt->>'total_amount')::numeric,
    p_receipt->>'original_image_url',
    'pending_review'
  )
  returning id into v_receipt_id;

  -- One row per p_new_products entry, in order, so new_product_index can
  -- look the id up by position. The ids are generated here rather than read
  -- back from INSERT ... RETURNING, whose row order isn't guaranteed.
  with numbered as (
    select gen_random_uuid() as id, entry.value as product, entry.ordinality as position
    from jsonb_array_elements(coalesce(p_new_products, '[]'::jsonb))
      with ordinality as entry(value, ordinality)
  ),
  inserted as (
    insert into products (id, circle_id, canonical_name_en, canonical_name_zh, category)
    select id, v_circle_id, product->>'canonical_name_en', product->>'canonical_name_zh', product->>'category'
    from numbered
  )
  select coalesce(array_agg(id order by position), '{}') into v_new_product_ids
  from numbered;

  insert into receipt_items (
    receipt_id,
    raw_name_en,
    raw_name_zh,
    product_id,
    quantity,
    unit_spec_value,
    unit_spec_unit,
    unit_price,
    original_price,
    is_promotion,
    subtotal
  )
  select
    v_receipt_id,
    item->>'raw_name_en',
    item->>'raw_name_zh',
    -- Postgres arrays are 1-based; new_product_index is 0-based.
    coalesce(
      (item->>'product_id')::uuid,
      v_new_product_ids[(item->>'new_product_index')::integer + 1]
    ),
    (item->>'quantity')::numeric,
    (item->>'unit_spec_value')::numeric,
    item->>'unit_spec_unit',
    (item->>'unit_price')::numeric,
    (item->>'original_price')::numeric,
    (item->>'is_promotion')::boolean,
    (item->>'subtotal')::numeric
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as entry(item);

  return v_receipt_id;
end;
$$;

-- Service-role only (the recognize route), never the browser. "from public"
-- alone isn't enough: Supabase's default privileges also grant EXECUTE on new
-- public-schema functions to anon and authenticated, so revoke from both
-- explicitly (see 20260807000002_lock_down_merge_users_function.sql).
revoke all on function public.save_draft_receipt(jsonb, jsonb, jsonb) from public;
revoke execute on function public.save_draft_receipt(jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.save_draft_receipt(jsonb, jsonb, jsonb) to service_role;
