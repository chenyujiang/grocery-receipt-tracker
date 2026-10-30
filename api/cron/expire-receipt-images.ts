import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { parseBearerToken } from "../_lib/bearerToken.js";
import { POSTGREST_PAGE_SIZE } from "../../src/lib/postgrestPaging.js";

// Section 5.1 (ticket 39): original receipt images are deleted from Storage
// after a retention period; the receipt's structured data is kept forever.
// Wired up via vercel.json's cron config to run once a day.

// The spec's default. The clock is uploaded_at, when the image was stored,
// not purchase_date; a draft that was never confirmed expires the same way.
const IMAGE_RETENTION_MONTHS = 12;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Same access control as low-stock-check.ts (issue 19): the service-role
  // client deletes across every Circle, so the shared secret is the whole of
  // it, and an unset CRON_SECRET fails closed.
  const cronSecret = process.env.CRON_SECRET;
  const presentedSecret = parseBearerToken(req.headers.authorization);
  if (!cronSecret || presentedSecret !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - IMAGE_RETENTION_MONTHS);

  // Keyset paging over id, as in low-stock-check.ts (ticket 36): one read is
  // capped by PostgREST's max-rows, and a page's worth of paths is also
  // within Storage's limit for a single remove().
  let totalExpired = 0;
  let lastId: string | null = null;
  for (;;) {
    let query = supabaseAdmin
      .from("receipts")
      .select("id, original_image_url")
      .not("original_image_url", "is", null)
      .lt("uploaded_at", cutoff.toISOString())
      .order("id", { ascending: true })
      .limit(POSTGREST_PAGE_SIZE);
    if (lastId !== null) {
      query = query.gt("id", lastId);
    }
    const { data: receipts, error: readError } = await query;
    if (readError) {
      res.status(500).json({ error: "Failed to load receipts" });
      return;
    }

    const receiptRows = receipts ?? [];
    const expired = receiptRows.flatMap((receipt) =>
      receipt.original_image_url === null ? [] : [{ id: receipt.id, path: receipt.original_image_url }]
    );
    if (expired.length > 0) {
      // Storage first, then the column: if the update fails, the next run
      // removes the same (already gone) paths again and clears the column then.
      // Storage treats a missing object as removed. The other order could leave
      // an image in the bucket that no receipt points to.
      //
      // Either failure stops the run. Pages already done stay done, and the
      // next day's run picks up the rest.
      const { error: removeError } = await supabaseAdmin.storage
        .from("receipts")
        .remove(expired.map((image) => image.path));
      if (removeError) {
        res.status(500).json({ error: "Failed to delete expired images" });
        return;
      }
      const { error: clearError } = await supabaseAdmin
        .from("receipts")
        .update({ original_image_url: null })
        .in("id", expired.map((image) => image.id));
      if (clearError) {
        res.status(500).json({ error: "Failed to clear expired image paths" });
        return;
      }
    }
    totalExpired += expired.length;

    // A short page is the last one.
    if (receiptRows.length < POSTGREST_PAGE_SIZE) {
      break;
    }
    lastId = receiptRows[receiptRows.length - 1].id;
  }

  res.status(200).json({ expiredImages: totalExpired });
}
