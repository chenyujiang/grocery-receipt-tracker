-- Splits the two catch-all food categories into finer ones, per product
-- decision: Fresh Produce -> Fruits / Vegetables (+ a new Meat & Seafood,
-- since several "Fresh Produce" products were actually meat), Snacks &
-- Beverages -> Snacks / Beverages, plus a new Frozen category.
insert into categories (name_en, name_zh) values
  ('Food - Fruits', '食品-水果'),
  ('Food - Vegetables', '食品-蔬菜'),
  ('Food - Meat & Seafood', '食品-肉类海鲜'),
  ('Food - Frozen', '食品-冷冻食品'),
  ('Food - Snacks', '食品-零食'),
  ('Food - Beverages', '食品-饮料')
on conflict (name_en) do nothing;

-- Reassign every existing product out of the two categories being removed.
-- Hand-classified by product name (no automated rule could place these
-- correctly) — reviewable/fixable later since there's no category-edit UI
-- yet.
update products set category = 'Food - Fruits' where id in (
  'b100a769-5f17-45e7-8a4b-c94e0ec96fe7', -- Apples Rockit 4pc Tube NZ
  '8c1fa392-fcde-407e-bd02-624e71b2e286', -- Apples Rose
  'a985cdf2-2df7-4d33-9475-25b958654f8e', -- BANANAS KG
  '9840bd59-b5c1-4532-9bd4-28f275c1f70e', -- Grapes Black Seedless
  'a110aef0-c5a5-4d4c-974f-d4c008a25c84', -- Mandarin Imported
  '3b3120c0-15e6-4e14-ad33-89901b22bc86'  -- Pineapple Gold
);

update products set category = 'Food - Vegetables' where id in (
  'f6a60fc7-dc9a-41f0-9e45-618886eb1832', -- Cucumber Telegraphy
  '6765007f-646a-4cf3-a174-eff9ccd1a40c', -- Mushrooms White Button 200g
  'dc4db347-6163-4869-8862-ac9013238951', -- PUMPKIN BUTTERNUT EA
  '238aa53d-48af-4933-abe4-9388035332a4'  -- Check Fresh Tofu 300g
);

update products set category = 'Food - Meat & Seafood' where id in (
  '24d0333e-56bb-489c-aa0e-1c4fed8465cf', -- Lamb Shoulder Slices 400g
  '4a80a481-0178-4311-92e9-8995cb7fec95'  -- NZ Beef Premium Mince
);

update products set category = 'Food - Frozen' where id in (
  'eedd407d-db9b-45db-b72e-f1c706055b1a', -- Sichuan Frozen Meatball 148g
  '10681e1e-3d9b-492a-93ba-0109fee6f2fc', -- Juicy Dumplings Pork/Hive/Prawn 700g
  '64292264-257e-4569-ad38-f045f09a1540', -- LOTTE YUKIMI MOCHI DSRT VANILLA 191.7G
  '68c76457-f4b3-4c5d-91f7-157ca9b88b65'  -- PF_LOTTE MOCHI ICE C
);

update products set category = 'Food - Snacks' where id in (
  '8c4655fc-299d-4fef-8d73-f1b9c70e3e0f', -- Liangpin Shop Passion Fruit Skin 250g
  '318e3638-b88f-46b4-b3d9-e9281f368ffa', -- LITTLE BELLIES ORG ANIMAL BISCUITS 130G
  '8c713dcf-4c68-4e20-84c4-d23efe34a706'  -- Premium Soy Sauce Oil Skin 200g
);

update products set category = 'Food - Beverages' where id in (
  'c6bbb0b9-09b6-4c55-a61f-5bd19bfcdfb3', -- HOMEGROWN ORANGE JUICE 100% PURE 1.475L
  '051630ae-d3c6-4bc3-a247-789cf8f55635', -- JEDS COFFEE C0 200G 4
  'ef33559f-be20-45b7-a389-2b0bf2780da2'  -- Matcha Latte Powder 198g
);

update products set category = 'Food - Dairy & Bakery' where id in (
  '35100ec7-75c1-4d34-a887-d8a71006a83b'  -- BREAD SPECIALTY 400G
);

update products set category = 'Food - Grains & Oil' where id in (
  '86cd4c39-8e94-4dba-a2be-7c00fc2d61ee', -- CAMPBELLS REAL STOCK
  '117603fa-37b7-41a7-8c78-6798c9a320bb', -- DXC CUBE 125 VEGETABL
  'd8939766-7a80-4d56-8341-3d2492ce8051', -- EXOTIC FOODS SAUCE 72
  '12810a66-de60-4d19-9837-5c625a8694b5', -- PAMS TOMATO 400G DICE
  '5f16ad3d-d119-4e4a-9da9-93af4bf9e361', -- Preserved Vegetable with Pork Original Flavour 135g
  'cc91afc3-d1cb-4f08-8b9f-5bdb7db8f9fd'  -- Sea Bottom Hot Pot Base with Granule 180g
);

-- Now safe to drop — no product references either old category anymore.
delete from categories where name_en in ('Food - Fresh Produce', 'Food - Snacks & Beverages');
