import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireGlobalAdmin } from "../../../_lib/requireGlobalAdmin.js";
import { grantCredit } from "../../../_lib/adminUsers.js";

// Issue 15 decision 4: always a reset to a fresh allowance — $1 by default,
// or a custom amount if the admin provides one in the request body.
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

  // Absent means "reset to the default"; present-but-unusable is a typo, and
  // since a grant is a reset, defaulting it would quietly cap the user at $1.
  const { capUsd } = (req.body ?? {}) as { capUsd?: unknown };
  let resolvedCapUsd: number | undefined;
  if (capUsd !== undefined) {
    if (typeof capUsd !== "number" || !Number.isFinite(capUsd) || capUsd <= 0) {
      res.status(400).json({ error: "capUsd must be a positive number" });
      return;
    }
    resolvedCapUsd = capUsd;
  }

  try {
    await grantCredit(userId, resolvedCapUsd);
    res.status(200).json({ userId });
  } catch (err) {
    console.error("[api/admin/users/[userId]/grant-credit] failed:", err);
    res.status(500).json({ error: "Failed to grant credit" });
  }
}
