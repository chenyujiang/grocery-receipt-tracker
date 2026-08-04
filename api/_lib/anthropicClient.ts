import Anthropic from "@anthropic-ai/sdk";

// Section 3.1: server-side only. The env var is named CLAUDE_API_KEY (not the
// SDK's default ANTHROPIC_API_KEY), so it must be passed explicitly.
const apiKey = process.env.CLAUDE_API_KEY;

if (!apiKey) {
  throw new Error(
    "Missing CLAUDE_API_KEY — set it in the Vercel project's environment variables."
  );
}

export const anthropicClient = new Anthropic({ apiKey });
