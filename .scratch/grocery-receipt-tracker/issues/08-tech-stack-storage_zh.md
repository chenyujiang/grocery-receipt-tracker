Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

后端与数据存储方案怎么选？

需要结合平台选型（01 号 ticket）和家庭共享机制（02 号 ticket）的结论，决定：

- 数据要不要上云（家庭共享场景下几乎必然需要云同步）。
- 用什么后端服务（例如 Supabase 这类 BaaS，可一站提供数据库、账号认证、实时同步，适合个人项目快速搭建；也可以考虑其他方案）。
- 多模态大模型 OCR 调用是客户端直连，还是经后端中转（涉及 API Key 安全和调用成本控制）。
- 小票原图存储方案（用什么对象存储、大小限制和保留策略）。

产出应为技术栈选型结论和整体数据流架构草图。

**衍生信息（来自 01 号 platform-choice ticket）**：技术栈方向已定 React + TypeScript + Node.js，部署 Vercel + Supabase，GitHub 版本控制——这里主要是把 OCR 调用架构、图片存储细节敲定，不用重新讨论前端框架。

**衍生信息（来自 09 号 bilingual-content-strategy ticket）**：中英翻译复用同一次多模态大模型 OCR 调用顺带输出，不需要额外接翻译 API，这里讨论"客户端直连还是走后端中转"时把双语字段的输出也算在同一次调用里即可。

## Answer

**OCR + 翻译模型**：用 Anthropic Claude API 的多模态模型，具体定为 **Claude Haiku 4.5**（`claude-haiku-4-5`）——结构化提取+翻译+分类这类任务不需要最贵的模型，Haiku 4.5 成本大约是 Opus 5 的 1/5，先用它，识别质量不够再考虑升级到 Sonnet/Opus。不额外接入其他服务商。

**调用架构**：OCR 调用必须经后端中转，不允许客户端直连。

- 后端用 Vercel Serverless Functions（Node.js），Claude API Key 只存在后端环境变量里，绝不出现在前端代码或浏览器网络请求里。
- 调用限额：**不是**按次数、也不是按用户分别限制，而是整个应用一个**全局硬性美元上限（默认 $1）**，按每次调用实际的 token 用量（`usage.input_tokens`/`usage.output_tokens` × Haiku 4.5 单价）累加计算实际花费。累计花费一旦达到上限，后端直接拒绝新的 Claude API 调用（返回错误，前端提示"本月识别额度已用完"），**不会自动重置或提额**，必须由圈子 owner 手动去后端把上限调高才能继续用。这比按次数限流更直接地防止意外超支。

**数据流**：

1. 用户在网页选择/拍照小票图片，前端把图片上传到后端 API route。
2. 后端把原图存入 Supabase Storage 的私有 bucket（见下方"图片访问权限"），同时调用 Claude API 做 OCR 识别 + 中英翻译，产出结构化草稿（含 03 号 ticket 定义的 `raw_name_zh`/`raw_name_en`、`store_name_zh`/`store_name_en` 等字段）。
3. 后端同时按 05 号 ticket 的规则，把识别出的 `raw_name_en` 和该圈子已有的 Product 列表做匹配，生成匹配建议，一并写入草稿。
4. 草稿以 `status = pending_review` 写入 Supabase 数据库；前端读取草稿展示给用户逐条确认（03 号 ticket 的流程），确认后更新为 `status = confirmed`。

**图片访问权限**：Supabase Storage 用私有 bucket，不开放公开 URL；前端要显示某张小票原图时，由后端生成一个有效期较短的签名 URL，只有对应圈子的成员能拿到。
