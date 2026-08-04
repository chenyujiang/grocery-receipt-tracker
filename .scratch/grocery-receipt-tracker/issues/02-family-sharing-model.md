Type: grilling
Status: resolved

## Question

How should the account registration and sharing permission model be designed?

Background (derived from ticket 01, platform-choice): the user plans to let friends use the finished project too, not just family members, so this isn't a simple "family invite code" model — it needs a proper account registration system (web app, Vercel + Supabase) that supports multiple independent users/groups.

Needs to cover:

- Registration/login method (email sign-up? Supabase Auth's built-in scheme?).
- Whether one account can belong to / create multiple independent "sharing circles" (e.g. one's own family is one circle, and friends later form their own separate, mutually invisible circles).
- How many people can share the same data within a circle, and whether there's a member cap.
- How to invite others to join one's own circle (invite code / emailed invite link).
- Who within a circle can add/edit/delete receipt records.
- How to avoid duplicate records when multiple people photograph receipts around the same time (e.g. the same receipt photographed separately by two people).
- Whether a "who made this purchase" field needs to be recorded.

The output should be the basic shape of the account and sharing data model, plus the permission rules.

## Answer

- **Login method**: Supabase Auth's built-in email scheme.
- **Account-circle relationship**: one account belongs to exactly one circle (a simplified model) — a circle is created automatically at signup, or joined via someone else's invite link.
- **Circle size**: a default cap is set (e.g. 10 people).
- **Permission tiers**: owner and member are distinguished.
  - owner: the person who created the circle, who can invite/remove members and dissolve the circle, but — like members — can only edit/delete records they uploaded themselves.
  - member: can only add records, and can only edit/delete records **they uploaded themselves** — never anyone else's.
- **Invite method**: emailed invite links (requires an email-sending service, such as Supabase's built-in option or Resend).
- **Duplicate-receipt prevention**: suspected duplicates are auto-detected by matching store + date + total amount; when detected, the user is prompted to confirm either "yes, this is a duplicate, don't import" or "not a duplicate, continue importing."
- **Buyer field**: no extra input needed — it's automatically set to the current logged-in account's email as "who uploaded this record," which later allows per-person spending statistics.
