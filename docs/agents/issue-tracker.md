# Issue Tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One effort per directory: `.scratch/<effort-slug>/` — currently just `.scratch/grocery-receipt-tracker/` (the whole app is one effort, not split into many)
- The spec is `.scratch/<effort-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<effort-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md`)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- **Repo-specific**: each issue file carries a `GitHub: #NN` header line pointing at its mirror on GitHub, and the GitHub copy opens with a `Mirrors …/NN-slug.md (local ticket NN)` line pointing back. See "GitHub mirror" below — the two numbers are *not* the same number.
- **Repo-specific**: every planning doc (`spec.md`, each `issues/NN-*.md`) is one bilingual file — English original, a `---` rule with a `> **中文版**` marker, then the Chinese translation. The `Type:`/`Status:`/`GitHub:` header sits once at the top and covers both halves. See CLAUDE.md's "Doc language convention"; keep the two halves in sync when creating or editing either.

## GitHub mirror

The local files are canonical; `chenyujiang/grocery-receipt-tracker` carries a mirror of each one. **The numbers do not match, and cannot be made to match**: GitHub issues and pull requests share one number sequence, PR #1 was opened before the local tickets were imported, so local `01`–`22` landed as GitHub `#2`–`#23`.

**GitHub number = local number + 1.** Don't rely on that arithmetic — read the `GitHub: #NN` line in the file, which is authoritative and survives any future gap (a new PR consuming a number will shift the offset again for tickets filed after it).

Renumbering the local files to close the gap was considered and rejected: ~75 `issue NN` references across ~37 source, migration, and doc files cite the local numbers, and every existing commit message would permanently disagree with the new ones.

When filing a new ticket, create the local file first, then the GitHub mirror, then write each one's number into the other.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<effort-slug>/issues/` (creating the directory if needed), with both language halves in that one file.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
