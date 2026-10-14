---
'phi': minor
---

Keep a restored pane in the layout when its saved folder is gone or its shell fails to start. The
pane shows its error where the terminal would be, and `phi pane list` shows the lifecycle `failed`
and a `restore_error`. Close it with `phi pane close`. Restore the folder and restart the server to
start it again.
