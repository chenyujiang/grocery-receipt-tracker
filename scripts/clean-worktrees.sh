#!/bin/sh
# Remove every linked worktree under .claude/worktrees/ and the branches they
# leave behind, without the ways this has gone wrong before on Windows (see
# docs/agents/worktrees.md). Run from Git Bash: `sh scripts/clean-worktrees.sh`.
#
# Never forces anything: a dirty worktree or an unmerged branch is reported
# and kept, for a human to decide.
set -u

main=$(git rev-parse --show-toplevel) || exit 1
cd "$main" || exit 1
git worktree prune

kept=0
removed_branches=""

for wt in $(git worktree list --porcelain | sed -n 's/^worktree //p'); do
  case "$wt" in
    */.claude/worktrees/*) ;;
    *) continue ;;
  esac
  branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD)

  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    echo "keep  $wt: uncommitted changes"
    kept=1
    continue
  fi

  # A node_modules junction into the main checkout must go first, and only as
  # a link: removing the worktree recursively would empty the main copy.
  if [ -L "$wt/node_modules" ]; then
    cmd //c rmdir "$(cygpath -w "$wt/node_modules")"
    if [ -e "$wt/node_modules" ]; then
      echo "keep  $wt: node_modules junction would not unlink"
      kept=1
      continue
    fi
  fi

  if git worktree remove "$wt"; then
    echo "gone  $wt"
    [ -n "$branch" ] && removed_branches="$removed_branches $branch"
  else
    # "Permission denied" here is a process (a shell, vitest, an editor)
    # still holding a file or its working directory inside the worktree.
    echo "keep  $wt: close whatever has it open, then rerun"
    kept=1
  fi
done

git worktree prune

# Only branches already merged into main; `-d` refuses the rest.
for branch in $removed_branches; do
  if git merge-base --is-ancestor "$branch" main; then
    git branch -d "$branch"
  else
    echo "keep  branch $branch: not merged into main"
    kept=1
  fi
done

git worktree list
exit $kept
