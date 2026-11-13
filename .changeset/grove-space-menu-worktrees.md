---
'koja': minor
---

Run Grove for the space menu's New worktree and Remove worktree, so new worktrees land in the
space's Grove workspace instead of `~/.herdr/worktrees`. Remove asks first only when the worktree
has uncommitted changes or an agent runs in its space, and passes `--force` to Grove only after you
confirm. A clean worktree without an agent is removed at once. Grove's error text shows in the
dialog. Open worktree still opens Herdr's dialog.
