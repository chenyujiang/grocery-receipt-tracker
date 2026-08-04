create extension if not exists pgcrypto;

-- Section 5.0: Circle & Profile
create table circles (
  id uuid primary key default gen_random_uuid(),
  name text,
  max_members int not null default 10,
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  circle_id uuid not null references circles(id) on delete restrict,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

create index profiles_circle_id_idx on profiles(circle_id);

-- Section 9: fixed, system-wide category taxonomy (English is canonical)
create table categories (
  name_en text primary key,
  name_zh text not null
);

-- Section 5.3: Product (standardized product, scoped per circle)
create table products (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  canonical_name_en text not null,
  canonical_name_zh text,
  category text not null references categories(name_en),
  low_stock_alert_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index products_circle_id_idx on products(circle_id);

-- Section 5.1: Receipt
create table receipts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  store_name_en text not null,
  store_name_zh text,
  purchase_date date not null,
  total_amount numeric(10, 2) not null,
  original_image_url text,
  uploaded_at timestamptz not null default now(),
  status text not null default 'pending_review' check (status in ('pending_review', 'confirmed'))
);

create index receipts_circle_id_purchase_date_idx on receipts(circle_id, purchase_date);
create index receipts_uploaded_by_idx on receipts(uploaded_by);

-- Section 5.2: ReceiptItem (no separate category column — category lives on Product, see spec.md 5.2 note)
create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  raw_name_en text not null,
  raw_name_zh text,
  product_id uuid references products(id) on delete set null,
  quantity numeric(10, 2) not null default 1,
  unit_spec_value numeric(10, 3),
  unit_spec_unit text,
  unit_price numeric(10, 2) not null,
  original_price numeric(10, 2),
  is_promotion boolean not null default false,
  subtotal numeric(10, 2) not null
);

create index receipt_items_receipt_id_idx on receipt_items(receipt_id);
create index receipt_items_product_id_idx on receipt_items(product_id);

-- Section 5.4: EditLog
create table edit_logs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid references receipts(id) on delete cascade,
  receipt_item_id uuid references receipt_items(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now()
);

create index edit_logs_receipt_id_idx on edit_logs(receipt_id);
create index edit_logs_receipt_item_id_idx on edit_logs(receipt_item_id);
