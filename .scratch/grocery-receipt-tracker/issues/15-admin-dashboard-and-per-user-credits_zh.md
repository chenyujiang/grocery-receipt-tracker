Type: grilling
Status: resolved

## 问题

全局管理员后台（用户管理 + 每用户 Claude API 额度）应该怎么设计？它跟现有的全局 `ai_spend_limit` 总闸门（票 08）以及每个 circle 内部的 owner/member 角色（票 02）之间是什么关系？

需要决定：

- 谁能访问它——是不是要一个全新的、独立于现有 circle `owner` 角色的全局管理员身份？
- 访问怎么保护——真正的权限校验 vs. 单纯的 URL 隐蔽性，两者如何配合？
- 每用户额度是替换掉现有的全局总闸门，还是跟它共存？
- "给额度"具体是什么语义——累加充值，还是重置成一份全新的额度？
- 账号禁用/启用怎么实现？
- 管理后台在 UI 上放在哪里，管理员怎么进去？
- 一个全新的、还没被管理员审核过的用户，一开始能做什么？
- 用户被卡住时"联系管理员"这个流程怎么走？
- 已经存在的老用户，怎么迁移进新模型？

## 回答

**1. 管理员身份**：新增一个**全局管理员**概念，独立于现有 `profiles` 上按 circle 划分的 `owner`/`member` 角色。它跨越所有 circle——管理员（实际上就一个人，也就是 app 的所有者）可以看到并管理系统里所有用户，不管他们属于哪个 circle。这不改变现有 circle owner 的权力范围（邀请/移除成员、解散 circle，仍然只限于自己的 circle）。

**2. 访问安全——两层**：
- **权限校验（真正起作用的一层）**：前端路由和每一个后端管理接口都要检查当前用户的全局管理员标记，不是管理员一律拒绝，不管访问的是什么 URL。
- **隐蔽性（辅助，不能替代权限校验）**：管理后台部署在一个不规律、猜不出来的路径上（不是 `/admin`），非管理员访问这个路径时返回 404，而不是跳转登录页——这样即使有人试探这个路径，也不会暴露"这里有个功能"。
- 更强的验证方式（比如二次验证、IP 白名单）明确推迟到以后——记下来，这次不做。

**3. 每用户额度替换掉全局总闸门**：票 08 里那张全局单例的 `ai_spend_limit` 表（全应用共用一个 `cap_usd`/`spent_usd`）被彻底替换成按用户分配的额度。每个用户有自己独立的额度上限和花费计数，一个人用超了完全不影响其他人调用 API 的能力。不再有叠加在上面的总体上限。

**4. "给额度"是重置，不是累加充值**：管理员点"给额度"按钮，就是把这个用户的花费计数清零，并把他的额度上限设成某个值——默认 **$1**（一键点击，不用输入），或者管理员手动输入的任意自定义金额。每次都是给一份全新的、独立的额度，跟他之前用了多少或者被给过多少没有关系。这正好符合预期的使用场景：用户用超了，管理员点一下，他就有一份干净的 $1（或其他金额）可以重新用。

**5. 禁用/启用用 Supabase Auth 自带的封禁机制实现**：用 `auth.admin.updateUserById(..., { ban_duration })` 实现（启用＝清除封禁），而不是应用层加一个 `is_active` 字段。被禁用的用户在认证层本身就会被拒绝（包括 session/token 刷新的时候）——不需要在每个路由或 API 处理函数里都记得单独检查一个状态字段。

**6. 全新用户拿到的是硬性"1次免费试用"，不是按金额算的额度**：新用户注册后，只有**恰好 1 次成功的识别调用**是免费的——这是按次数计算的，不是按金额，因为 Haiku 4.5 单次调用的成本远低于 $1 的零头，按金额算的额度根本卡不住"只能用1次"这个目标。只有**成功**的识别才会消耗这次免费额度，失败/报错的尝试不算。这 1 次免费额度用完之后，后续所有识别请求都会被拒绝，直到管理员按**决定4**给他分配一份真正的（按金额算的）额度。这是一套跟"每用户按金额算的额度"完全独立的机制——新用户一开始处于"1次免费"模式，第一次被管理员分配额度之后，才切换进入"按金额算"模式。

**7. 被卡住的用户会被引导去邮件联系管理员——纯 `mailto:` 链接，后端不发邮件**：当一个用户被拒绝时（免费试用用完，或者按金额算的额度用完），界面上会显示提示信息和一个 `mailto:nz.eason.chen@gmail.com` 的链接/按钮，点击后会用用户自己的邮件客户端打开一封预填好的邮件草稿。发不发、写什么由用户自己决定。不引入任何自动发信的服务——现在的技术栈（Vercel Serverless + Supabase）完全没有这块基础设施，这次也不打算新增，超出这张票的范围。

**8. 管理后台的位置——对普通导航完全隐藏，登录后一次性自动跳转过去**：这个后台永远不会出现在底部导航栏或任何普通用户能看到的菜单里。它不套用现有的 `AppShell`/底部导航那套外壳——是一个独立的、控制台风格的页面。全局管理员登录时，会先落地到管理后台（只在登录那一刻跳一次，不是每个页面都拦截）；从那里，一个显眼的"进入我的账户"入口可以让管理员切换回普通 app 界面，之后正常导航，不会被强制拉回管理后台。

