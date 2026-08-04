Type: grilling
Status: resolved

## Question

项目应该以什么产品形态实现——原生/跨平台手机 App、微信小程序，还是手机端网页（PWA）？
What product form should this project take — a native/cross-platform mobile app, a WeChat mini-program, or a mobile web app (PWA)?

需要权衡：
Trade-offs to weigh:

- 拍照上传体验、系统相机/相册访问权限的顺畅程度。
  How smooth the photo-upload experience is, and how well each option accesses the system camera/photo library.
- 开发与长期独立维护成本（个人项目）。
  Development cost and long-term maintenance cost as a solo project.
- 家人使用的便利性（是否需要安装、是否要同时覆盖 iOS 和 Android）。
  How convenient it is for family members to use (whether installation is required, whether both iOS and Android need to be covered).
- 后续价格异常提醒、库存快用完提醒等通知功能对推送能力的要求。
  The push-notification capability required by later features such as price-spike alerts and low-stock alerts.

产出应为选定的平台形态及理由。
The output should be the chosen platform form and the reasoning behind it.

## Answer

**结论：先做网页版（Web App），原生/跨平台 App 列入后续路线图，不在本期范围内。**
**Conclusion: build the web app first; a native/cross-platform app is deferred to a future roadmap and is out of scope for this round.**

决定依据：
Reasoning:

- 开发方式：从零手写代码（AI 辅助），技术栈定为 React.js + TypeScript + Node.js，部署到 Vercel（前端/接口）+ Supabase（数据库/认证），GitHub 做版本控制。
  Development approach: hand-written from scratch (with AI assistance), with the tech stack set as React.js + TypeScript + Node.js, deployed to Vercel (frontend/API) + Supabase (database/auth), with GitHub for version control.
- 这套组合天然适合网页应用；做 App 还要多处理上架、证书、构建流水线这些额外环节，用户明确表示"App 比较麻烦，先做网页版"。
  This combination is naturally suited to a web app; building an app would add extra steps like app-store submission, signing certificates, and build pipelines — the user explicitly said "an app is more trouble, let's do the web version first."
- 设备环境：家人手机系统是 iPhone 和安卓混用，网页版天然跨平台，不需要为两个系统分别开发。
  Device environment: family members use a mix of iPhone and Android, and a web app is inherently cross-platform, so there's no need to develop separately for both systems.
- 推送通知需求：价格异常提醒、库存快用完提醒暂时接受"网页内展示 + 邮件通知"的弱推送形式，不强制要求 App 级别的原生推送；等后续做 App 再重新解决推送问题。
  Push notification needs: price-spike and low-stock alerts will use a "in-app display + email notification" weak-push approach for now, without requiring app-level native push; the push problem will be revisited when the app is eventually built.

**路线图**：网页版验证可行后，再评估是否/何时做 App，届时重新处理推送通知等 App 专属能力。
**Roadmap**: once the web version proves viable, evaluate whether/when to build an app, and revisit app-only capabilities like push notifications at that point.

**衍生信息（供其他 ticket 参考，尚未正式讨论/未计入决策）：**
**Derived information (for reference by other tickets, not yet formally discussed / not counted as a decision):**

- 技术栈方向已明确：React + TypeScript + Node.js，部署 Vercel + Supabase，GitHub 版本控制 → 供 08 号 tech-stack ticket 参考。
  The tech stack direction is now clear: React + TypeScript + Node.js, deployed on Vercel + Supabase, GitHub for version control → for reference by ticket 08 (tech stack).
- 用户提到项目做完后也想给朋友用，不只是家庭内部，需要正式的账号注册体系 → 供 02 号 family-sharing ticket 参考，该 ticket 讨论范围需要从"家庭邀请码"扩展到"支持多个独立用户/群组的注册体系"。
  The user mentioned wanting to let friends use the finished project too, not just family members, which requires a proper account/registration system → for reference by ticket 02 (family sharing), whose scope needs to expand from "family invite code" to "a registration system supporting multiple independent users/groups."
