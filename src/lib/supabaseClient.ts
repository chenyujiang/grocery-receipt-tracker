import { createClient } from "@supabase/supabase-js";

// Section 3: Supabase provides the database, auth, and storage.
// Only the publishable/anon key belongs on the client — the Claude API key
// stays server-side inside the /api serverless functions (see Section 3.1).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill them in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
