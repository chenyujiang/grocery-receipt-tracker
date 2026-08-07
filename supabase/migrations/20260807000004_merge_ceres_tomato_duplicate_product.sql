-- Two Product rows turned out to be the same real item, recognized
-- differently across two receipts (one plain, one on promotion) and
-- wrongly matched into separate Products with mismatched canonical names.
-- Keep the one already in the correct category (Grains & Oil), fix its
-- canonical name to reflect what was actually bought, move the other's
-- receipt_item onto it, then remove the duplicate.
update products
set canonical_name_en = 'Ceres Organic Chopped Tomato 400g',
    canonical_name_zh = '西瑞斯有机番茄碎 400克'
where id = '12810a66-de60-4d19-9837-5c625a8694b5';

update receipt_items
set product_id = '12810a66-de60-4d19-9837-5c625a8694b5'
where product_id = 'cd7a9841-b88a-448e-9221-0bbe3be80dca';

delete from products where id = 'cd7a9841-b88a-448e-9221-0bbe3be80dca';
