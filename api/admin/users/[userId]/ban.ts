import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireGlobalAdmin } from "../../../_lib/requireGlobalAdmin.js";
import { setUserBanned } from "../../../_lib/adminUsers.js";

// Issue 15 decision 5: ban/unban via Supabase Auth's own mechanism, driven
// by a boolean in the body (POST { banned: true|false }) rather than two
// separate ban/unban routes.
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

  const { userId } = req.query;
  if (typeof userId !== "string") {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const { banned } = (req.body ?? {}) as { banned?: unknown };
  if (typeof banned !== "boolean") {
    res.status(400).json({ error: "Missing boolean 'banned' in body" });
    return;
  }

  try {
    await setUserBanned(userId, banned);
    res.status(200).json({ userId, banned });
  } catch (err) {
    console.error("[api/admin/users/[userId]/ban] failed:", err);
    res.status(500).json({ error: "Failed to update ban status" });
  }
}
