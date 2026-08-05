-- Issue 15: global admin identity + per-user AI-call access, replacing
-- ai_spend_limit's single global cap. See
-- .scratch/grocery-receipt-tracker/issues/15-admin-dashboard-and-per-user-credits.md
-- for the full design rationale.

-- Global admin flag. Presence of a row = is a global admin. Exactly one
-- admin exists today (the app's owner); there's no self-serve promotion
-- flow, so rows are added by hand, not by any application code path.
create table global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table global_admins enable row level security;

-- A user can check whether *they themselves* are an admin (drives the
-- post-login redirect) — but cannot see or affect anyone else's row, and
-- cannot write their own into existence.
create policy "a user can check their own admin status"
on global_admins for select to authenticated
using (user_id = (select auth.uid()));

-- Per-user AI-call access. Replaces ai_spend_limit's singleton row.
-- Absence of a row for a user_id is itself meaningful: "fresh signup,
-- free trial available, never touched." A row only gets created the
-- first time that user either (a) successfully consumes their free
-- trial call, or (b) is granted real credit by an admin — both writes
-- happen from the backend only.
--
-- Mode is derived from cap_usd, not stored as a separate enum:
--   cap_usd is null      -> free-trial mode; refuse if free_trial_used
--   cap_usd is not null  -> dollar-cap mode; refuse if spent_usd >= cap_usd
create table user_ai_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_trial_used boolean not null default false,
  cap_usd numeric(10, 4),
  spent_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now()
);

alter table user_ai_access enable row level security;

-- Read-only for the row's own owner, so the frontend can show "1 free
-- upload available" / "$0.32 of $1.00 used". No write policy for
-- authenticated at all — only the service-role key writes.
create policy "a user can view their own AI access status"
on user_ai_access for select to authenticated
using (user_id = (select auth.uid()));

-- Migrate existing users straight into dollar-cap mode (default $1),
-- skipping the new-user free-trial gate (issue 15, decision 9).
insert into user_ai_access (user_id, free_trial_used, cap_usd, spent_usd)
select user_id, true, 1.00, 0
from profiles
on conflict (user_id) do nothing;
