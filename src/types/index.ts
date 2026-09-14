// What's left after the hand-written row interfaces were deleted: the fixed
// category list, and `Role` as a standalone name for `profiles.role`'s union
// (same narrowing as `src/types/database.types.ts` — keep the two in step).
// Row shapes belong in database.types.ts: reach for
// `Database["public"]["Tables"][...]["Row"]` rather than adding one back here.

export type Role = "owner" | "member";

// Section 9: fixed, system-wide category list (English is canonical, Chinese is the translation).
// Amended post-launch: Fresh Produce split into Fruits/Vegetables (plus a
// new Meat & Seafood, since several "Fresh Produce" products turned out to
// be meat), Snacks & Beverages split into Snacks/Beverages, and a new
// Frozen category added — see supabase/migrations/20260807000003_refine_food_categories.sql.
export const CATEGORIES = [
  { en: "Food - Grains & Oil", zh: "食品-粮油调味" },
  { en: "Food - Fruits", zh: "食品-水果" },
  { en: "Food - Vegetables", zh: "食品-蔬菜" },
  { en: "Food - Meat & Seafood", zh: "食品-肉类海鲜" },
  { en: "Food - Dairy & Bakery", zh: "食品-乳制品烘焙" },
  { en: "Food - Frozen", zh: "食品-冷冻食品" },
  { en: "Food - Snacks", zh: "食品-零食" },
  { en: "Food - Beverages", zh: "食品-饮料" },
  { en: "Household - Cleaning", zh: "日用品-清洁洗护" },
  { en: "Household - Personal Care", zh: "日用品-个人护理" },
  { en: "Baby & Maternity", zh: "母婴用品" },
  { en: "Pet Supplies", zh: "宠物用品" },
  { en: "Other / Uncategorized", zh: "其他/未分类" },
] as const;
