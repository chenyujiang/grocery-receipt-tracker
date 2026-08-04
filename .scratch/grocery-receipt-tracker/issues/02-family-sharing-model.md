Type: grilling
Status: resolved

## Question

账号注册与共享的权限机制怎么设计？
How should the account registration and sharing permission model be designed?

背景（来自 01 号 platform-choice ticket 的衍生信息）：用户计划项目做完后也给朋友使用，不只是家庭内部，所以这不是简单的"家庭邀请码"模式，而是需要正式的账号注册体系（网页版，Vercel + Supabase），且要支持多个互不相关的用户/群组各自使用。
Background (derived from ticket 01, platform-choice): the user plans to let friends use the finished project too, not just family members, so this isn't a simple "family invite code" model — it needs a proper account registration system (web app, Vercel + Supabase) that supports multiple independent users/groups.

需要覆盖：
Needs to cover:

- 注册/登录方式（邮箱注册？Supabase Auth 自带的方案？）。
  Registration/login method (email sign-up? Supabase Auth's built-in scheme?).
- 一个账号能否同时属于/创建多个独立的"共享圈子"（比如自己的小家庭一个圈子，以后朋友是各自独立的圈子，互不可见）。
  Whether one account can belong to / create multiple independent "sharing circles" (e.g. one's own family is one circle, and friends later form their own separate, mutually invisible circles).
- 每个圈子里几个人可以共享同一份数据，是否有人数上限。
  How many people can share the same data within a circle, and whether there's a member cap.
- 如何邀请别人加入自己的圈子（邀请码/邮箱邀请链接）。
  How to invite others to join one's own circle (invite code / emailed invite link).
- 圈子内谁能新增/修改/删除小票记录。
  Who within a circle can add/edit/delete receipt records.
- 多人同时拍票时如何避免重复记录（例如同一张小票被两个人各拍了一次）。
  How to avoid duplicate records when multiple people photograph receipts around the same time (e.g. the same receipt photographed separately by two people).
- 是否需要记录"这条消费是谁买的"这个字段。
  Whether a "who made this purchase" field needs to be recorded.

产出应为账号与共享数据模型的基本形状、权限规则。
The output should be the basic shape of the account and sharing data model, plus the permission rules.

## Answer

- **登录方式**：Supabase Auth 自带邮箱方案。
  **Login method**: Supabase Auth's built-in email scheme.
- **账号-圈子关系**：一个账号只属于一个圈子（简化模型）——注册即建圈，或通过邀请链接加入别人的圈子。
  **Account-circle relationship**: one account belongs to exactly one circle (a simplified model) — a circle is created automatically at signup, or joined via someone else's invite link.
- **圈子人数**：设默认上限（如 10 人）。
  **Circle size**: a default cap is set (e.g. 10 people).
- **权限分级**：区分 owner 与 member。
  **Permission tiers**: owner and member are distinguished.
  - owner：创建圈子的人，可邀请/移除成员、解散圈子，且和 member 一样只能改/删自己上传的记录。
    owner: the person who created the circle, who can invite/remove members and dissolve the circle, but — like members — can only edit/delete records they uploaded themselves.
  - member：只能新增记录，只能修改/删除**自己上传**的记录，不能动别人的。
    member: can only add records, and can only edit/delete records **they uploaded themselves** — never anyone else's.
- **邀请方式**：邮箱邀请链接（需要接入邮件发送服务，如 Supabase 自带或 Resend 等）。
  **Invite method**: emailed invite links (requires an email-sending service, such as Supabase's built-in option or Resend).
- **防重复拍票**：按"店铺 + 日期 + 总金额"自动检测疑似重复小票，检测到就提示用户确认"确实重复，不导入"或"不是重复，继续导入"。
  **Duplicate-receipt prevention**: suspected duplicates are auto-detected by matching store + date + total amount; when detected, the user is prompted to confirm either "yes, this is a duplicate, don't import" or "not a duplicate, continue importing."
- **购买人字段**：不需要额外输入，自动取当前登录账号的邮箱作为"这条记录是谁传的"，后续可按人统计消费。
  **Buyer field**: no extra input needed — it's automatically set to the current logged-in account's email as "who uploaded this record," which later allows per-person spending statistics.
