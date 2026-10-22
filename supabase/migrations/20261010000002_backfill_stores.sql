-- Issue 29, step 2: point every receipt confirmed before Stores existed at a
-- Store, by a mapping the user confirmed by hand rather than by the spec's
-- automatic "one unknown-branch Store per raw name" rule — with 19 receipts
-- and 11 names, a manual mapping was realistic, and it keeps the three
-- spellings of PAK'nSAVE Albany as one Store instead of splitting its history.
--
-- chain_key / branch_key are what storeKey() in src/lib/storeKey.ts returns for
-- each chain/branch pair, computed by running it rather than written by hand:
-- a key that differs from the app's would let the next confirmed receipt at
-- the same branch create a duplicate Store beside the backfilled one.
--
-- chain_name_zh is taken from the existing translation on the receipt whose
-- header is the chain alone (e.g. the one printed just "PAK'nSAVE"); branch
-- names are transliterated. Drafts are left alone: they get a Store when
-- they're confirmed.
--
-- The mapping is pinned to the one Circle it was drawn up for (all 19
-- receipts were in it). A confirmed receipt in any other Circle is therefore
-- unmapped, and the check below stops the migration rather than handing it
-- this Circle's branches.

create temporary table store_backfill_map (
  circle_id uuid not null,
  store_name_en text not null,
  chain_name_en text not null,
  chain_zh_from text not null,
  branch_name_en text,
  branch_name_zh text,
  chain_key text not null,
  branch_key text,
  primary key (circle_id, store_name_en)
);

insert into store_backfill_map
select c.circle_id, m.*
from (values ('21981d82-8aec-480a-9540-980d43e9b977'::uuid)) as c(circle_id)
cross join (values
  ('Pak n Save Albany',        'PAK''nSAVE',                'PAK''nSAVE',                'Albany',      '奥尔巴尼',   'paknsave',                  'albany'),
  ('Pak''nSave Albany',        'PAK''nSAVE',                'PAK''nSAVE',                'Albany',      '奥尔巴尼',   'paknsave',                  'albany'),
  ('PAK''nSAVE',               'PAK''nSAVE',                'PAK''nSAVE',                'Albany',      '奥尔巴尼',   'paknsave',                  'albany'),
  ('New World Hobsonville',    'New World',                 'New World',                 'Hobsonville', '霍布森维尔', 'new world',                 'hobsonville'),
  ('New World',                'New World',                 'New World',                 'Hobsonville', '霍布森维尔', 'new world',                 'hobsonville'),
  ('Costco Wholesale',         'Costco',                    'Costco Wholesale',          'Westgate',    '韦斯特盖特', 'costco',                    'westgate'),
  ('Woolworths',               'Woolworths',                'Woolworths',                null,          null,         'woolworths',                null),
  ('Foodie Asian Supermarket', 'Foodie Asian Supermarket',  'Foodie Asian Supermarket',  null,          null,         'foodie asian supermarket',  null),
  ('D.H. Supermarket',         'D.H. Supermarket',          'D.H. Supermarket',          null,          null,         'dh supermarket',            null),
  ('Golden Apple Supermarket', 'Golden Apple Supermarket',  'Golden Apple Supermarket',  null,          null,         'golden apple supermarket',  null),
  ('Yimai Trading Ltd',        'Yimai Trading Ltd',         'Yimai Trading Ltd',         null,          null,         'yimai trading ltd',         null)
) as m(store_name_en, chain_name_en, chain_zh_from, branch_name_en, branch_name_zh, chain_key, branch_key);

-- Checked before anything is written: a receipt confirmed since the mapping
-- was drawn up may carry a name it doesn't cover, or sit in another Circle,
-- and it would otherwise be left silently pointing at no Store.
do $$
declare
  v_unmapped text;
begin
  select string_agg(distinct r.store_name_en, ', ')
  into v_unmapped
  from receipts r
  where r.status = 'confirmed'
    and r.store_id is null
    and not exists (
      select 1 from store_backfill_map m
      where m.circle_id = r.circle_id and m.store_name_en = r.store_name_en
    );

  if v_unmapped is not null then
    raise exception 'store backfill: confirmed receipts not in the mapping for their Circle: %', v_unmapped;
  end if;
end;
$$;

-- One Store per (circle, chain, branch) that a receipt maps to.
insert into stores (circle_id, chain_name_en, chain_name_zh, branch_name_en, branch_name_zh, chain_key, branch_key)
select distinct on (r.circle_id, m.chain_key, m.branch_key)
  r.circle_id,
  m.chain_name_en,
  (
    select z.store_name_zh
    from receipts z
    where z.circle_id = r.circle_id
      and z.store_name_en = m.chain_zh_from
      and z.store_name_zh is not null
    order by z.uploaded_at
    limit 1
  ),
  m.branch_name_en,
  m.branch_name_zh,
  m.chain_key,
  m.branch_key
from receipts r
join store_backfill_map m
  on m.circle_id = r.circle_id
  and m.store_name_en = r.store_name_en
where r.status = 'confirmed'
  and r.store_id is null
on conflict on constraint stores_circle_chain_branch_key do nothing;

update receipts r
set store_id = s.id
from store_backfill_map m
join stores s
  on s.circle_id = m.circle_id
  and s.chain_key = m.chain_key
  and s.branch_key is not distinct from m.branch_key
where m.circle_id = r.circle_id
  and m.store_name_en = r.store_name_en
  and r.status = 'confirmed'
  and r.store_id is null;

drop table store_backfill_map;
