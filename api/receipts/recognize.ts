import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { parseBearerToken } from "../_lib/bearerToken.js";
import { reserveCall } from "../_lib/userAiAccess.js";
import { aiAccessRefusal } from "../_lib/aiAccessRefusal.js";
import { calculateHaikuCost } from "../_lib/haikuCost.js";
import { recognizeReceipt, type ExistingProduct } from "../_lib/recognizeReceipt.js";
import { saveDraftReceipt } from "../_lib/saveDraftReceipt.js";
import { RecognitionFailedError } from "../../src/lib/recognitionFailure.js";

// Section 3.2 (End-to-end data flow) + Section 8 (Product Matching):
// 1. Verify the caller's Supabase session and look up their circle.
// 2. Reserve a call against this caller's user_ai_access, or refuse if
//    they're out of allowance (Section 16: FREE_TRIAL_LIMIT free calls for a
//    brand-new user, then a dollar cap an admin grants — per-user, not the
//    old circle-wide cap). A reservation whose call fails is released.
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

// An Error's message is shown to the user: the ones thrown on this path were
// written for them (a photo that can't be read, a receipt too long to read in
// one go). Supabase's PostgrestError is a plain object (not an Error
// instance), and its message names tables, columns and constraints — so it,
// like anything else that isn't an Error, gets the generic message instead
// (ticket 38). The raw error is still logged by the caller.
//
// The frontend's errorMessage() in src/lib/errorMessage.ts is the same check
// for an Error, kept as a separate copy rather than a shared import — change
// both together. It deliberately still shows a PostgrestError's message: in
// the browser that's the user's own RLS/constraint failure, already visible
// to them in the network tab, and the only clue to what went wrong.
//
// The page shows its own translated fallback for any 5xx, so this text is
// for the network tab and debugging, not the user. Advice the user can act
// on goes out as a 422 RecognitionFailure code instead.
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Failed to recognize receipt";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const accessToken = parseBearerToken(req.headers.authorization);
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
  // Ticket 37: the check also reserves the call atomically, so concurrent
  // uploads can't all slip through on the last free call.
  const reservation = await reserveCall(user.id);
  if (!reservation.status.allowed) {
    res.status(402).json(aiAccessRefusal(reservation.status));
    return;
  }
  // Set once Claude has answered: from then on the call counts as spent, even
  // if saving the Draft fails afterwards. Until then, any exit hands the
  // reservation back (the Free Trial counts successful calls only).
  let claudeAnswered = false;
  // Set once the image is in the bucket. A failure after that deletes it again
  // (ticket 38) — otherwise it stays there with no receipt pointing at it.
  let storedPath: string | null = null;

  // Every failure response goes through here, so the hand-back is awaited
  // *before* the response is written — once it's sent, Vercel may freeze the
  // function and the release would never run. A failed hand-back is logged,
  // never allowed to replace the original error; worst case the user loses
  // one trial call. Deleting the stored image is best effort the same way:
  // worst case it's left orphaned in the bucket, as it always used to be.
  async function fail(status: number, body: { error: string } | { code: string }) {
    if (!claudeAnswered) {
      try {
        await reservation.release();
      } catch (releaseErr) {
        console.error("[api/receipts/recognize] failed to release reservation:", releaseErr);
      }
    }
    if (storedPath) {
      try {
        const { error: removeError } = await supabaseAdmin.storage.from("receipts").remove([storedPath]);
        if (removeError) {
          throw removeError;
        }
      } catch (removeErr) {
        console.error("[api/receipts/recognize] failed to delete the stored image:", removeErr);
      }
    }
    res.status(status).json(body);
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
      await fail(500, { error: "Failed to store the receipt image" });
      return;
    }
    storedPath = storagePath;

    const { data: existingProductRows, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, canonical_name_en")
      .eq("circle_id", circleId);
    if (productsError) {
      await fail(500, { error: "Failed to load this circle's existing products" });
      return;
    }
    const existingProducts: ExistingProduct[] = (existingProductRows ?? []).map((row) => ({
      id: row.id,
      canonicalNameEn: row.canonical_name_en,
    }));

    const { receipt, usage } = await recognizeReceipt({ imageBase64, mediaType, existingProducts });
    claudeAnswered = true;

    const cost = calculateHaikuCost({
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });
    await reservation.recordSpend(cost);

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
    if (err instanceof RecognitionFailedError) {
      await fail(422, { code: err.code });
      return;
    }
    await fail(500, { error: extractErrorMessage(err) });
  }
}
