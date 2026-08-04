insert into categories (name_en, name_zh) values
  ('Food - Grains & Oil', '食品-粮油调味'),
  ('Food - Fresh Produce', '食品-生鲜'),
  ('Food - Dairy & Bakery', '食品-乳制品烘焙'),
  ('Food - Snacks & Beverages', '食品-零食饮料'),
  ('Household - Cleaning', '日用品-清洁洗护'),
  ('Household - Personal Care', '日用品-个人护理'),
  ('Baby & Maternity', '母婴用品'),
  ('Pet Supplies', '宠物用品'),
  ('Other / Uncategorized', '其他/未分类')
on conflict (name_en) do nothing;
