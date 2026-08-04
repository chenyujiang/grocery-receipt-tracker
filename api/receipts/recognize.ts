import type { VercelRequest, VercelResponse } from "@vercel/node";

// Section 3.2 (End-to-end data flow) + Section 8 (Product Matching):
// 1. Store the uploaded image in a private Supabase Storage bucket.
// 2. Call the Claude API (server-side only — the API key never reaches the
//    client) with model claude-haiku-4-5 to OCR the receipt and translate
//    English -> Chinese in one call.
// 3. Match each recognized `raw_name_en` against the circle's existing
//    Product list to produce a match suggestion.
// 4. Write the draft (status = "pending_review") to Supabase.
//
// This is a scaffold stub — the actual Claude call, Supabase writes, and
// matching logic are implementation work, not part of this scaffolding pass.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // TODO: before calling Claude, check the `ai_spend_limit` singleton row
  // (spent_usd >= cap_usd) and refuse with a clear error if the global $1
  // cap is already hit — no auto-reset, an owner raises cap_usd by hand.
  // TODO: read the uploaded image, store it in Supabase Storage (private bucket).
  // TODO: call the Claude API server-side (CLAUDE_API_KEY from env, model
  // claude-haiku-4-5, never sent to the client).
  // TODO: after the call, add its actual cost (usage.input_tokens/output_tokens
  // × Haiku 4.5 pricing) onto ai_spend_limit.spent_usd.
  // TODO: match raw_name_en against this circle's Product table (Section 8).
  // TODO: insert Receipt + ReceiptItem rows with status = "pending_review".

  res.status(501).json({ error: "Not implemented — scaffold only" });
}
