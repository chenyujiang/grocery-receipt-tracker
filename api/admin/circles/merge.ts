import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireGlobalAdmin } from "../../_lib/requireGlobalAdmin.js";
import { mergeUsersIntoNewCircle } from "../../_lib/adminUsers.js";

// Admin dashboard: merge several standalone-circle users into one new
// circle (no invite-link flow exists, so this is how people end up sharing
// a circle instead).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireGlobalAdmin(req.headers.authorization);
  if (!auth.ok) {
    res.status(auth.status).json({});
    return;
  }

  const { userIds } = (req.body ?? {}) as { userIds?: unknown };
  if (!Array.isArray(userIds) || userIds.length < 2 || !userIds.every((id) => typeof id === "string")) {
    res.status(400).json({ error: "userIds must be an array of at least 2 user ids" });
    return;
  }

  try {
    const circleId = await mergeUsersIntoNewCircle(userIds);
    res.status(200).json({ circleId });
  } catch (err) {
    console.error("[api/admin/circles/merge] failed:", err);
    res.status(500).json({ error: "Failed to merge users into a circle" });
  }
}
