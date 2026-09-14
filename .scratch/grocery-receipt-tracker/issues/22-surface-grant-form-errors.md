Type: bug
Status: resolved
GitHub: #23

## Problem

The admin dashboard's custom-grant form loses both halves of a failed grant: it refuses bad input without saying so, and it swallows a failed request entirely.

`src/pages/AdminDashboard.tsx`'s Grant button bails on invalid input with a bare `return`:

```ts
const amount = parseFloat(customAmount);
if (Number.isNaN(amount) || amount <= 0) return;
```

The admin clicks Grant, nothing happens, no message, and the typed amount stays in the box — indistinguishable from a dead button.

`withBusy` has no `catch`:

```ts
async function withBusy(action: () => Promise<void>) {
  setBusy(true);
  try {
    await action();
    onChange();
  } finally {
    setBusy(false);
  }
}
```

So every rejection from `adminApi.ts` — grant, ban/unban, merge — becomes an unhandled promise rejection. The spinner stops, the list doesn't refresh, and the admin is told nothing.

The two combine on the one input `parseFloat` accepts but the backend now refuses: the literal text `Infinity` (and `1e400`, which parses to `Infinity`) passes the frontend's `NaN`/`<= 0` guard, reaches `grant-credit.ts`, comes back `400 { error: "capUsd must be a positive number" }` — and that message is never shown. Issue 21 deliberately made the backend honest about a mis-typed grant; the frontend currently discards the honesty.

This matters for the same reason issue 21 did: a grant is a reset, never a top-up (issue 15 decision 4), so an admin who can't tell a failed grant from a successful one may retry and zero a user's spend, or walk away believing a grant landed when it didn't.

## Fix

1. Give `UserCard` an error slot (component state + a rendered message) and show `errorMessage(err, …)` from `@/lib/errorMessage` — per CLAUDE.md, never a hand-rolled `err instanceof Error` check.
2. `catch` in `withBusy` and put the message in that slot, so ban/unban and merge failures surface too, not just grants.
3. Replace the silent `return` on invalid input with the same visible message rather than a no-op.
4. Have `adminApi.ts`'s helpers carry the server's `{ error }` body into the thrown error, so the backend's "capUsd must be a positive number" is what the admin reads. Check what `grantAdminCredit`/`setAdminUserBanned`/`mergeUsersIntoCircle` currently throw on a non-2xx before assuming.

Decide with the user whether the frontend should also reject non-finite input before the request (i.e. `Number.isFinite`, matching the backend) or let the 400 be the single source of truth — one guard or two, not two that disagree.

## Resolution

Points 1–3 done in `src/pages/AdminDashboard.tsx`. Point 4 needed no change: `authorizedFetch` already threw `new Error(body?.error ?? …)`, so the server's message was reaching the frontend all along — it was only being discarded by the missing `catch`.

The merge button lives on the page, not on a card, so it got its own `mergeError` slot rather than reusing the page's `error` state: `error` deliberately hides the whole roster, and a failed merge should leave the selection on screen to retry or adjust.

**Open question, decided: two guards that agree.** The frontend keeps a pre-request check. A frontend guard is needed regardless — an empty box or `abc` shouldn't cost a round-trip — so the choice was never really "one guard or two", only whether the two agree. They now do: the check is `Number.isFinite(amount) && amount > 0`, matching `grant-credit.ts` exactly. The wording differs on purpose: the admin reads "Enter a grant amount greater than 0.", while the backend's `capUsd must be a positive number` names a request field and is what surfaces if a bad amount ever reaches it anyway.

Parsing is `Number(text.trim())`, not `parseFloat`. `parseFloat` is the leniency the backend *cannot* cover: `parseFloat("5abc")` is `5`, so a typo would arrive as a perfectly valid request and reset the user's cap to an amount nobody typed — the exact failure this issue exists to close. `Number()` rejects the whole string instead.

Two limits worth recording rather than leaving implied:

- The per-user error is held by the page (`cardErrors`, keyed by user id), not by `UserCard`. A flagged user renders as *two* cards — once in the needs-attention queue, once in the circle roster — and card-local state would show the failure on the clicked copy while the other copy looked untouched.
- "The backend's message is what the admin reads" holds for the 400s, not for auth failures: `requireGlobalAdmin` rejections answer `res.status(auth.status).json({})` with no `error` key, so those surface as `Request failed with status 401`. That non-disclosure is deliberate and was left alone.

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

管理后台的自定义发放表单把失败的两半都弄丢了：输入非法时它一声不吭地拒绝，请求失败时它把错误整个吞掉。

`src/pages/AdminDashboard.tsx` 的 Grant 按钮遇到非法输入直接 `return`：

