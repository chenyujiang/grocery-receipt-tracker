Type: bug
Status: ready-for-agent

## 问题

`api/cron/low-stock-check.ts` 既没有请求方法检查，也没有调用方检查。`api/` 下其他每一个路由要么要求 `Bearer` token（`receipts/recognize.ts`），要么在服务端重新校验 `global_admins`（`api/admin/*`）；唯独这一个是敞开的。任何知道该 URL 的人都能触发对**所有 Circle** 商品的全量扫描——它用 `supabaseAdmin` 读取，因此 RLS 拦不住——并能反复地在整个数据库范围内插入 Alert、翻转 `low_stock_alert_active`。

影响范围有限（只写入 Alert 和一个布尔值，单次运行大体幂等），但这毕竟是一条跨所有租户数据的、无需认证的写入路径，而且可以被反复轰击。

在为 `api/cron/low-stock-check.test.ts` 补 handler 测试时发现。目前测试只是把现状**特征化**下来，并附有明确的 `CHARACTERIZATION, NOT ENDORSEMENT` 注释：

```ts
it.each(["GET", "POST", "DELETE"])("currently runs for an unauthenticated %s", …)
```

## 修法

当项目环境变量中设置了 `CRON_SECRET` 时，Vercel Cron 会带上 `Authorization: Bearer $CRON_SECRET`。因此：

1. 非 `GET` 一律返回 405，与其他路由保持一致。
2. 将 `Authorization` 头与 `process.env.CRON_SECRET` 比对，不符则 401。
3. 若 `CRON_SECRET` 未设置，应**拒绝**而不是跳过检查——生产环境里没设置这个 secret，正是本项防护要挡的情况。
4. 把那三条特征化测试换成它们的反面（非 GET 返回 405，secret 缺失/错误返回 401，正确时返回 200），并删掉 `CHARACTERIZATION` 注释。

需要在 Vercel 项目环境变量中添加 `CRON_SECRET`，并同步到 `README.md` / `README_zh.md` 的环境变量清单。
