---
'phi': minor
---

The server saves its workspaces, tabs, splits, zoom, and focus after every change and on stop, and
restores them on its next start on the same socket path. Each pane starts a new shell in its
workspace root. A save file that is broken or from a newer version is logged, and the server starts
with no workspace.
