Type: task
Status: resolved
GitHub: #47

## Problem

spec.md Section 5.1 says original receipt images are "stored in Supabase Storage and auto-deleted after 12 months by default (only the images are cleared; structured data is kept forever)", and lists `original_image_url` as "cleared after retention period". Nothing does this. `vercel.json` schedules only `/api/cron/low-stock-check`, so every photo stays in the private `receipts` bucket forever.

Images are only deleted today when a receipt is deleted (`deleteReceipt` in `src/lib/receipts.ts`) or when recognition fails after the upload (ticket 38).

## Plan: a second daily cron

New route `api/cron/expire-receipt-images.ts`, scheduled in `vercel.json` once a day, at a different hour from the low-stock check.

1. **Auth**: same as `low-stock-check.ts`. `GET` only. `Authorization: Bearer $CRON_SECRET` must match, and an unset `CRON_SECRET` fails closed (401). The route uses the service-role client across every Circle, so the secret is its only access control.
2. **What expires**: receipts with `original_image_url is not null` and `uploaded_at` more than 12 months before now. The clock is `uploaded_at`, because that is when the image was stored; `purchase_date` is when the shopping happened. Status doesn't matter: a draft that was never confirmed loses its image too. The 12 months is a named constant in the route, since the spec calls it a default.
3. **Paging**: keyset over `id`, `POSTGREST_PAGE_SIZE` rows a page, as in ticket 36. One page of paths is also within Storage's limit for one `remove()` call (1000).
4. **Order, per page**: first `storage.from("receipts").remove(paths)`, then `update receipts set original_image_url = null where id in (page ids)`. If the update fails after the remove, the next run removes the same paths again. Storage treats a missing object as already removed, so the re-run is safe and nulls the column. The reverse order would leave images in the bucket that no row points to. *(Amended after code review: see the Answer. Only paths `remove()` reports deleted are cleared, so a row like this is never cleared.)*
5. **Failure**: stop at the first failed remove or update and return 500 with a generic message. Pages already done stay done, and the next day's run picks up the rest.
6. **Response**: `200 { expiredImages: N }`.

Structured data is untouched: only the object in the bucket and the one column change. The UI never shows the stored image (`originalImageUrl` is read but not rendered), so nothing on screen changes.

Out of scope: objects in the bucket that no receipt points to (from before ticket 38). They would need a bucket listing, not a receipts query.

## Seams under test

- The route handler, `api/cron/expire-receipt-images.ts`, with `supabaseAdmin` faked by `installFakeSupabase` as in `low-stock-check.test.ts`, and the clock fixed with fake timers.

## Answer

Done as planned. `api/cron/expire-receipt-images.ts` runs daily at 03:00 UTC (`vercel.json`; the low-stock check stays at 00:00). The cutoff is `IMAGE_RETENTION_MONTHS` (12) calendar months before now, in UTC. Each page removes its paths from the `receipts` bucket, then sets `original_image_url` to null for the ids whose paths `remove()` reports deleted; a failed read, remove, or update returns 500 and stops, and a failed remove leaves the column set so the next run retries it. A `remove()` that reports a name that is none of the paths sent also returns 500, since that would mean Storage names objects some other way and nothing is ever cleared. Success returns `200 { expiredImages: N }`, counting only the cleared rows. CRON_SECRET checking is shared with the low-stock cron as `isCronAuthorized` in `api/_lib/cronAuth.ts`.

Tests in `api/_lib/cronAuth.test.ts`: the right secret passes; no secret, a wrong one, or `CRON_SECRET` unset fails. Tests in `api/cron/expire-receipt-images.test.ts` (with `isCronAuthorized` mocked): 405 for non-GET; 401 when it refuses; the read's filters (image present, `uploaded_at` before the cutoff); remove then clear, in that order; clearing only what Storage reports deleted; paging past a full page; and the four failures.

Amendment to Plan 4, from code review: clearing every id on the page trusted Storage to have deleted every path it was given. A path `remove()` doesn't report keeps its row set instead, so every later run tries it again. The cost: Storage doesn't report an object that was already gone, so a row whose update failed after its image was removed is never cleared. It matches the read every day, and every run sends its path to `remove()` again, which reports nothing. That is harmless (the UI never renders the image), rare (it takes a failed update), and preferred to an image left in the bucket that no row points to.

Not checked by the tests: that live PostgREST applies the filters as written; that each object `remove()` returns has the full path (`circle/file.jpg`) as its `name` (if not, the run fails with 500 rather than silently clearing nothing); and that `remove()` succeeds, reporting nothing, for a path already gone (if it errors instead, a row stuck as above would fail its page every day). Check all three on the first live run that has something to expire (the oldest receipts date from August 2026, so not before August 2027).

---

> **中文版**（上方为英文原文；两者不一致时以英文为准）

## 问题

spec.md 第 5.1 节规定，小票原图"存在 Supabase Storage 里，默认 12 个月后自动删除（只清图片，结构化数据永久保留）"，并把 `original_image_url` 写作"保留期过后清空"。目前没有任何代码做这件事。`vercel.json` 里只排了 `/api/cron/low-stock-check`，所以每张照片都会永远留在私有的 `receipts` bucket 里。

