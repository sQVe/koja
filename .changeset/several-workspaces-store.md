---
'koja': minor
---

Run several workspaces from the CLI. The server now starts with no workspace.
`koja workspace list|create|focus|rename|close` and `koja pane list` manage workspaces and panes,
and every command has a `--json` form. `koja pane read` and `koja pane send` take `--pane <id>` to
reach a pane in a workspace that is not focused. A pane that exits closes its tab and workspace, and
the server keeps running with none. A terminal client gets rows only from the focused workspace's
pane. The terminal client draws the focused workspace's pane, switches to another pane's current
screen when focus changes, and shows an empty screen with a `koja workspace create <dir>` hint when
no workspace is open.
