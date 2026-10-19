---
'koja': minor
---

Add `koja tab list`, `koja tab create [--workspace <id>]`, `koja tab focus <id>`, and
`koja tab close <id>`. A new tab starts one pane in the workspace root and becomes the active tab.
Closing the active tab activates its neighbor, and closing the last tab closes the workspace. All
commands support `--socket` and `--json`.
