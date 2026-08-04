import { anthropicClient } from "./anthropicClient";
import { CATEGORIES } from "../../src/types";

// Sections 6, 8, 9: one Claude call does OCR, English->Chinese translation,
// category selection, and a product-match suggestion against the circle's
// existing standardized products.
export interface ExistingProduct {
  id: string;
  canonicalNameEn: string;
}

export interface RecognizedItem {
  rawNameEn: string;
  rawNameZh: string;
  quantity: number;
  unitSpecValue: number;
  unitSpecUnit: string;
  unitPrice: number;
  originalPrice: number | null;
  isPromotion: boolean;
  subtotal: number;
  category: string;
  matchedProductId: string | null;
}

export interface RecognizedReceipt {
  storeNameEn: string;
  storeNameZh: string;
  purchaseDate: string;
  totalAmount: number;
  items: RecognizedItem[];
}

export interface RecognizeReceiptResult {
  receipt: RecognizedReceipt;
  usage: { inputTokens: number; outputTokens: number };
}

export interface RecognizeReceiptParams {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  existingProducts: ExistingProduct[];
}

const CATEGORY_NAMES = CATEGORIES.map((category) => category.en);

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    raw_name_en: { type: "string" },
    raw_name_zh: { type: "string" },
    quantity: { type: "number" },
    unit_spec_value: { type: "number" },
    unit_spec_unit: { type: "string" },
    unit_price: { type: "number" },
    original_price: { type: ["number", "null"] },
    is_promotion: { type: "boolean" },
    subtotal: { type: "number" },
    category: { type: "string", enum: CATEGORY_NAMES },
    matched_product_id: { type: ["string", "null"] },
  },
  required: [
    "raw_name_en",
    "raw_name_zh",
    "quantity",
    "unit_spec_value",
    "unit_spec_unit",
    "unit_price",
    "original_price",
    "is_promotion",
    "subtotal",
    "category",
    "matched_product_id",
  ],
  additionalProperties: false,
};

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    store_name_en: { type: "string" },
    store_name_zh: { type: "string" },
    purchase_date: { type: "string" },
    total_amount: { type: "number" },
    items: { type: "array", items: ITEM_SCHEMA },
  },
  required: ["store_name_en", "store_name_zh", "purchase_date", "total_amount", "items"],
  additionalProperties: false,
};

interface ParsedItem {
  raw_name_en: string;
  raw_name_zh: string;
  quantity: number;
  unit_spec_value: number;
  unit_spec_unit: string;
  unit_price: number;
  original_price: number | null;
  is_promotion: boolean;
  subtotal: number;
  category: string;
  matched_product_id: string | null;
}

interface ParsedReceipt {
  store_name_en: string;
  store_name_zh: string;
  purchase_date: string;
  total_amount: number;
  items: ParsedItem[];
}

function buildPrompt(existingProducts: ExistingProduct[]): string {
  const productList =
    existingProducts.map((product) => `- ${product.id}: ${product.canonicalNameEn}`).join("\n") ||
    "(none yet)";

  return (
    "This is a grocery receipt from a New Zealand supermarket. Extract the store name, " +
    "purchase date, total amount, and each line item.\n" +
    "Translate the store name and each item's name into Chinese.\n" +
    "For each item, pick the single best-matching category from this fixed list " +
    "(never invent a new category): " +
    CATEGORY_NAMES.join(", ") +
    ".\n" +
    "Also compare each item's English name against this circle's existing standardized " +
    "products by semantic similarity; set matched_product_id to the matching id, or null " +
    "if it looks like a new product:\n" +
    productList
  );
}

export async function recognizeReceipt(
  params: RecognizeReceiptParams
): Promise<RecognizeReceiptResult> {
  const response = await anthropicClient.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: params.mediaType, data: params.imageBase64 },
          },
          { type: "text", text: buildPrompt(params.existingProducts) },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text block with the structured receipt data");
  }

  const parsed = JSON.parse(textBlock.text) as ParsedReceipt;

  return {
    receipt: {
      storeNameEn: parsed.store_name_en,
      storeNameZh: parsed.store_name_zh,
      purchaseDate: parsed.purchase_date,
      totalAmount: parsed.total_amount,
      items: parsed.items.map((item) => ({
        rawNameEn: item.raw_name_en,
        rawNameZh: item.raw_name_zh,
        quantity: item.quantity,
        unitSpecValue: item.unit_spec_value,
        unitSpecUnit: item.unit_spec_unit,
        unitPrice: item.unit_price,
        originalPrice: item.original_price,
        isPromotion: item.is_promotion,
        subtotal: item.subtotal,
        category: item.category,
        matchedProductId: item.matched_product_id,
      })),
    },
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
