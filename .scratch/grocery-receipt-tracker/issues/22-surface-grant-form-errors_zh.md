Type: bug
Status: resolved

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