```ts
const amount = parseFloat(customAmount);
if (Number.isNaN(amount) || amount <= 0) return;
```

管理员点了 Grant，什么都没发生，没有任何提示，输入框里的金额还在——和按钮坏掉没有区别。

`withBusy` 没有 `catch`：

```ts
async function withBusy(action: () => Promise<void>) {
  setBusy(true);
  try {
    await action();
    onChange();
  } finally {
    setBusy(false);
  }
}
```

于是来自 `adminApi.ts` 的每一次拒绝——发放、封禁/解封、合并——都变成未处理的 promise rejection。加载状态结束了，列表没有刷新，管理员什么也不知道。

两者在唯一一种 `parseFloat` 接受、而后端现在会拒绝的输入上叠加：字面文本 `Infinity`（以及会被解析成 `Infinity` 的 `1e400`）能通过前端的 `NaN`/`<= 0` 检查，抵达 `grant-credit.ts`，带回 `400 { error: "capUsd must be a positive number" }`——而这条信息永远不会被显示。issue 21 特意让后端对输错的发放说实话，前端目前把这份实话丢掉了。

这件事要紧的理由和 issue 21 一样：发放永远是重置而非叠加充值（issue 15 决策 4）。分不清发放成功还是失败的管理员，可能重试一次而把用户的消费清零，也可能以为发放已经生效就此离开。

## 修法

1. 给 `UserCard` 一个错误位（组件 state + 渲染出来的提示），用 `@/lib/errorMessage` 的 `errorMessage(err, …)` 生成文案——按 CLAUDE.md 的规定，绝不自己手写 `err instanceof Error` 判断。
2. 在 `withBusy` 里 `catch`，把消息放进那个错误位，这样封禁/解封和合并的失败也能显示出来，而不只是发放。
3. 把非法输入时那个静默的 `return` 换成同一个可见提示，而不是什么都不做。
4. 让 `adminApi.ts` 的各个 helper 在非 2xx 时把服务端的 `{ error }` 内容带进抛出的错误里，使管理员读到的就是后端那句 "capUsd must be a positive number"。动手前先确认 `grantAdminCredit`/`setAdminUserBanned`/`mergeUsersIntoCircle` 目前在非 2xx 时到底抛的是什么。

需要和用户确认：前端是否也应在发请求前拒绝非有限数（即用 `Number.isFinite`，与后端一致），还是让那个 400 成为唯一的判定来源——可以是一道关卡也可以是两道，但不能是互相打架的两道。

## 处理结果

第 1–3 点已在 `src/pages/AdminDashboard.tsx` 中完成。第 4 点无需改动：`authorizedFetch` 本来就抛 `new Error(body?.error ?? …)`，服务端的消息一直都传到了前端——只是被那个缺失的 `catch` 丢掉了。

合并按钮位于页面上而非卡片内，因此单独给了它一个 `mergeError` 错误位，而没有复用页面的 `error` state：`error` 会刻意隐藏整个用户列表，而合并失败时应当把已选中的用户留在屏幕上，方便重试或调整。

**待定问题，结论：两道互相一致的关卡。** 前端保留请求前的校验。前端无论如何都需要一道关卡——空输入框或 `abc` 不该浪费一次往返——所以真正要选的从来不是「一道还是两道」，而是这两道是否一致。现在它们一致了：判断条件是 `Number.isFinite(amount) && amount > 0`，与 `grant-credit.ts` 完全相同。文案则是故意不同的：管理员读到的是 "Enter a grant amount greater than 0."，而后端那句 `capUsd must be a positive number` 点的是请求字段名，万一真有非法金额到了后端，显示出来的就是它。

解析用的是 `Number(text.trim())` 而非 `parseFloat`。`parseFloat` 的宽松正是后端**无法**兜住的那一类：`parseFloat("5abc")` 等于 `5`，于是一个笔误会变成一个完全合法的请求，把用户的额度重置成谁也没输入过的数字——恰恰是本 issue 要堵住的那种失败。`Number()` 则会整串拒绝。

另有两点限制，与其留作言外之意，不如写下来：

- 每个用户的错误消息由页面持有（`cardErrors`，以 user id 为键），而不是放在 `UserCard` 内部。一个被标记的用户会渲染成**两张**卡片——一张在「需要关注」队列里，一张在圈子名单里——若用卡片本地 state，失败只会显示在被点击的那张上，另一张看上去像什么都没发生。
- 「管理员读到的就是后端的消息」只对那些 400 成立，对鉴权失败不成立：`requireGlobalAdmin` 被拒时返回的是 `res.status(auth.status).json({})`，没有 `error` 字段，所以这类失败显示为 `Request failed with status 401`。这种不透露信息是刻意的，未作改动。
