import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireGlobalAdmin } from "../../_lib/requireGlobalAdmin.js";
import { listAdminUsers } from "../../_lib/adminUsers.js";

// Issue 15: lists every user across every circle for the admin dashboard.
// Thin orchestration only — see api/_lib/adminUsers.ts for the actual logic
// and its tests, and api/_lib/requireGlobalAdmin.ts for the shared guard.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await requireGlobalAdmin(req.headers.authorization);
  if (!auth.ok) {
    res.status(auth.status).json({});
    return;
  }

  try {
    const users = await listAdminUsers();
    res.status(200).json({ users });
  } catch (err) {
    console.error("[api/admin/users] failed:", err);
    res.status(500).json({ error: "Failed to load users" });
  }
}
