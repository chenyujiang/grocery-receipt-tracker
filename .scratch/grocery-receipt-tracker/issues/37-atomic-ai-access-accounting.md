Type: bug
Status: ready-for-agent
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
