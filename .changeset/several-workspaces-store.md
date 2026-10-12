---
'phi': minor
---

Model several workspaces in the server state. The server now starts with no workspace and answers
requests to create, focus, rename, and close workspaces. A pane that exits closes its tab and
workspace, and the server keeps running with none. A terminal client gets rows only from the focused
workspace's pane.
