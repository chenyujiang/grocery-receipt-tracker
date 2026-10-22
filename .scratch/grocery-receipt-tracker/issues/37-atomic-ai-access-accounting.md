Type: bug
Status: resolved
GitHub: #41

## Problem

Per-user AI access (`api/_lib/userAiAccess.ts`) is check-then-act on both ends:

- `api/receipts/recognize.ts` calls `getAccessStatus` **before** the Claude call. Several uploads started at once by the same user all pass the check, so a user with one free call left can make several, or overshoot their dollar cap.
- `recordSuccess` reads the current count/spend and writes back `old + delta`. Two concurrent successes can both read the same value, so one increment is lost.

The code comments already accept this as a tradeoff at family scale, and the real-world exposure is small. It's filed so the gap is on record and not rediscovered later.

## Fix

Do both the check and the increment in the database, atomically. One Postgres function, called via RPC, that reserves a call (`update … set free_trial_calls_used = free_trial_calls_used + 1 where … < limit returning …`) before the Claude call, plus an atomic `spent_usd = spent_usd + cost` afterwards. Keep the issue 15 rules intact: count-based trial, dollar-based cap, no automatic reset or raise.

## Tests

- Two concurrent requests from a user with one trial call left → exactly one is allowed.
- Two concurrent successes → both increments land.

## Answer

Done as proposed, with three Postgres functions instead of one, in `supabase/migrations/20261022000001_atomic_ai_access.sql`:

- `reserve_ai_call(p_user_id uuid, p_free_trial_limit integer)` returns one row `(allowed, mode, free_trial_calls_used, cap_usd, spent_usd)`. It first makes sure the user has a row (`insert … on conflict do nothing`, so a brand-new user's row exists to lock). In trial mode it reserves the call with `update … set free_trial_calls_used = free_trial_calls_used + 1 where cap_usd is null and free_trial_calls_used < p_free_trial_limit`. In dollar-cap mode it only checks `spent_usd < cap_usd`. The limit is passed in from `FREE_TRIAL_LIMIT`, so it still has one source of truth.
- `release_ai_call(p_user_id uuid)` hands a trial reservation back (`- 1`, only while `cap_usd is null` and the count is above 0).
- `record_ai_spend(p_user_id uuid, p_cost_usd numeric)` does `spent_usd = spent_usd + p_cost_usd` in dollar-cap mode, and refuses a negative cost.

All three are SECURITY DEFINER with `set search_path = ''`, and execute is granted to `service_role` only (revoked from public, anon and authenticated), the same lockdown as `merge_users_into_new_circle`. `src/types/database.types.ts` has the new `Functions` entries.

`api/_lib/userAiAccess.ts` is still the seam. `getAccessStatus` is replaced by `reserveCall(userId)`, which returns the same `AccessStatus` shape, so `aiAccessRefusalMessage` is unchanged. `releaseReservation(userId, mode)` and `recordSuccess(userId, mode, costUsd)` take the mode `reserveCall` returned. `api/receipts/recognize.ts` reserves before the upload. It releases the reservation in a `finally` on every exit before Claude answers: a failed upload, a failed products lookup, or a failed Claude call or parse. Once Claude has answered, the call counts as spent, even if saving the Draft fails (same line as before). If the release itself fails, it is logged and the user's original error response stands.

**How concurrency is handled.** It isn't tested in vitest; the tests mock `.rpc`. It comes from the SQL: every change to a user's balance is a single `UPDATE … WHERE <condition>` on that user's one row. A second concurrent UPDATE on the same row waits for the first to commit, then Postgres (READ COMMITTED) re-checks its WHERE against the new row. So two concurrent requests with one trial call left: the first takes the count to 5, the second's `free_trial_calls_used < 5` no longer matches, and it is refused. Two concurrent `spent_usd = spent_usd + cost` updates both land, because neither reads a value in app code first. The ticket's two test cases are therefore guaranteed by Postgres row locking, not checked by a unit test.

**Residual overshoot (dollar-cap mode only).** The trial is exact: never more than `FREE_TRIAL_LIMIT` successful calls. The dollar cap can't be reserved ahead, because a call's cost is only known when it returns. Every call that starts while `spent_usd < cap_usd` is allowed, so spend can end above the cap. The bound is the cost of the calls in flight when the cap is crossed: at most `k × (one call's maximum cost)`, where `k` is the number of that user's concurrent uploads. One Haiku 4.5 call with `max_tokens: 4096` costs at most about $0.02 in output, plus input (the image and the circle's product list), so a few cents per concurrent upload. Sequential use could already overshoot by one call's cost before this change. No reset or raise was added. The next call after the cap is crossed is refused until an admin grants credit.

**Not yet applied live.** The migration file is written and committed but has **not** been applied to the Supabase project. Apply it before deploying this code, because the new `recognize` route calls these RPCs.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

按用户的 AI 额度（`api/_lib/userAiAccess.ts`）在检查和记账两头都是"先检查、再操作"：

