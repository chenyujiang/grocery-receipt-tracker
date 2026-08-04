import { describe, it, expect, vi, beforeEach } from "vitest";

// Anthropic is the external system boundary — mock it here, not the
// behavior we're testing (Section 6/8/9: OCR + translation + categorization
// + product-match suggestion, all in one call).
vi.mock("./anthropicClient", () => ({
  anthropicClient: {
    messages: { create: vi.fn() },
  },
}));

import { anthropicClient } from "./anthropicClient";
import { recognizeReceipt } from "./recognizeReceipt";

function mockClaudeResponse(parsed: unknown, usage = { input_tokens: 1200, output_tokens: 300 }) {
  vi.mocked(anthropicClient.messages.create).mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(parsed) }],
    usage,
  } as never);
}

const SAMPLE_PARSED = {
  store_name_en: "Countdown Newmarket",
  store_name_zh: "倒数超市 Newmarket 店",
  purchase_date: "2026-08-01",
  total_amount: 12.5,
  items: [
    {
      raw_name_en: "Anchor Blue Milk 2L",
      raw_name_zh: "安科蓝带牛奶 2升",
      quantity: 1,
      unit_spec_value: 2,
      unit_spec_unit: "L",
      unit_price: 4.5,
      original_price: null,
      is_promotion: false,
      subtotal: 4.5,
      category: "Food - Dairy & Bakery",
      matched_product_id: "product-1",
    },
  ],
};

describe("recognizeReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps Claude's structured response into the receipt result and usage", async () => {
    mockClaudeResponse(SAMPLE_PARSED);

    const result = await recognizeReceipt({
      imageBase64: "base64-image-data",
      mediaType: "image/jpeg",
      existingProducts: [{ id: "product-1", canonicalNameEn: "Anchor Blue Milk" }],
    });

    expect(result.receipt.storeNameEn).toBe("Countdown Newmarket");
    expect(result.receipt.totalAmount).toBe(12.5);
    expect(result.receipt.items).toHaveLength(1);
    expect(result.receipt.items[0]).toEqual({
      rawNameEn: "Anchor Blue Milk 2L",
      rawNameZh: "安科蓝带牛奶 2升",
      quantity: 1,
      unitSpecValue: 2,
      unitSpecUnit: "L",
      unitPrice: 4.5,
      originalPrice: null,
      isPromotion: false,
      subtotal: 4.5,
      category: "Food - Dairy & Bakery",
      matchedProductId: "product-1",
    });
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
  });

  it("calls Haiku 4.5 with the image and a JSON-schema structured output format", async () => {
    mockClaudeResponse(SAMPLE_PARSED);

    await recognizeReceipt({
      imageBase64: "base64-image-data",
      mediaType: "image/png",
      existingProducts: [],
    });

    const call = vi.mocked(anthropicClient.messages.create).mock.calls[0][0] as never as {
      model: string;
      output_config: { format: { type: string } };
      messages: Array<{ content: Array<{ type: string; source?: { media_type: string; data: string } }> }>;
    };

    expect(call.model).toBe("claude-haiku-4-5");
    expect(call.output_config.format.type).toBe("json_schema");
    const imageBlock = call.messages[0].content.find((block) => block.type === "image");
    expect(imageBlock?.source).toEqual({
      type: "base64",
      media_type: "image/png",
      data: "base64-image-data",
    });
  });

  it("includes the circle's existing products in the prompt so Claude can suggest a match", async () => {
    mockClaudeResponse(SAMPLE_PARSED);

    await recognizeReceipt({
      imageBase64: "base64-image-data",
      mediaType: "image/jpeg",
      existingProducts: [{ id: "product-42", canonicalNameEn: "Vogel's Bread" }],
    });

    const call = vi.mocked(anthropicClient.messages.create).mock.calls[0][0] as never as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const textBlock = call.messages[0].content.find((block) => block.type === "text");

    expect(textBlock?.text).toContain("product-42");
    expect(textBlock?.text).toContain("Vogel's Bread");
  });
});
