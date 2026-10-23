# Worktrees

Agents (implementer subagents, verification runs) work in linked git worktrees under `.claude/worktrees/`, which `.gitignore` keeps out of `git status`.

## Creating one

- A branch can be checked out in only one worktree. If `main`'s checkout is on the branch you want, `git worktree add` fails with `is already used by worktree`: branch off it (`-b new-branch <branch>`) or use `--detach` instead.
- `.env.local` isn't in a new worktree. Run tests there with dummy `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Run `npm ci` inside the worktree rather than linking the main checkout's `node_modules` in. A junction removed by a recursive delete (`git worktree remove --force`, `rm -rf`) takes its target's contents with it: this once emptied the main `node_modules`.

## Cleaning up

Run `sh scripts/clean-worktrees.sh` from Git Bash, from any checkout. For each worktree under `.claude/worktrees/` it:

- keeps it if it has uncommitted changes;
- unlinks a `node_modules` junction as a link first, and keeps the worktree if that fails;
- removes it with plain `git worktree remove`, never `--force`;
- deletes its branch only if `main` already contains it, and lists the rest.

It exits non-zero when it kept anything, naming what and why. `Permission denied` on removal means a process (a shell whose working directory is inside, vitest, an editor) still holds the worktree: close it and rerun. An unmerged branch is a human's call: merge it, or delete it with `git branch -D` once you've checked nothing on it is wanted.
