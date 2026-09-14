import { supabase } from "@/lib/supabaseClient";
import { fetchCircleMembers } from "@/lib/circleMembers";
import { bilingualName } from "@/lib/bilingualName";

export interface ExportRow {
  purchaseDate: string;
  storeNameEn: string;
  storeNameZh: string;
  productNameEn: string;
  productNameZh: string;
  category: string;
  quantity: number;
  specValue: number | null;
  specUnit: string | null;
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

// A Receipt Item with no unit spec has no spec value or unit to export; the
// column is left empty rather than rendering the string "null".
function escapeCsvField(value: string | number | boolean | null): string {
  const str = value == null ? "" : String(value);
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

  const rows = data ?? [];

  return rows.map((row) => {
    const storeName = bilingualName(row.receipts.store_name_en, row.receipts.store_name_zh);
    const productName = bilingualName(
      row.products?.canonical_name_en ?? row.raw_name_en,
      row.products?.canonical_name_zh ?? row.raw_name_zh
    );
    return {
      purchaseDate: row.receipts.purchase_date,
      storeNameEn: storeName.en,
      storeNameZh: storeName.zh,
      productNameEn: productName.en,
      productNameZh: productName.zh,
      category: row.products?.category ?? "",
      quantity: row.quantity,
      specValue: row.unit_spec_value,
      specUnit: row.unit_spec_unit,
      unitPrice: row.unit_price,
      isPromotion: row.is_promotion,
      uploader: nameById.get(row.receipts.uploaded_by) ?? row.receipts.uploaded_by,
    };
  });
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
