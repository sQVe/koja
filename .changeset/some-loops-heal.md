---
'koja': patch
---

Wait for the exact mock scene ready line before capturing, run each capture under its sandbox lock,
and publish capture files only after all three exist. A scene writes its ready line only after the
frame that draws it has run, so a capture no longer shoots the picker or an empty frame. The
worktree dialog asks about closing a space only when an agent it has not warned about is running,
and closes the space directly once that agent has stopped.
