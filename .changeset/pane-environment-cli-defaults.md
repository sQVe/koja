---
'phi': minor
---

Start each pane's shell with `PHI_SOCKET_PATH`, `PHI_PANE_ID`, `PHI_TAB_ID`, `PHI_WORKSPACE_ID`, and
related variables. Inside a pane, `phi` commands reach that pane's server without `--socket`.
`--socket` still wins. `phi` takes no default pane or workspace from the pane it runs in.
