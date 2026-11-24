---
'koja': patch
---

Keep a trailing space in a git path. Koja trimmed the last space from every path git printed, so a
checkout folder such as `checkout ` was read with a shortened worktree path and a worktree key that
did not match the folder.
