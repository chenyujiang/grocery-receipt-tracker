import { createClient } from "@supabase/supabase-js";

// Section 3.1: server-side only. Uses the service-role key (bypasses RLS),
// so this must never be imported from src/ or shipped to the client — only
// /api Serverless Functions may use it, e.g. to write Receipt/ReceiptItem
// rows on behalf of whichever user uploaded the image.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set them in the Vercel project's environment variables."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
