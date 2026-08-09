-- Raise the free trial from a single call to FREE_TRIAL_LIMIT (5) so new
-- users get more room to try the app before needing an admin credit grant.
-- Replaces the boolean free_trial_used with a count so multiple free calls
-- can be tracked. See api/_lib/userAiAccess.ts's FREE_TRIAL_LIMIT constant,
-- which must be kept in sync with the "5" used in the backfill below.

alter table user_ai_access
  add column free_trial_calls_used integer not null default 0;

update user_ai_access
set free_trial_calls_used = case when free_trial_used then 5 else 0 end;

alter table user_ai_access
  drop column free_trial_used;
