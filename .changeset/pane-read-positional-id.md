---
'koja': minor
---

Take the pane id of `koja pane read` as an argument: `koja pane read <id>`. The command no longer
reads the focused pane when it has no id, and it refuses `--pane`. `koja pane send` keeps `--pane`.
