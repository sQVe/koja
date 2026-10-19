---
'koja': minor
---

Start each pane's shell with `KOJA_SOCKET_PATH`, `KOJA_PANE_ID`, `KOJA_TAB_ID`, `KOJA_WORKSPACE_ID`,
and related variables. Inside a pane, `koja` commands reach that pane's server without `--socket`.
`--socket` still wins. `koja` takes no default pane or workspace from the pane it runs in.
