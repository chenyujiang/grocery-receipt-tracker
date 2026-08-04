-- Section 3.1: a single, global, hard-dollar cap on Claude API spend — not
-- per-call-count, not per-user. Singleton row (Postgres "boolean PK" trick
-- guarantees exactly one row). Raising the cap after it's hit is a manual
-- UPDATE by a circle owner; nothing here auto-resets or auto-raises it.
create table ai_spend_limit (
  id boolean primary key default true check (id),
  cap_usd numeric(10, 4) not null default 1.00,
  spent_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now()
);

insert into ai_spend_limit (id) values (true);

alter table ai_spend_limit enable row level security;

-- Read-only for any signed-in user, so the frontend can show remaining
-- budget ("$0.34 of $1.00 used"). Only the backend's service-role key
-- (bypassing RLS) is allowed to update spent_usd/cap_usd.
create policy "authenticated users can view the spend limit"
on ai_spend_limit for select to authenticated using (true);
