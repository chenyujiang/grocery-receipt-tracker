export interface ComparableReceiptItemFields {
  rawNameEn: string;
  rawNameZh: string;
  quantity: number;
  unitSpecValue: number | null;
  unitSpecUnit: string | null;
  unitPrice: number;
  originalPrice: number | null;
  isPromotion: boolean;
  subtotal: number;
}

export interface EditLogFieldChange {
  fieldName: string;
  oldValue: string;
  newValue: string;
}

const COMPARED_FIELDS: Array<keyof ComparableReceiptItemFields> = [
  "rawNameEn",
  "rawNameZh",
  "quantity",
  "unitSpecValue",
  "unitSpecUnit",
  "unitPrice",
  "originalPrice",
  "isPromotion",
  "subtotal",
];

// Section 5.4: every user correction (OCR fixes, translation fixes, etc.)
// is recorded in EditLog. This diffs the receipt_item row Supabase held
// before confirmReceipt's update against what the user is submitting.
export function diffReceiptItemFields(
  before: ComparableReceiptItemFields,
  after: ComparableReceiptItemFields
): EditLogFieldChange[] {
  const changes: EditLogFieldChange[] = [];
  for (const field of COMPARED_FIELDS) {
    if (before[field] !== after[field]) {
      changes.push({
        fieldName: field,
        oldValue: String(before[field]),
        newValue: String(after[field]),
      });
    }
  }
  return changes;
}