**9. 老用户直接迁移，不走"1次免费"流程**：迁移时，所有已经存在的用户都直接拿到一份按金额算的初始额度（默认 $1，或者管理员逐个手动设置）——完全跳过决定6里"1次免费"的限制，因为他们已经在旧的全局信任模式下用过这个 app 了。

## UI 原型

通过 `/prototype` 解决（见 mattpocock-skills prototype/UI.md）：用模拟数据搭了三个结构完全不同的方案——**A**（密集的后台管理表格）、**B**（复用 app 现有 `.receipt-card` 样式的卡片列表）、**C**（"需要处理"分诊队列 + 按圈子分组、点击展开的名单）。三个都过了一遍之后，最终选定的方向是**用 C 的结构，配上 B 的卡片作为展示单元**：最上面是"需要处理"队列，直接标出谁被卡住了、为什么（免费试用用完/额度打满），卡片上已经能一键"给$1"；下面是按圈子分组、可折叠的完整名单，每个用户都是一张完整卡片（姓名/邮箱、圈子/角色/加入日期、额度状态、给$1/自定义额度/封禁-解封操作），而不是 C 原来那种点一下才展开详情的简单行。

完整的原型代码（四个方案，靠 `?variant=` 切换）保存在临时分支 `prototype/admin-dashboard-ui` 上，不在主分支——主分支只留这段文字记录的决定。以后要重新审视这个方向的话，拉这个分支看，不用从头再搭一遍。

## Schema 设计（草案）

按上面定下来的模型，写出具体的表结构/RLS，尽量贴合这个代码库已有的写法（参照 `supabase/migrations/20260804000007_ai_spend_limit.sql` 和 `api/_lib/spendLimit.ts` 的模式：一张对 `authenticated` 只读、只有后端 service-role 客户端能写的表）。**这只是设计草案，还没实际落地成迁移文件。**

**为什么不直接在 `profiles` 上加字段？** `profiles` 已经有一条生效的 RLS 策略（`20260805000004_profiles_update_own_display_name.sql`），允许用户 `UPDATE` **自己的那一行**——但 Postgres 的 RLS 只按行限制，不按列限制。一条按 `user_id = auth.uid()` 判断的策略，会让用户能通过前端直接调用把自己那一行的**任何**列都改掉，包括假设加上去的 `is_global_admin` 或 `free_trial_used` 列——也就是说，用户自己调用一次 `supabase.from("profiles").update(...)`，就能把自己提升成管理员，或者把自己的免费试用状态清零。用两张独立的新表就能完全避开对现有这条策略的改动：这两张新表都不给 `authenticated` 设 `insert`/`update`/`delete` 策略，所以任何写入——包括第一次写入——都必须经过后端的 service-role 客户端，跟现在的 `ai_spend_limit` 完全一样。

```sql
-- 全局管理员标记。有这一行 = 是全局管理员。目前只有一个管理员（app 所有者本人），
-- 没有自助升级流程，所以这张表的行是手动通过 Supabase SQL 编辑器插入的，
-- 不经过任何应用代码路径。
create table global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table global_admins enable row level security;

-- 用户可以查询"自己"是不是管理员（驱动决定8里登录后的自动跳转），
-- 但看不到、也改不了别人的行，更没法把自己写进这张表。
create policy "a user can check their own admin status"
on global_admins for select to authenticated
using (user_id = (select auth.uid()));

-- 一次性的、手动执行——不属于任何迁移的数据，手动跑一次：
-- insert into global_admins (user_id)
-- select id from auth.users where email = 'nz.eason.chen@gmail.com';
```

```sql
-- 每用户 AI 调用额度。取代 ai_spend_limit 的单例行。
-- 某个 user_id 没有对应的行，这件事本身就有意义："全新注册用户，
-- 免费试用额度还没用，什么都没碰过"。只有在这两种情况下才会创建行：
-- (a) 用户成功消耗了免费试用的那 1 次调用，或者
-- (b) 管理员给这个用户分配了真正的额度——这两种写入都只从后端发起，
-- 跟 ai_spend_limit 的写入方式一致。
--
-- 模式由 cap_usd 推导出来，不单独存一个枚举字段：
--   cap_usd 为 null      -> 免费试用模式；free_trial_used 为真则拒绝
--   cap_usd 不为 null    -> 按金额算模式；spent_usd >= cap_usd 则拒绝
create table user_ai_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_trial_used boolean not null default false,
  cap_usd numeric(10, 4),
  spent_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now()
);

alter table user_ai_access enable row level security;

-- 只对这行的主人本人只读，这样前端可以显示"还有1次免费上传"/
-- "已用 $0.32，共 $1.00"。完全不给 authenticated 设写入策略——
-- 只有 service-role key 能写（识别流程在第一次成功调用之后写，
-- 或者管理员的"给额度"接口写）。
create policy "a user can view their own AI access status"
on user_ai_access for select to authenticated
using (user_id = (select auth.uid()));
```

