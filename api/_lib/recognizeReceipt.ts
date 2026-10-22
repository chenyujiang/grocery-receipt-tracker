import { anthropicClient } from "./anthropicClient.js";
import { CATEGORIES } from "../../src/types/index.js";

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

// Ticket 35: each line item costs ~150 output tokens (names in two languages
// plus nine fields), so 4096 cut off a shop of a few dozen lines. Output is
// billed per token actually generated, so the headroom itself costs nothing.
const MAX_OUTPUT_TOKENS = 16000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    "if it looks like a new product. A promotional/on-special item is still the same " +
    "underlying product as its regular-price counterpart — ignore promo wording ('was $X " +
    "now $Y', 'special', 'clearance', etc.) when matching, so it lands on the same " +
    "matched_product_id (and therefore the same category) instead of being treated as a " +
    "new product:\n" +
    productList
  );
}

export async function recognizeReceipt(
  params: RecognizeReceiptParams
): Promise<RecognizeReceiptResult> {
  const response = await anthropicClient.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_OUTPUT_TOKENS,
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

  // Cut off mid-object, the JSON would only fail to parse with a message no
  // one can act on.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "This receipt is too long to read in one go — try photographing it in two halves."
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text block with the structured receipt data");
  }

  const parsed = JSON.parse(textBlock.text) as ParsedReceipt;

  // Claude's JSON schema constrains shape, not content — an unreadable or
  // non-receipt photo can still satisfy it with an empty/garbage
  // purchase_date, which then fails at the database layer with a cryptic
  // "invalid input syntax for type date" instead of a message anyone can
  // act on. Catch it here instead, before it ever reaches saveDraftReceipt.
  if (!DATE_PATTERN.test(parsed.purchase_date) || parsed.items.length === 0) {
    throw new Error(
      "Couldn't read this as a grocery receipt — no valid date or line items found. Try a clearer photo of the whole receipt."
    );
  }

  // Ticket 34: the schema only makes matched_product_id a string, so an id
  // the prompt never offered would fail receipt_items' foreign key after the
  // call was already charged. Treat it as a new product instead; the user can
  // re-link it on the review page.
  const offeredIds = new Set(params.existingProducts.map((product) => product.id));

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
        matchedProductId:
          item.matched_product_id !== null && offeredIds.has(item.matched_product_id)
            ? item.matched_product_id
            : null,
      })),
    },
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
