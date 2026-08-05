import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { getSpendStatus, recordSpend } from "../_lib/spendLimit.js";
import { calculateHaikuCost } from "../_lib/haikuCost.js";
import { recognizeReceipt, type ExistingProduct } from "../_lib/recognizeReceipt.js";
import { saveDraftReceipt } from "../_lib/saveDraftReceipt.js";

// Section 3.2 (End-to-end data flow) + Section 8 (Product Matching):
// 1. Verify the caller's Supabase session and look up their circle.
// 2. Refuse if the circle's ai_spend_limit is already at/over cap.
// 3. Store the uploaded image in a private Supabase Storage bucket.
// 4. Call Claude (claude-haiku-4-5) to OCR the receipt, translate
//    English -> Chinese, and suggest a product match, all in one call.
// 5. Add the call's actual cost onto ai_spend_limit.spent_usd.
// 6. Write the draft (status = "pending_review") to Supabase.
//
// Thin orchestration only — the actual logic lives in api/_lib/*, each
// already covered by its own tests against a mocked Supabase/Claude client.

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function isAllowedMediaType(value: unknown): value is AllowedMediaType {
  return typeof value === "string" && (ALLOWED_MEDIA_TYPES as readonly string[]).includes(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!accessToken) {
    res.status(401).json({ error: "Missing Authorization: Bearer <access_token> header" });
    return;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  const user = userData.user;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("circle_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    res.status(403).json({ error: "No circle found for this account" });
    return;
  }
  const circleId = profile.circle_id as string;

  const { imageBase64, mediaType } = (req.body ?? {}) as {
    imageBase64?: unknown;
    mediaType?: unknown;
  };
  if (typeof imageBase64 !== "string" || !imageBase64) {
    res.status(400).json({ error: "Missing imageBase64" });
    return;
  }
  if (!isAllowedMediaType(mediaType)) {
    res.status(400).json({ error: `mediaType must be one of ${ALLOWED_MEDIA_TYPES.join(", ")}` });
    return;
  }

  // Section 3.1: global hard-dollar cap, checked before every Claude call —
  // no auto-reset, a circle owner raises ai_spend_limit.cap_usd by hand.
  const spendStatus = await getSpendStatus();
  if (spendStatus.overCap) {
    res.status(402).json({
      error: `AI recognition quota used up ($${spendStatus.spentUsd} of $${spendStatus.capUsd}). Ask a circle owner to raise the cap.`,
    });
    return;
  }

  // Everything past this point can throw (a bad/oversized image, a Claude
  // API error, an unexpected Supabase failure) — without this, an uncaught
  // exception here becomes a bodyless platform 500 with no error message
  // for the client to show.
  try {
    const extension = mediaType.split("/")[1];
    const storagePath = `${circleId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("receipts")
      .upload(storagePath, Buffer.from(imageBase64, "base64"), { contentType: mediaType });
    if (uploadError) {
      res.status(500).json({ error: "Failed to store the receipt image" });
      return;
    }

    const { data: existingProductRows, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, canonical_name_en")
      .eq("circle_id", circleId);
    if (productsError) {
      res.status(500).json({ error: "Failed to load this circle's existing products" });
      return;
    }
    const existingProducts: ExistingProduct[] = (existingProductRows ?? []).map((row) => ({
      id: row.id,
      canonicalNameEn: row.canonical_name_en,
    }));

    const { receipt, usage } = await recognizeReceipt({ imageBase64, mediaType, existingProducts });

    const cost = calculateHaikuCost({
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });
    await recordSpend(cost);

    const { receiptId } = await saveDraftReceipt({
      circleId,
      // receipts.uploaded_by is `uuid references auth.users(id)`, not email —
      // RLS policies compare it against auth.uid() (see migration 000003).
      uploadedBy: user.id,
      originalImageUrl: storagePath,
      receipt,
    });

    res.status(200).json({ receiptId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to recognize receipt" });
  }
}
