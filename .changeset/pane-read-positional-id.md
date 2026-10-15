---
'phi': minor
---

Take the pane id of `phi pane read` as an argument: `phi pane read <id>`. The command no longer
reads the focused pane when it has no id, and it refuses `--pane`. `phi pane send` keeps `--pane`.
