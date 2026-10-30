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
4. **Order, per page**: first `storage.from("receipts").remove(paths)`, then `update receipts set original_image_url = null where id in (ids whose path remove() reports deleted)`. A path `remove()` doesn't report keeps its row set, so a later run tries it again. The reverse order would leave images in the bucket that no row points to. The cost of this order (a row whose update failed is never cleared) is explained in the handler's comment on the remove. *(Amended after code review: the first version cleared every id on the page, trusting Storage to have deleted every path it was given.)*
5. **Failure**: stop at the first failed read, remove, or update and return 500 with a generic message. Also return 500, after clearing the rows that did match, when `remove()` reports a name that is none of the paths sent. Pages already done stay done, and the next day's run picks up the rest.
6. **Response**: `200 { expiredImages: N }`.

Structured data is untouched: only the object in the bucket and the one column change. The UI never shows the stored image (`originalImageUrl` is read but not rendered), so nothing on screen changes.

Out of scope: objects in the bucket that no receipt points to (from before ticket 38). They would need a bucket listing, not a receipts query.

## Seams under test

- The route handler, `api/cron/expire-receipt-images.ts`, with `supabaseAdmin` faked by `installFakeSupabase` as in `low-stock-check.test.ts`, the clock fixed with fake timers, and `isCronAuthorized` mocked (ADR 0001).
- `isCronAuthorized` in `api/_lib/cronAuth.ts`, shared by both cron routes (added in review).

## Answer

Done as planned, with Plan 4 and 5 amended in review. `api/cron/expire-receipt-images.ts` runs daily at 03:00 UTC (`vercel.json`; the low-stock check stays at 00:00). The cutoff is `IMAGE_RETENTION_MONTHS` (12) calendar months before now, in UTC. Success returns `200 { expiredImages: N }`, counting only the cleared rows. CRON_SECRET checking is shared with the low-stock cron as `isCronAuthorized` in `api/_lib/cronAuth.ts`.

Tests in `api/_lib/cronAuth.test.ts`: the right secret passes; no secret, a wrong one, or `CRON_SECRET` unset fails. Tests in `api/cron/expire-receipt-images.test.ts` (with `isCronAuthorized` mocked): 405 for non-GET; 401 when it refuses; the read's filters (image present, `uploaded_at` before the cutoff); remove then clear, in that order; clearing only what Storage reports deleted; paging past a full page, with the second read keeping the filters; the four failures; and clearing the matched rows before failing on an unmatched name.

Not checked by the tests: that live PostgREST applies the filters as written; that each object `remove()` returns has the full path (`circle/file.jpg`) as its `name` (if not, each run deletes a page of images it can't clear and fails with 500; the images are gone either way, but the 500 says so); and that `remove()` succeeds, reporting nothing, for a path already gone (if it errors instead, a row stuck as above would fail its page every day). Check all three on the first live run that has something to expire (the oldest receipts date from August 2026, so not before August 2027).

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
4. **每页的顺序**：先 `storage.from("receipts").remove(paths)`，再 `update receipts set original_image_url = null where id in (remove() 报告已删除的路径对应的 id)`。`remove()` 没报告的路径，对应的行保持原值，以后的运行会再试。反过来的顺序会在 bucket 里留下没有任何行指向的图片。这个顺序的代价（update 失败的行永远不会被置空）写在 handler 里 remove 那段注释中。*（code review 后已修订：第一版把整页 id 都置空，等于相信 Storage 删掉了给它的每一条路径。）*
5. **失败**：读取、remove 或 update 第一次失败就停下，返回 500 和一条通用错误信息。如果 `remove()` 报告了一个不在送去路径里的名字，先置空能对上的行，再返回 500。已经处理完的页保持不变，剩下的第二天再跑。
6. **响应**：`200 { expiredImages: N }`。

结构化数据不动：只删 bucket 里的对象，并清空这一列。UI 从来不显示存下的图片（`originalImageUrl` 读出来了但没有渲染），所以页面上看不出变化。

不在范围内：bucket 里没有任何小票指向的对象（ticket 38 之前留下的）。处理它们需要列出 bucket 内容，而不是查 receipts 表。

## 测试的 seam

- 路由 handler `api/cron/expire-receipt-images.ts`。和 `low-stock-check.test.ts` 一样，用 `installFakeSupabase` 伪造 `supabaseAdmin`，用 fake timers 固定时间，并 mock 掉 `isCronAuthorized`（ADR 0001）。
- `api/_lib/cronAuth.ts` 里的 `isCronAuthorized`，两个 cron 路由共用（review 时加的）。

## 结论

按方案完成，方案第 4、5 条在 review 时做了修订。`api/cron/expire-receipt-images.ts` 每天 UTC 03:00 运行（`vercel.json`；库存检查仍在 00:00）。截止时间是当前时间往前 `IMAGE_RETENTION_MONTHS`（12）个自然月，按 UTC 算。成功时返回 `200 { expiredImages: N }`，只计入被置空的行。CRON_SECRET 校验和库存 cron 共用，是 `api/_lib/cronAuth.ts` 里的 `isCronAuthorized`。

测试在 `api/_lib/cronAuth.test.ts`：正确的密钥通过；没带密钥、密钥错误、或 `CRON_SECRET` 未设置都不通过。测试在 `api/cron/expire-receipt-images.test.ts`（mock 掉 `isCronAuthorized`）：非 GET 返回 405；它拒绝时返回 401；读取的过滤条件（有图片、`uploaded_at` 早于截止时间）；先 remove 再置空，顺序不能反；只置空 Storage 报告已删除的；超过一整页时继续翻页，并且第二次读取仍带着过滤条件；四种失败情况；以及遇到对不上的名字时，先置空能对上的行再失败。

测试覆盖不到的：线上 PostgREST 是否按写的那样执行过滤；`remove()` 返回的每个对象的 `name` 是否是完整路径（`circle/file.jpg`）（如果不是，每次运行都会删掉一页清不掉的图片并返回 500；图片反正已经没了，但 500 会把这件事报出来）；以及 `remove()` 对已经不存在的路径是否成功并且什么也不报告（如果它报错，上面那种卡住的行会让它所在的页每天都失败）。三条都等第一次真正有东西过期的线上运行时核实（最早的小票是 2026 年 8 月的，所以不会早于 2027 年 8 月）。
