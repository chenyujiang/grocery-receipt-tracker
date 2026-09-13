Type: bug
Status: ready-for-agent

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
