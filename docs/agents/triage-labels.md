# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| --------------------------- | --------------------- | ----------------------------------------- |
| `needs-triage`               | `needs-triage`         | Maintainer needs to evaluate this issue   |
| `needs-info`                 | `needs-info`           | Waiting on reporter for more information  |
| `ready-for-agent`            | `ready-for-agent`      | Fully specified, ready for an AFK agent   |
| `ready-for-human`            | `ready-for-human`      | Requires human implementation             |
| `wontfix`                    | `wontfix`              | Will not be actioned                      |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

These all exist as real GitHub labels on the repo, alongside `wayfinder:map` / `wayfinder:<type>`
for `/wayfinder`. `wontfix` is GitHub's built-in label; the other four were created for this
repo. If you add a label here, create it with `gh label create` too, or `gh issue edit --add-label`
will fail.
