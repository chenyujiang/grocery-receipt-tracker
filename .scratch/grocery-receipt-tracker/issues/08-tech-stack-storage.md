Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

后端与数据存储方案怎么选？
How should the backend and data storage be chosen?

需要结合平台选型（01 号 ticket）和家庭共享机制（02 号 ticket）的结论，决定：
Building on the conclusions of platform choice (ticket 01) and the family-sharing model (ticket 02), needs deciding:

- 数据要不要上云（家庭共享场景下几乎必然需要云同步）。
  Whether data should live in the cloud (a family-sharing scenario almost certainly requires cloud sync).
- 用什么后端服务（例如 Supabase 这类 BaaS，可一站提供数据库、账号认证、实时同步，适合个人项目快速搭建；也可以考虑其他方案）。
  Which backend service to use (e.g. a BaaS like Supabase that provides database, auth, and realtime sync in one place, well suited to a solo project's rapid setup; other options can also be considered).
- 多模态大模型 OCR 调用是客户端直连，还是经后端中转（涉及 API Key 安全和调用成本控制）。
  Whether the multimodal-LLM OCR call goes directly from the client, or is proxied through the backend (this involves API key security and cost control).
- 小票原图存储方案（用什么对象存储、大小限制和保留策略）。
  The storage plan for original receipt photos (which object storage, size limits, and retention policy).

产出应为技术栈选型结论和整体数据流架构草图。
The output should be the tech-stack decision and a sketch of the overall data-flow architecture.

**衍生信息（来自 01 号 platform-choice ticket）**：技术栈方向已定 React + TypeScript + Node.js，部署 Vercel + Supabase，GitHub 版本控制——这里主要是把 OCR 调用架构、图片存储细节敲定，不用重新讨论前端框架。
**Derived information (from ticket 01, platform-choice)**: the tech-stack direction is already set — React + TypeScript + Node.js, deployed on Vercel + Supabase, GitHub for version control — so this ticket is mainly about nailing down the OCR call architecture and image-storage details, not re-discussing the frontend framework.

**衍生信息（来自 09 号 bilingual-content-strategy ticket）**：中英翻译复用同一次多模态大模型 OCR 调用顺带输出，不需要额外接翻译 API，这里讨论"客户端直连还是走后端中转"时把双语字段的输出也算在同一次调用里即可。
**Derived information (from ticket 09, bilingual-content-strategy)**: the Chinese/English translation is produced by the same multimodal-LLM OCR call, with no separate translation API needed — when this ticket discusses "client-direct vs. backend proxy," the bilingual field output should just be counted as part of that same call.

## Answer

**OCR + 翻译模型**：用 Anthropic Claude API 的多模态模型，不额外接入其他服务商。
**OCR + translation model**: the Anthropic Claude API's multimodal model, with no other provider integrated.

**调用架构**：OCR 调用必须经后端中转，不允许客户端直连。
**Call architecture**: the OCR call must go through the backend; direct client-side calls are not allowed.

- 后端用 Vercel Serverless Functions（Node.js），Claude API Key 只存在后端环境变量里，绝不出现在前端代码或浏览器网络请求里。
  The backend runs as Vercel Serverless Functions (Node.js); the Claude API key lives only in backend environment variables and never appears in frontend code or browser network requests.
- 调用限额：对每个用户设一个每月调用次数上限（具体数值留给开发阶段定，比如几百次），在后端调用 Claude API 之前做检查，防止 bug 导致的循环调用或异常情况把账单拖爆。
  Call quota: a monthly per-user call cap is set (the exact number is left for development to decide, e.g. a few hundred), checked in the backend before calling the Claude API, to prevent a bug-induced call loop or other anomaly from blowing up the bill.

**数据流**：
**Data flow**:

1. 用户在网页选择/拍照小票图片，前端把图片上传到后端 API route。
   The user selects/photographs a receipt image on the web page; the frontend uploads the image to a backend API route.
2. 后端把原图存入 Supabase Storage 的私有 bucket（见下方"图片访问权限"），同时调用 Claude API 做 OCR 识别 + 中英翻译，产出结构化草稿（含 03 号 ticket 定义的 `raw_name_zh`/`raw_name_en`、`store_name_zh`/`store_name_en` 等字段）。
   The backend stores the original image in a private Supabase Storage bucket (see "Image access permissions" below), and calls the Claude API to perform OCR and Chinese/English translation in the same call, producing a structured draft (including the `raw_name_zh`/`raw_name_en`, `store_name_zh`/`store_name_en`, etc. fields defined in ticket 03).
3. 后端同时按 05 号 ticket 的规则，把识别出的 `raw_name_en` 和该圈子已有的 Product 列表做匹配，生成匹配建议，一并写入草稿。
   The backend also, per the rules in ticket 05, matches the recognized `raw_name_en` against the circle's existing Product list and generates a match suggestion, included in the same draft.
4. 草稿以 `status = pending_review` 写入 Supabase 数据库；前端读取草稿展示给用户逐条确认（03 号 ticket 的流程），确认后更新为 `status = confirmed`。
   The draft is written to the Supabase database with `status = pending_review`; the frontend reads the draft and shows it to the user for line-by-line confirmation (the flow from ticket 03), updating to `status = confirmed` once confirmed.

**图片访问权限**：Supabase Storage 用私有 bucket，不开放公开 URL；前端要显示某张小票原图时，由后端生成一个有效期较短的签名 URL，只有对应圈子的成员能拿到。
**Image access permissions**: Supabase Storage uses a private bucket with no public URLs; when the frontend needs to display a receipt's original image, the backend generates a short-lived signed URL, obtainable only by members of the relevant circle.
