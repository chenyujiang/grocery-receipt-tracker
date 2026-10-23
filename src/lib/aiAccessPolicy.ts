// The two numbers issue 15's AI Access model turns on, kept together and
// defined only here. Import-free so the api project can import it
// (adminApi.ts pulls in supabaseClient.ts's import.meta.env, which
// tsconfig.api.json can't type).

// How many successful AI recognition calls a new user gets before an admin
// has to grant them credit. api/_lib/userAiAccess.ts passes it to
// reserve_ai_call, and the dashboard and Home's welcome banner show it.
export const FREE_TRIAL_LIMIT = 5;

// The amount a one-click grant sets the user's cap to. api/_lib/adminUsers.ts's
// grantCredit uses it as the default when capUsd is omitted, and the admin
// dashboard uses it to label that button.
export const DEFAULT_GRANT_USD = 1;
