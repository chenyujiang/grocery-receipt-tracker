-- Cover the two foreign keys the Supabase performance advisor flagged as
-- unindexed, so deleting a receipt or a Store doesn't scan the referencing
-- table to check the constraint.
--
-- Applied live through execute_sql, not apply_migration (which kept failing
-- with "Invalid or expired requestState"), so it's missing from the live
-- migration history even though its indexes are there.
create index alerts_receipt_id_idx on alerts(receipt_id);

-- Matches receipts_store_id_circle_id_fkey's column order, so it covers the
-- composite FK; store_id leads, so it also serves every lookup the old
-- single-column index did, which makes that one redundant.
create index receipts_store_id_circle_id_idx on receipts(store_id, circle_id);
drop index receipts_store_id_idx;
