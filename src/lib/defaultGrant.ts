// The amount a one-click grant sets the user's cap to. The one place it's
// defined: api/_lib/adminUsers.ts's grantCredit uses it as the default when
// capUsd is omitted, and the admin dashboard uses it to label that button.
// Import-free so the api project can import it (adminApi.ts pulls in
// supabaseClient.ts's import.meta.env, which tsconfig.api.json can't type).
export const DEFAULT_GRANT_USD = 1;
