---
'phi': minor
---

Add `phi tab list`, `phi tab create [--workspace <id>]`, `phi tab focus <id>`, and
`phi tab close <id>`. A new tab starts one pane in the workspace root and becomes the active tab.
Closing the active tab activates its neighbor, and closing the last tab closes the workspace. All
commands support `--socket` and `--json`.
