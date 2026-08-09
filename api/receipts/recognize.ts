import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { getAccessStatus, recordSuccess, FREE_TRIAL_LIMIT } from "../_lib/userAiAccess.js";
import { calculateHaikuCost } from "../_lib/haikuCost.js";
import { recognizeReceipt, type ExistingProduct } from "../_lib/recognizeReceipt.js";
import { saveDraftReceipt } from "../_lib/saveDraftReceipt.js";

// Section 3.2 (End-to-end data flow) + Section 8 (Product Matching):
// 1. Verify the caller's Supabase session and look up their circle.
// 2. Refuse if this caller's user_ai_access says they're out of allowance
//    (Section 16: one free call for a brand-new user, then a dollar cap
//    an admin grants — per-user, not the old circle-wide cap).
// 3. Store the uploaded image in a private Supabase Storage bucket.
// 4. Call Claude (claude-haiku-4-5) to OCR the receipt, translate
//    English -> Chinese, and suggest a product match, all in one call.
// 5. Record the call's actual cost against this caller's user_ai_access row.
// 6. Write the draft (status = "pending_review") to Supabase.
//
// Thin orchestration only — the actual logic lives in api/_lib/*, each
// already covered by its own tests against a mocked Supabase/Claude client.

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function isAllowedMediaType(value: unknown): value is AllowedMediaType {
  return typeof value === "string" && (ALLOWED_MEDIA_TYPES as readonly string[]).includes(value);
}

// Supabase's PostgrestError is a plain object (not an Error instance), so a
// bare `err instanceof Error` check missed it entirely and fell through to
// a generic message with no way to tell what actually failed.
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Failed to recognize receipt";
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

  // Issue 15: per-user access, checked before every Claude call — a brand
  // new user gets FREE_TRIAL_LIMIT free successful calls, then needs an
  // admin to grant them a real dollar-based credit; no auto-reset either way.
  const accessStatus = await getAccessStatus(user.id);
  if (!accessStatus.allowed) {
    const reason =
      accessStatus.mode === "trial"
        ? `You've already used all ${FREE_TRIAL_LIMIT} of your free AI recognitions.`
        : `AI recognition quota used up ($${accessStatus.spentUsd} of $${accessStatus.capUsd}).`;
    res.status(402).json({
      error: `${reason} Email nz.eason.chen@gmail.com to get credit assigned.`,
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
    await recordSuccess(user.id, cost);

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
    console.error("[api/receipts/recognize] failed:", err);
    res.status(500).json({ error: extractErrorMessage(err) });
  }
}
