-- Issue 15 left ai_spend_limit in place, unreferenced, until per-user
-- user_ai_access had proven out; it has, so this is that later cleanup.
-- Its singleton row at drop time: cap_usd 1.0000, spent_usd 0.0263,
-- updated_at 2026-08-04 09:20:55+00 — the pre-issue-15 global spend.
drop table ai_spend_limit;