- `api/receipts/recognize.ts` 在调用 Claude **之前**调 `getAccessStatus`。同一个用户同时发起几次上传，都能通过检查，所以只剩一次免费额度的用户能用掉好几次，或者超出美元上限。
- `recordSuccess` 先读出当前次数或花费，再写回"旧值 + 增量"。两次并发成功可能读到同一个旧值，于是少记一次。

代码注释里已经说明，在家庭规模下这是可以接受的取舍，实际影响很小。记成 ticket 是为了留个记录，免得以后再重新发现一遍。

## 修复

把检查和加数都放进数据库原子完成。写一个通过 RPC 调用的 Postgres 函数：调用 Claude 之前先预占一次额度（`update … set free_trial_calls_used = free_trial_calls_used + 1 where … < limit returning …`），调用之后再原子地执行 `spent_usd = spent_usd + cost`。保持 issue 15 的规则不变：试用按次数计、额度按美元计、不自动重置也不自动提高。

## 测试

- 只剩一次试用额度的用户同时发两次请求 → 只有一次被允许。
- 两次并发成功 → 两次增量都记上。

## 答案

按上面的方案做完了，只是拆成了三个 Postgres 函数而不是一个，放在 `supabase/migrations/20261022000001_atomic_ai_access.sql`：

- `reserve_ai_call(p_user_id uuid, p_free_trial_limit integer)` 返回一行 `(allowed, mode, free_trial_calls_used, cap_usd, spent_usd)`。它先确保这个用户有一行（`insert … on conflict do nothing`，这样全新用户也有一行可以加锁）。试用模式下用 `update … set free_trial_calls_used = free_trial_calls_used + 1 where cap_usd is null and free_trial_calls_used < p_free_trial_limit` 预占这一次。美元额度模式下只检查 `spent_usd < cap_usd`。上限由 `FREE_TRIAL_LIMIT` 传进来，所以仍然只有一个出处。
- `release_ai_call(p_user_id uuid)` 归还一次试用预占（`- 1`，只在 `cap_usd is null` 且次数大于 0 时生效）。
- `record_ai_spend(p_user_id uuid, p_cost_usd numeric)` 在美元额度模式下执行 `spent_usd = spent_usd + p_cost_usd`，拒绝负数花费。

三个函数都是 SECURITY DEFINER，带 `set search_path = ''`，execute 只授权给 `service_role`（从 public、anon、authenticated 收回），和 `merge_users_into_new_circle` 的锁法一样。`src/types/database.types.ts` 加了对应的 `Functions` 条目。

`api/_lib/userAiAccess.ts` 仍然是那个接缝。`getAccessStatus` 换成了 `reserveCall(userId)`，返回同样的 `AccessStatus` 结构，所以 `aiAccessRefusalMessage` 不用改。`releaseReservation(userId, mode)` 和 `recordSuccess(userId, mode, costUsd)` 接收 `reserveCall` 返回的 mode。`api/receipts/recognize.ts` 在上传图片之前预占。在 Claude 返回结果之前的每一种退出路径上，它都在 `finally` 里归还预占：图片存储失败、商品查询失败、Claude 调用或解析失败。Claude 一旦返回结果，这次调用就算用掉了，即使后面保存草稿失败也一样（和以前的界线相同）。如果归还本身失败，只记日志，用户收到的原始错误响应不变。

**并发是怎么保证的。** vitest 里没法测，测试只 mock 了 `.rpc`。保证来自 SQL：对用户额度的每一次修改，都是针对这个用户唯一那一行的一条 `UPDATE … WHERE <条件>`。同一行上的第二个并发 UPDATE 会等第一个提交，然后 Postgres（READ COMMITTED）拿新版本的行重新检查 WHERE。所以只剩一次试用额度时同时来两个请求：第一个把次数加到 5，第二个的 `free_trial_calls_used < 5` 不再成立，被拒绝。两个并发的 `spent_usd = spent_usd + cost` 都会记上，因为谁都没有先在应用代码里读旧值。所以 ticket 里的两个测试场景是由 Postgres 行锁保证的，而不是由单元测试检查的。

**剩余的超额（只在美元额度模式）。** 试用是精确的：成功调用永远不会超过 `FREE_TRIAL_LIMIT` 次。美元上限没法提前预占，因为一次调用的花费要等它返回才知道。只要开始时 `spent_usd < cap_usd`，调用就会被允许，所以花费最后可能超过上限。上界是越过上限那一刻正在进行的调用的花费：最多 `k × 单次调用的最高花费`，`k` 是这个用户同时进行的上传数。一次 Haiku 4.5 调用（`max_tokens: 4096`）输出最多约 $0.02，再加上输入（图片和圈子的商品列表），所以每个并发上传大约几美分。改之前，即使是顺序使用，也本来就可能超出一次调用的花费。没有加任何重置或提高逻辑。越过上限后的下一次调用会被拒绝，直到管理员分配额度。

**还没应用到线上。** 迁移文件已经写好并提交，但**还没有**应用到 Supabase 项目。部署这份代码之前要先应用它，因为新的 `recognize` 路由会调用这些 RPC。
