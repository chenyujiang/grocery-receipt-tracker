// How many successful AI recognition calls a new user gets before an admin
// has to grant them credit. The one place it's defined: api/_lib/userAiAccess.ts
// passes it to reserve_ai_call, and the dashboard and Home's welcome banner
// show it. Import-free so the api project can import it (adminApi.ts pulls in
// supabaseClient.ts's import.meta.env, which tsconfig.api.json can't type).
export const FREE_TRIAL_LIMIT = 5;
