-- Store names are shown in English only: clear the AI translations the
-- backfill carried over, so every name falls back to its Source Text.
-- receipts.store_name_zh, the Receipt Header's translation, is kept.
update stores
set chain_name_zh = null,
    branch_name_zh = null
where circle_id = '21981d82-8aec-480a-9540-980d43e9b977';