**老用户迁移**（决定9——直接迁移进按金额算的模式，默认 $1，跳过免费试用限制）：

```sql
insert into user_ai_access (user_id, free_trial_used, cap_usd, spent_usd)
select user_id, true, 1.00, 0
from profiles
on conflict (user_id) do nothing;
```

**后端逻辑草图**（取代 `api/_lib/spendLimit.ts` 里的 `getSpendStatus`/`recordSpend`，从 `recognizeReceipt.ts` 里用调用者的 `user_id` 调用）：

- 查询调用者的 `user_ai_access` 行（用 service-role 客户端，绕过 RLS）。
- 没有这行，或者 `cap_usd` 为 null：免费试用模式。如果 `free_trial_used` 为真就拒绝（引导用户走决定7的 `mailto:` 联系管理员流程）。否则放行；调用成功后 upsert `{ free_trial_used: true }`。
- `cap_usd` 不为 null：按金额算模式。如果 `spent_usd >= cap_usd` 就拒绝（同样走 `mailto:` 流程）。否则放行；调用成功后 `spent_usd += 实际花费`（跟 `recordSpend` 现在一样，先读后写，按它自己注释里说的，这个规模下够用）。

**管理员"给额度"操作**（upsert，永远把 `spent_usd` 清零并把免费试用标记为已用，对应决定4"重置成一份新额度"的语义——一键"给$1"时 `$capUsd` 默认 `1.00`，也可以是管理员输入的任意自定义金额）：

```sql
insert into user_ai_access (user_id, free_trial_used, cap_usd, spent_usd, updated_at)
values ($1, true, $2, 0, now())
on conflict (user_id) do update
  set cap_usd = excluded.cap_usd, spent_usd = 0, free_trial_used = true, updated_at = now();
```

**禁用/启用**：完全不需要改 schema——纯粹用 `supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration })` 实现，对应决定5。`auth.users` 不是这个项目自己建迁移管理的表。

**`ai_spend_limit`**：原样保留，这次上线之后代码只是不再引用它。要不要删掉这张表留给以后单独的清理迁移，等新模型跑稳了再说——不跟这次迁移绑在一起，让这次迁移保持可回滚、可单独审查。

**对其他票的影响**：
- **票 08（技术栈与存储）**在"额度总闸门"这一点上被取代：它"全局硬性 $1 总闸门"的设计被上面这套按用户分配的模型替换。票 08 里关于 OCR 模型选型、后端代理调用、图片存储的决定不受影响，继续有效。
- **CLAUDE.md** 的"Claude API usage in this app"一节写着全局总闸门"未经用户明确同意不得放宽"——这次票的整个 grilling 过程，就是项目所有者本人给出的明确同意。等这套方案实际落地实现时，CLAUDE.md 需要同步更新，反映新的按用户分配的模型。

## 上线后修订

- **最终管理员身份还是用了项目所有者本来那个家庭账号**（`nz.eason.chen@gmail.com`），没有另外注册一个专用的管理员邮箱（虽然中途考虑过）。这个账号从最初实现的时候就已经在 `global_admins` 里了，不用改，只是确认了一下。
- **加了一个常驻的管理后台入口**，不只是决定8里"登录后一次性跳转"——Circle Settings（账号/设置页面）现在会显示一个"前往管理后台"的链接，用同一个 `isGlobalAdmin` 判断来控制显示，方便全局管理员在已经有登录状态的情况下（比如刷新页面之后，一次性跳转早就已经触发过了）随时能进去。
- **已解决——查到根本原因了，其实根本不是计时竞态问题**：新注册一个全新账号，以前会出现自动创建圈子/档案失败的情况，插入请求被 RLS 拒绝，表现得像没登录一样。直接绕过客户端，用纯 SQL 复现出了根因：`begin; set local role authenticated; insert into circles (name) values ('x') returning id;`——每次都失败，报 "new row violates row-level security policy"，跟 JWT/客户端完全无关。再用二分法定位：同样这条 insert，去掉 `returning` 就能稳定成功。真正原因是：`circles` 自己的 SELECT 策略是 `id = current_circle_id()`，而 `current_circle_id()` 要靠该用户的 `profiles` 行才能算出来——但一个全新注册的用户这时候还没有 `profiles` 行（那是下一步才插入的）。`supabase-js` 的 `.insert({}).select().single()` 生成的是 `INSERT ... RETURNING`，而 RETURNING 本身也要过 SELECT 策略这一关——没有可见的行能返回，Postgres 就把整条语句判定为 RLS 违规，尽管这条 INSERT 自己的 `with_check(true)` 本来是允许的。所以这压根不是"偶发"的问题（单独测试时 100% 必现）——只是线上一直只有那一个"祖父迁移"账号在用，真正走到"全新注册"这条路径的机会很少，才显得像是偶发的。**修复方式**：`src/lib/auth.ts` 里的 `signUpWithEmail` 和 `ensureProfile` 现在改成在客户端生成圈子的 `id`（`crypto.randomUUID()`），插入圈子和档案这两步都不再串 `.select()`，这样就永远不会触发那个"RETURNING 时看不见自己刚插入的行"的问题了。
