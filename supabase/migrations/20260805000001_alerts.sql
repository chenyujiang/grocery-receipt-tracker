-- Section 13 (price-spike) + Section 12 (low-stock): a single alerts table
-- for both notification types, visible to all circle members. Append-only,
-- like edit_logs — no update/delete policy, and no muting for now (per the
-- resolved tickets). Email delivery is deferred: no provider (Resend, etc.)
-- has been chosen yet, so this only supports the in-app notification list.
create table alerts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  type text not null check (type in ('price_spike', 'low_stock')),
  product_id uuid not null references products(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete set null,
  new_price numeric(10, 2),
  change_percent numeric(6, 2),
  created_at timestamptz not null default now()
);

create index alerts_circle_id_idx on alerts(circle_id);
create index alerts_product_id_idx on alerts(product_id);

alter table alerts enable row level security;

create policy "members can view their circle's alerts"
on alerts for select to authenticated
using (circle_id = current_circle_id());

create policy "members can create alerts in their circle"
on alerts for insert to authenticated
with check (circle_id = current_circle_id());
