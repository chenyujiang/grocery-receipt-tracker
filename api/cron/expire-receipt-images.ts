import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { isCronAuthorized } from "../_lib/cronAuth.js";
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

  if (!isCronAuthorized(req.headers.authorization)) {
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
      // Storage first, then the column, and only for the paths Storage reports
      // it deleted: a row keeps pointing at any image that may still be in the
      // bucket, so every later run tries it again. The other way round could
      // leave an image in the bucket that no receipt points to.
      //
      // The cost: Storage doesn't report an object that was already gone, so a
      // row whose update failed after its image was removed is never cleared,
      // and every run sends its path to remove() again. That's harmless (the UI
      // never renders the image) and rare (it takes a failed update).
      //
      // Any failure stops the run. Pages already done stay done, and the next
      // day's run picks up the rest.
      const paths = expired.map((image) => image.path);
      const { data: removed, error: removeError } = await supabaseAdmin.storage
        .from("receipts")
        .remove(paths);
      if (removeError) {
        res.status(500).json({ error: "Failed to delete expired images" });
        return;
      }
      const removedPaths = new Set(removed.map((object) => object.name));
      const clearedIds = expired
        .filter((image) => removedPaths.has(image.path))
        .map((image) => image.id);
      if (clearedIds.length > 0) {
        const { error: clearError } = await supabaseAdmin
          .from("receipts")
          .update({ original_image_url: null })
          .in("id", clearedIds);
        if (clearError) {
          res.status(500).json({ error: "Failed to clear expired image paths" });
          return;
        }
      }
      totalExpired += clearedIds.length;

      // A reported name that's none of the paths sent means Storage names
      // objects some other way. Its image is already gone, but its row can't be
      // matched, so it's never cleared and is never reported again. This 500
      // can't save the image; it's an alarm, so the run doesn't report success
      // while rows go stale. The rows that did match are cleared above first,
      // or they'd be stuck the same way.
      const sentPaths = new Set(paths);
      if (removed.some((object) => !sentPaths.has(object.name))) {
        res.status(500).json({ error: "Storage reported deleting unexpected paths" });
        return;
      }
    }

    // A short page is the last one.
    if (receiptRows.length < POSTGREST_PAGE_SIZE) {
      break;
    }
    lastId = receiptRows[receiptRows.length - 1].id;
  }

  res.status(200).json({ expiredImages: totalExpired });
}
