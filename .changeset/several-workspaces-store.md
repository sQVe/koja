---
'phi': minor
---

Run several workspaces from the CLI. The server now starts with no workspace.
`phi workspace list|create|focus|rename|close` and `phi pane list` manage workspaces and panes, and
every command has a `--json` form. `phi pane read` and `phi pane send` take `--pane <id>` to reach a
pane in a workspace that is not focused. A pane that exits closes its tab and workspace, and the
server keeps running with none. A terminal client gets rows only from the focused workspace's pane.
