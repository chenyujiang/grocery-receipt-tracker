// Must match api/_lib/adminUsers.ts's DEFAULT_CAP_USD — the amount the server
// grants when the one-click action omits capUsd. Only used to label that button.
// Kept in its own import-free module, apart from adminApi.ts, so
// api/_lib/adminUsers.test.ts can import it and check the two still agree.
export const DEFAULT_GRANT_USD = 1;