现在只有两种情况会删图片：删除小票时（`src/lib/receipts.ts` 里的 `deleteReceipt`），以及上传之后识别失败时（ticket 38）。

## 方案：再加一个每天跑的 cron

新建路由 `api/cron/expire-receipt-images.ts`，在 `vercel.json` 里排成每天一次，时间和库存检查错开。

1. **鉴权**：和 `low-stock-check.ts` 一样。只接受 `GET`。`Authorization: Bearer $CRON_SECRET` 必须匹配；`CRON_SECRET` 没设置时直接拒绝（401）。这个路由用 service-role client 处理所有 Circle，所以这个密钥就是它全部的访问控制。
2. **哪些过期**：`original_image_url is not null`，并且 `uploaded_at` 早于当前时间 12 个月以上的小票。按 `uploaded_at` 算，因为那是图片存进来的时间；`purchase_date` 只是购物的日期。不看状态：一直没确认的草稿也会被清掉图片。12 个月写成路由里的一个具名常量，因为 spec 说的是"默认"。
3. **分页**：按 `id` 做 keyset 分页，每页 `POSTGREST_PAGE_SIZE` 行，和 ticket 36 一样。一页的路径数量也在 Storage 单次 `remove()` 的上限（1000）以内。
4. **每页的顺序**：先 `storage.from("receipts").remove(paths)`，再 `update receipts set original_image_url = null where id in (本页 id)`。如果 remove 成功后 update 失败，下次运行会再 remove 一遍同样的路径。Storage 把不存在的对象当作已删除，所以重跑是安全的，并且会把这一列清空。反过来的顺序会在 bucket 里留下没有任何行指向的图片。*（code review 后已修订，见结论：只置空 `remove()` 报告已删除的路径，所以这样的行永远不会被置空。）*
5. **失败**：遇到第一次 remove 或 update 失败就停下，返回 500 和一条通用错误信息。已经处理完的页保持不变，剩下的第二天再跑。
6. **响应**：`200 { expiredImages: N }`。

结构化数据不动：只删 bucket 里的对象，并清空这一列。UI 从来不显示存下的图片（`originalImageUrl` 读出来了但没有渲染），所以页面上看不出变化。

不在范围内：bucket 里没有任何小票指向的对象（ticket 38 之前留下的）。处理它们需要列出 bucket 内容，而不是查 receipts 表。

## 测试的 seam

- 路由 handler `api/cron/expire-receipt-images.ts`。和 `low-stock-check.test.ts` 一样，用 `installFakeSupabase` 伪造 `supabaseAdmin`，并用 fake timers 固定时间。

## 结论

按方案完成。`api/cron/expire-receipt-images.ts` 每天 UTC 03:00 运行（`vercel.json`；库存检查仍在 00:00）。截止时间是当前时间往前 `IMAGE_RETENTION_MONTHS`（12）个自然月，按 UTC 算。每一页先从 `receipts` bucket 删掉这些路径，再把 `remove()` 报告已删除的那些路径对应的 id 的 `original_image_url` 置空；读取、remove 或 update 任何一步失败都返回 500 并停止，remove 失败时这一列保持原值，下次运行会重试。如果 `remove()` 报告了一个不在送去路径里的名字，也返回 500，因为那意味着 Storage 用别的方式命名对象，什么都不会被置空。成功时返回 `200 { expiredImages: N }`，只计入被置空的行。CRON_SECRET 校验和库存 cron 共用，是 `api/_lib/cronAuth.ts` 里的 `isCronAuthorized`。

测试在 `api/_lib/cronAuth.test.ts`：正确的密钥通过；没带密钥、密钥错误、或 `CRON_SECRET` 未设置都不通过。测试在 `api/cron/expire-receipt-images.test.ts`（mock 掉 `isCronAuthorized`）：非 GET 返回 405；它拒绝时返回 401；读取的过滤条件（有图片、`uploaded_at` 早于截止时间）；先 remove 再置空，顺序不能反；只置空 Storage 报告已删除的；超过一整页时继续翻页；以及四种失败情况。

对方案第 4 条的修订（来自 code review）：把整页 id 都置空，等于相信 Storage 删掉了给它的每一条路径。现在 `remove()` 没报告的路径，对应的行保持原值，以后每次运行都会再试。代价是：Storage 不会报告本来就不存在的对象，所以如果图片删掉后 update 失败，那一行永远不会被置空。它每天都满足读取条件，每次运行都会把它的路径再送进 `remove()`，而 `remove()` 什么也不报告。这没有害处（UI 从不渲染图片），也很少见（要 update 失败才会出现），比在 bucket 里留下没有任何行指向的图片要好。

测试覆盖不到的：线上 PostgREST 是否按写的那样执行过滤；`remove()` 返回的每个对象的 `name` 是否是完整路径（`circle/file.jpg`）（如果不是，运行会返回 500，而不是悄悄地什么都不置空）；以及 `remove()` 对已经不存在的路径是否成功并且什么也不报告（如果它报错，上面那种卡住的行会让它所在的页每天都失败）。三条都等第一次真正有东西过期的线上运行时核实（最早的小票是 2026 年 8 月的，所以不会早于 2027 年 8 月）。
