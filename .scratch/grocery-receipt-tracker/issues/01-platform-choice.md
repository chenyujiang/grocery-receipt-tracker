Type: grilling
Status: resolved

## Question

What product form should this project take — a native/cross-platform mobile app, a WeChat mini-program, or a mobile web app (PWA)?

Trade-offs to weigh:

- How smooth the photo-upload experience is, and how well each option accesses the system camera/photo library.
- Development cost and long-term maintenance cost as a solo project.
- How convenient it is for family members to use (whether installation is required, whether both iOS and Android need to be covered).
- The push-notification capability required by later features such as price-spike alerts and low-stock alerts.

The output should be the chosen platform form and the reasoning behind it.

## Answer

**Conclusion: build the web app first; a native/cross-platform app is deferred to a future roadmap and is out of scope for this round.**

Reasoning:

- Development approach: hand-written from scratch (with AI assistance), with the tech stack set as React.js + TypeScript + Node.js, deployed to Vercel (frontend/API) + Supabase (database/auth), with GitHub for version control.
- This combination is naturally suited to a web app; building an app would add extra steps like app-store submission, signing certificates, and build pipelines — the user explicitly said "an app is more trouble, let's do the web version first."
- Device environment: family members use a mix of iPhone and Android, and a web app is inherently cross-platform, so there's no need to develop separately for both systems.
- Push notification needs: price-spike and low-stock alerts will use a "in-app display + email notification" weak-push approach for now, without requiring app-level native push; the push problem will be revisited when the app is eventually built.

**Roadmap**: once the web version proves viable, evaluate whether/when to build an app, and revisit app-only capabilities like push notifications at that point.

**Derived information (for reference by other tickets, not yet formally discussed / not counted as a decision):**

- The tech stack direction is now clear: React + TypeScript + Node.js, deployed on Vercel + Supabase, GitHub for version control → for reference by ticket 08 (tech stack).
- The user mentioned wanting to let friends use the finished project too, not just family members, which requires a proper account/registration system → for reference by ticket 02 (family sharing), whose scope needs to expand from "family invite code" to "a registration system supporting multiple independent users/groups."
