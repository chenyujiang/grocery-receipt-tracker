import { supabase } from "@/lib/supabaseClient";
import { fetchCircleMembers } from "@/lib/circleMembers";

export interface ExportRow {
  purchaseDate: string;
  storeNameEn: string;
  storeNameZh: string;
  productNameEn: string;
  productNameZh: string;
  category: string;
  quantity: number;
  specValue: number;
  specUnit: string;
  unitPrice: number;
  isPromotion: boolean;
  uploader: string;
}

const CSV_HEADER = [
  "purchase_date",
  "store_name_en",
  "store_name_zh",
  "product_name_en",
  "product_name_zh",
  "category",
  "quantity",
  "spec_value",
  "spec_unit",
  "unit_price",
  "is_promotion",
  "uploader",
];

function escapeCsvField(value: string | number | boolean): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Section 14: line-by-line export, one row per ReceiptItem, nothing
// pre-aggregated.
export function rowsToCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.purchaseDate,
        row.storeNameEn,
        row.storeNameZh,
        row.productNameEn,
        row.productNameZh,
        row.category,
        row.quantity,
        row.specValue,
        row.specUnit,
        row.unitPrice,
        row.isPromotion,
        row.uploader,
      ]
        .map(escapeCsvField)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

export interface ExportRange {
  from: string;
  to: string;
}

// Section 14: the whole circle's confirmed line items in a selectable date
// range, for the monthly report page's CSV export.
export async function fetchExportRows(range: ExportRange): Promise<ExportRow[]> {
  const { data, error } = await supabase
    .from("receipt_items")
    .select(
      "quantity, unit_spec_value, unit_spec_unit, unit_price, is_promotion, raw_name_en, raw_name_zh, products(canonical_name_en, canonical_name_zh, category), receipts!inner(purchase_date, store_name_en, store_name_zh, status, uploaded_by)"
    )
    .eq("receipts.status", "confirmed")
    .gte("receipts.purchase_date", range.from)
    .lte("receipts.purchase_date", range.to)
    .order("purchase_date", { foreignTable: "receipts", ascending: true });
  if (error) {
    throw error;
  }

  const members = await fetchCircleMembers();
  const nameById = new Map(members.map((member) => [member.userId, member.displayName]));

  // Cast at the boundary: without generated Database types, supabase-js
  // infers these to-one embeds (receipt_items -> products, -> receipts) as
  // arrays, though PostgREST returns single objects at runtime.
  const rows = (data ?? []) as unknown as Array<{
    quantity: number;
    unit_spec_value: number;
    unit_spec_unit: string;
    unit_price: number;
    is_promotion: boolean;
    raw_name_en: string;
    raw_name_zh: string;
    products: { canonical_name_en: string; canonical_name_zh: string; category: string } | null;
    receipts: {
      purchase_date: string;
      store_name_en: string;
      store_name_zh: string;
      uploaded_by: string;
    };
  }>;

  return rows.map((row) => ({
    purchaseDate: row.receipts.purchase_date,
    storeNameEn: row.receipts.store_name_en,
    storeNameZh: row.receipts.store_name_zh,
    productNameEn: row.products?.canonical_name_en ?? row.raw_name_en,
    productNameZh: row.products?.canonical_name_zh ?? row.raw_name_zh,
    category: row.products?.category ?? "",
    quantity: row.quantity,
    specValue: row.unit_spec_value,
    specUnit: row.unit_spec_unit,
    unitPrice: row.unit_price,
    isPromotion: row.is_promotion,
    uploader: nameById.get(row.receipts.uploaded_by) ?? row.receipts.uploaded_by,
  }));
}

// Thin browser-API wrapper (Blob + anchor click) — not worth a unit test,
// same convention as receipts.ts's fileToBase64.
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
