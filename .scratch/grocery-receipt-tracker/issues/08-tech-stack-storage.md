Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

How should the backend and data storage be chosen?

Building on the conclusions of platform choice (ticket 01) and the family-sharing model (ticket 02), needs deciding:

- Whether data should live in the cloud (a family-sharing scenario almost certainly requires cloud sync).
- Which backend service to use (e.g. a BaaS like Supabase that provides database, auth, and realtime sync in one place, well suited to a solo project's rapid setup; other options can also be considered).
- Whether the multimodal-LLM OCR call goes directly from the client, or is proxied through the backend (this involves API key security and cost control).
- The storage plan for original receipt photos (which object storage, size limits, and retention policy).

The output should be the tech-stack decision and a sketch of the overall data-flow architecture.

**Derived information (from ticket 01, platform-choice)**: the tech-stack direction is already set — React + TypeScript + Node.js, deployed on Vercel + Supabase, GitHub for version control — so this ticket is mainly about nailing down the OCR call architecture and image-storage details, not re-discussing the frontend framework.

**Derived information (from ticket 09, bilingual-content-strategy)**: the Chinese/English translation is produced by the same multimodal-LLM OCR call, with no separate translation API needed — when this ticket discusses "client-direct vs. backend proxy," the bilingual field output should just be counted as part of that same call.

## Answer

**OCR + translation model**: the Anthropic Claude API's multimodal model, specifically **Claude Haiku 4.5** (`claude-haiku-4-5`) — structured extraction + translation + categorization doesn't need the most expensive model, and Haiku 4.5 costs roughly 1/5 of Opus 5; start there and only upgrade to Sonnet/Opus if recognition quality falls short. No other provider is integrated.

**Call architecture**: the OCR call must go through the backend; direct client-side calls are not allowed.

- The backend runs as Vercel Serverless Functions (Node.js); the Claude API key lives only in backend environment variables and never appears in frontend code or browser network requests.
- Call quota: **not** limited by call count or per-user, but a **single, global, hard dollar cap for the whole application (default $1)**, computed by accumulating each call's actual cost (`usage.input_tokens`/`usage.output_tokens` × Haiku 4.5 pricing). Once cumulative spend reaches the cap, the backend refuses any new Claude API call outright (returns an error; the frontend shows "this month's recognition quota is used up"), with **no automatic reset or increase** — a circle owner must manually raise the cap on the backend to continue. This is a more direct guard against accidental overspend than a per-call-count limit.

**Data flow**:

1. The user selects/photographs a receipt image on the web page; the frontend uploads the image to a backend API route.
2. The backend stores the original image in a private Supabase Storage bucket (see "Image access permissions" below), and calls the Claude API to perform OCR and Chinese/English translation in the same call, producing a structured draft (including the `raw_name_zh`/`raw_name_en`, `store_name_zh`/`store_name_en`, etc. fields defined in ticket 03).
3. The backend also, per the rules in ticket 05, matches the recognized `raw_name_en` against the circle's existing Product list and generates a match suggestion, included in the same draft.
4. The draft is written to the Supabase database with `status = pending_review`; the frontend reads the draft and shows it to the user for line-by-line confirmation (the flow from ticket 03), updating to `status = confirmed` once confirmed.

**Image access permissions**: Supabase Storage uses a private bucket with no public URLs; when the frontend needs to display a receipt's original image, the backend generates a short-lived signed URL, obtainable only by members of the relevant circle.
