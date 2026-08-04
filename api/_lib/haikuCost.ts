// Section 3.1: Claude Haiku 4.5 pricing — $1.00/1M input tokens, $5.00/1M
// output tokens. Used to turn a single Claude call's actual usage into a
// dollar amount for ai_spend_limit.spent_usd.
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

const INPUT_PRICE_PER_MILLION = 1.0;
const OUTPUT_PRICE_PER_MILLION = 5.0;

export function calculateHaikuCost(usage: TokenUsage): number {
  const inputCost = (usage.input_tokens / 1_000_000) * INPUT_PRICE_PER_MILLION;
  const outputCost = (usage.output_tokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
