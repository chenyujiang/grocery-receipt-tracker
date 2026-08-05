// Data model types mirroring spec.md Section 5 (Data Model).
// Field names and shapes must stay in sync with .scratch/grocery-receipt-tracker/spec.md.

export type Role = "owner" | "member";

export interface Circle {
  id: string;
  name: string | null;
  max_members: number;
  created_at: string;
}

export interface Profile {
  user_id: string;
  circle_id: string;
  role: Role;
  display_name: string | null;
}

export type ReceiptStatus = "pending_review" | "confirmed";

export interface Receipt {
  id: string;
  circle_id: string;
  uploaded_by: string;
  store_name_en: string;
  store_name_zh: string;
  purchase_date: string;
  total_amount: number;
  original_image_url: string | null;
  uploaded_at: string;
  status: ReceiptStatus;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  raw_name_en: string;
  raw_name_zh: string;
  product_id: string | null;
  quantity: number;
  unit_spec_value: number;
  unit_spec_unit: string;
  unit_price: number;
  original_price: number | null;
  is_promotion: boolean;
  subtotal: number;
}

export interface Product {
  id: string;
  circle_id: string;
  canonical_name_en: string;
  canonical_name_zh: string;
  category: string;
  low_stock_alert_active: boolean;
  created_at: string;
}

export interface EditLog {
  id: string;
  receipt_id: string | null;
  receipt_item_id: string | null;
  field_name: string;
  old_value: string;
  new_value: string;
  edited_by: string;
  edited_at: string;
}

// Section 9: fixed, system-wide category list (English is canonical, Chinese is the translation).
export const CATEGORIES = [
  { en: "Food - Grains & Oil", zh: "食品-粮油调味" },
  { en: "Food - Fresh Produce", zh: "食品-生鲜" },
  { en: "Food - Dairy & Bakery", zh: "食品-乳制品烘焙" },
  { en: "Food - Snacks & Beverages", zh: "食品-零食饮料" },
  { en: "Household - Cleaning", zh: "日用品-清洁洗护" },
  { en: "Household - Personal Care", zh: "日用品-个人护理" },
  { en: "Baby & Maternity", zh: "母婴用品" },
  { en: "Pet Supplies", zh: "宠物用品" },
  { en: "Other / Uncategorized", zh: "其他/未分类" },
] as const;
