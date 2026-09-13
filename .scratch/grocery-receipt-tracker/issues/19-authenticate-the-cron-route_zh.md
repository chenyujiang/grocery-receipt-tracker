Type: bug
Status: resolved

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

## 解决情况

四步全部落实在 `api/cron/low-stock-check.ts` 及其测试里：

- 非 `GET` 返回 405，与 `receipts/recognize.ts` 保持一致。
- 把 `Authorization: Bearer <secret>` 与 `process.env.CRON_SECRET` 比对；缺失、格式不对或不匹配一律 401。
- `CRON_SECRET` 未设置时拒绝所有调用方，而不是跳过检查。
- `CHARACTERIZATION, NOT ENDORSEMENT` 那段已删除。`"currently runs for an unauthenticated %s"` 被换成了它的反面：`POST`/`DELETE`/`PUT` 返回 405，密钥缺失或错误返回 401，环境变量未设置时返回 401，携带正确密钥的 `GET` 返回 200。每个拒绝用例还会断言 `supabaseAdmin.from` 从未被调用过——一个先扫完所有 Circle 再返回 401 的路由，该造成的破坏早就造成了。

`CRON_SECRET` 已写入 `.env.example`、`README.md` 和 `README_zh.md`。

**仍需人工操作**：把 `CRON_SECRET` 加到 Vercel 项目的环境变量里。在生产环境设置好之前，定时任务会一直失败关闭（fail closed），不会产生任何库存提醒——失败关闭是有意为之，但这也意味着这次部署是一个两步操作。
